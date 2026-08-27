import type { JiraSyncPort } from '../ports.js';
import type { AiSdlcJob, JobState } from '../types.js';

export interface JiraRestAdapterConfig {
  baseUrl: string;
  authorization: string;
  transitionIdsByCanonicalState?: Partial<Record<JobState, string>>;
}

export class JiraRestAdapter implements JiraSyncPort {
  constructor(
    private readonly config: JiraRestAdapterConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async getIssue(issueKey: string) {
    const url = `${this.config.baseUrl.replace(/\/$/, '')}/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=summary,status,issuetype`;
    const response = await this.fetchImpl(url, { headers: this.headers() });
    if (!response.ok) throw new Error(`Jira get issue failed with HTTP ${response.status}.`);
    const data = await response.json() as {
      key: string;
      fields: { summary: string; status?: { name?: string }; issuetype?: { name?: string } };
    };
    return {
      issueKey: data.key,
      summary: data.fields.summary,
      status: data.fields.status?.name ?? null,
      issueType: data.fields.issuetype?.name ?? null,
    };
  }

  async sync(input: {
    issueKey: string;
    job: AiSdlcJob;
    message: string;
    desiredCanonicalState?: JobState;
  }): Promise<void> {
    await this.addComment(input.issueKey, input.message, input.job);
    const transitionId = input.desiredCanonicalState
      ? this.config.transitionIdsByCanonicalState?.[input.desiredCanonicalState]
      : undefined;
    if (transitionId) {
      const response = await this.fetchImpl(
        `${this.config.baseUrl.replace(/\/$/, '')}/rest/api/3/issue/${encodeURIComponent(input.issueKey)}/transitions`,
        {
          method: 'POST',
          headers: this.headers(),
          body: JSON.stringify({ transition: { id: transitionId } }),
        },
      );
      if (!response.ok && response.status !== 409) {
        throw new Error(`Jira transition failed with HTTP ${response.status}.`);
      }
    }
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
