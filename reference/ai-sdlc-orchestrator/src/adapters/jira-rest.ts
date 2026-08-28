import type { JiraSyncPort } from '../ports.js';
import type { AiSdlcJob, JobState } from '../types.js';

export interface JiraRestAdapterConfig {
  baseUrl: string;
  authorization: string;
  statusNamesByCanonicalState?: Partial<Record<JobState, string>>;
  statusNamesByProject?: Record<string, Partial<Record<JobState, string>>>;
  strictTransitions?: boolean;
}

export interface JiraPollingIssue {
  key: string;
  id?: string;
  fields: {
    summary: string;
    updated?: string;
    issuetype?: { name?: string };
    assignee?: { accountId?: string } | null;
    project?: { key?: string };
    [field: string]: unknown;
  };
}

export class JiraRestAdapter implements JiraSyncPort {
  constructor(
    private readonly config: JiraRestAdapterConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async searchIssues(jql: string, fields: string[]): Promise<JiraPollingIssue[]> {
    const response = await this.fetchImpl(
      `${this.config.baseUrl.replace(/\/$/, '')}/rest/api/3/search/jql`,
      {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ jql, fields, maxResults: 100 }),
      },
    );
    if (!response.ok) throw new Error(`Jira search failed with HTTP ${response.status}.`);
    const data = await response.json() as { issues?: JiraPollingIssue[] };
    return data.issues ?? [];
  }

  async getIssue(issueKey: string) {
    const url = `${this.config.baseUrl.replace(/\/$/, '')}/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=summary,description,status,issuetype,project`;
    const response = await this.fetchImpl(url, { headers: this.headers() });
    if (!response.ok) throw new Error(`Jira get issue failed with HTTP ${response.status}.`);
    const data = await response.json() as {
      key: string;
      fields: {
        summary: string;
        description?: unknown;
        status?: { name?: string };
        issuetype?: { name?: string };
        project?: { key?: string };
      };
    };
    return {
      issueKey: data.key,
      summary: data.fields.summary,
      description: textFromJiraDocument(data.fields.description),
      status: data.fields.status?.name ?? null,
      issueType: data.fields.issuetype?.name ?? null,
      projectKey: data.fields.project?.key ?? null,
    };
  }

  async sync(input: {
    issueKey: string;
    job: AiSdlcJob;
    message: string;
    desiredCanonicalState?: JobState;
  }): Promise<void> {
    await this.addComment(input.issueKey, input.message, input.job);
    if (!input.desiredCanonicalState) return;

    const current = await this.getIssue(input.issueKey);
    const projectMapping = current.projectKey
      ? this.config.statusNamesByProject?.[current.projectKey]
      : undefined;
    const desiredStatus = projectMapping?.[input.desiredCanonicalState]
      ?? this.config.statusNamesByCanonicalState?.[input.desiredCanonicalState];
    if (!desiredStatus) return;
    if (current.status?.toLowerCase() === desiredStatus.toLowerCase()) return;

    const transitionId = await this.findTransitionToStatus(input.issueKey, desiredStatus);
    if (!transitionId) {
      if (this.config.strictTransitions) {
        throw new Error(`Jira has no available transition to status '${desiredStatus}' for ${input.issueKey}.`);
      }
      return;
    }

    const response = await this.fetchImpl(
      `${this.config.baseUrl.replace(/\/$/, '')}/rest/api/3/issue/${encodeURIComponent(input.issueKey)}/transitions`,
      {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ transition: { id: transitionId } }),
      },
    );
    if (!response.ok && response.status !== 409 && this.config.strictTransitions) {
      throw new Error(`Jira transition failed with HTTP ${response.status}.`);
    }
  }

  private async findTransitionToStatus(issueKey: string, desiredStatus: string): Promise<string | null> {
    const response = await this.fetchImpl(
      `${this.config.baseUrl.replace(/\/$/, '')}/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions?expand=transitions.fields`,
      { headers: this.headers() },
    );
    if (!response.ok) {
      if (this.config.strictTransitions) {
        throw new Error(`Jira transition lookup failed with HTTP ${response.status}.`);
      }
      return null;
    }
    const data = await response.json() as {
      transitions?: Array<{ id: string; to?: { name?: string } }>;
    };
    return data.transitions?.find(
      (transition) => transition.to?.name?.toLowerCase() === desiredStatus.toLowerCase(),
    )?.id ?? null;
  }

  private async addComment(issueKey: string, message: string, job: AiSdlcJob): Promise<void> {
    const body = `${message}\n\nAI SDLC Job: ${job.job_id}\nState: ${job.state}`;
    const response = await this.fetchImpl(
      `${this.config.baseUrl.replace(/\/$/, '')}/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`,
      {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          body: {
            version: 1,
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: body }],
              },
            ],
          },
        }),
      },
    );
    if (!response.ok) throw new Error(`Jira comment sync failed with HTTP ${response.status}.`);
  }

  private headers(): Record<string, string> {
    return {
      authorization: this.config.authorization,
      accept: 'application/json',
      'content-type': 'application/json',
    };
  }
}

function textFromJiraDocument(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return null;
  const document = value as { content?: unknown[]; text?: unknown };
  if (typeof document.text === 'string') return document.text;
  return (document.content ?? []).map((item) => textFromJiraDocument(item)).filter(Boolean).join(' ').trim() || null;
}
