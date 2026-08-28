import { GovernanceError } from './types.js';
import type { JiraSnapshot } from './context.js';

// Ported from ai-sdlc-orchestrator/src/adapters/jira-rest.ts and
// workflow-control/src/executor.ts. This is the only place a Jira credential
// exists; Hermes never receives one.

export interface JiraConfig {
  baseUrl: string;
  authorization: string;
  componentFieldId?: string;
  workTypeFieldId?: string;
  statusMappings?: Record<string, Record<string, string>>;
  aiAssigneeAccountIds: string[];
  allowedProjectKeys: string[];
  primaryAssigneeAccountId: string;
}

export interface JiraIssue {
  issueKey: string;
  projectKey: string | null;
  summary: string;
  description: string | null;
  status: string | null;
  issueType: string | null;
  component: string | null;
}

export class JiraClient {
  constructor(
    private readonly config: JiraConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private headers(): Record<string, string> {
    return {
      authorization: this.config.authorization,
      accept: 'application/json',
      'content-type': 'application/json',
    };
  }

  private base(): string {
    return this.config.baseUrl.replace(/\/$/, '');
  }

  private async request(path: string, init: RequestInit = {}): Promise<any> {
    const response = await this.fetchImpl(`${this.base()}${path}`, { ...init, headers: this.headers() });
    if (response.status === 404) return null;
    if (!response.ok) throw new GovernanceError(`Jira returned HTTP ${response.status}.`, 502, 'JIRA_ERROR');
    if (response.status === 204) return { accepted: true };
    return response.json();
  }

  async getIssue(issueKey: string): Promise<JiraIssue | null> {
    const fields = ['summary', 'description', 'status', 'issuetype', 'project', 'components'];
    if (this.config.componentFieldId) fields.push(this.config.componentFieldId);
    const data = await this.request(
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=${fields.join(',')}`,
    );
    if (!data) return null;
    const custom = this.config.componentFieldId ? readValue(data.fields[this.config.componentFieldId]) : null;
    return {
      issueKey: data.key,
      projectKey: data.fields.project?.key ?? null,
      summary: data.fields.summary,
      description: textFromJiraDocument(data.fields.description),
      status: data.fields.status?.name ?? null,
      issueType: data.fields.issuetype?.name ?? null,
      component: data.fields.components?.[0]?.name ?? custom,
    };
  }

  async snapshot(issueKey: string): Promise<JiraSnapshot | null> {
    const issue = await this.getIssue(issueKey);
    if (!issue) return null;
    return {
      issueKey: issue.issueKey,
      projectKey: issue.projectKey ?? issueKey.split('-')[0] ?? '',
      summary: issue.summary,
      status: issue.status,
      issueType: issue.issueType,
      component: issue.component,
      retrievedAt: new Date().toISOString(),
    };
  }

  // Replaces the BullMQ polling worker. A Hermes scheduled task calls this;
  // the JQL and the project/assignee allowlist stay server-side.
  async listReadyIssues(lookbackMinutes: number): Promise<
    Array<{ issue_key: string; summary: string; updated: string; work_type: string | null; component: string | null; intake_event_id: string }>
  > {
    if (!this.config.allowedProjectKeys.length || !this.config.aiAssigneeAccountIds.length) return [];
    const projects = this.config.allowedProjectKeys.map(quote).join(',');
    const assignees = this.config.aiAssigneeAccountIds.map(quote).join(',');
    const jql = `project in (${projects}) AND assignee in (${assignees}) AND updated >= -${Math.max(1, lookbackMinutes)}m ORDER BY updated ASC`;
    const fields = ['summary', 'updated', 'issuetype', 'assignee', 'project', 'components'];
    if (this.config.componentFieldId) fields.push(this.config.componentFieldId);
    if (this.config.workTypeFieldId) fields.push(this.config.workTypeFieldId);

    const response = await this.fetchImpl(`${this.base()}/rest/api/3/search/jql`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ jql, fields, maxResults: 100 }),
    });
    if (!response.ok) {
      throw new GovernanceError(`Jira search failed with HTTP ${response.status}.`, 502, 'JIRA_ERROR');
    }
    const data = (await response.json()) as { issues?: any[] };

    return (data.issues ?? []).flatMap((issue) => {
      const updated = issue.fields?.updated;
      const project = issue.fields?.project?.key ?? issue.key.split('-')[0];
      const assignee = issue.fields?.assignee?.accountId;
      if (!updated || !project || !this.config.allowedProjectKeys.includes(project)) return [];
      if (!assignee || !this.config.aiAssigneeAccountIds.includes(assignee)) return [];
      return [
        {
          issue_key: issue.key,
          summary: issue.fields.summary,
          updated,
          work_type: normalizeWorkType(
            this.config.workTypeFieldId ? readValue(issue.fields[this.config.workTypeFieldId]) : null,
            issue.fields.issuetype?.name,
          ),
          component:
            issue.fields.components?.[0]?.name ??
            (this.config.componentFieldId ? readValue(issue.fields[this.config.componentFieldId]) : null),
          intake_event_id: `jira-poll:${issue.key}:${updated}`,
        },
      ];
    });
  }

  async addComment(issueKey: string, message: string): Promise<{ issue_key: string; commented: true }> {
    await this.request(`/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`, {
      method: 'POST',
      body: JSON.stringify({ body: adf(message) }),
    });
    return { issue_key: issueKey, commented: true };
  }

  async createIssue(input: {
    projectKey: string;
    summary: string;
    issueType: string;
    description?: string;
    workType?: string;
    requestedBy: string;
  }): Promise<unknown> {
    if (!this.config.allowedProjectKeys.includes(input.projectKey)) {
      throw new GovernanceError('Jira project is not permitted.', 403, 'FORBIDDEN');
    }
    const fields: Record<string, unknown> = {
      project: { key: input.projectKey },
      summary: input.summary,
      issuetype: { name: input.issueType },
      assignee: { accountId: this.config.primaryAssigneeAccountId },
      description: adf(input.description ?? ''),
    };
    if (this.config.workTypeFieldId && input.workType) {
      fields[this.config.workTypeFieldId] = { value: input.workType };
    }
    return this.request('/rest/api/3/issue', {
      method: 'POST',
      body: JSON.stringify({
        fields,
        properties: [{ key: 'ai_sdlc_requested_by', value: input.requestedBy }],
      }),
    });
  }

  async updateIssue(issueKey: string, patch: { summary?: string; description?: string }): Promise<unknown> {
    const fields: Record<string, unknown> = {};
    if (typeof patch.summary === 'string') fields.summary = patch.summary;
    if (typeof patch.description === 'string') fields.description = adf(patch.description);
    if (!Object.keys(fields).length) throw new GovernanceError('No permitted Jira fields supplied.');
    await this.request(`/rest/api/3/issue/${encodeURIComponent(issueKey)}`, {
      method: 'PUT',
      body: JSON.stringify({ fields }),
    });
    return { issue_key: issueKey, updated: true };
  }

  // Jira workflow state stays deterministic: the canonical job state maps to a
  // status name through ssot/jira-workflows, never through model output.
  async syncState(issueKey: string, canonicalState: string): Promise<{ transitioned: boolean }> {
    const issue = await this.getIssue(issueKey);
    if (!issue) throw new GovernanceError('Jira issue not found.', 404, 'NOT_FOUND');
    const desired =
      (issue.projectKey ? this.config.statusMappings?.[issue.projectKey]?.[canonicalState] : undefined) ??
      this.config.statusMappings?.['*']?.[canonicalState];
    if (!desired) return { transitioned: false };
    if (issue.status?.toLowerCase() === desired.toLowerCase()) return { transitioned: false };

    const data = await this.request(
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions?expand=transitions.fields`,
    );
    const transitionId = (data?.transitions ?? []).find(
      (t: any) => t.to?.name?.toLowerCase() === desired.toLowerCase(),
    )?.id;
    if (!transitionId) return { transitioned: false };

    await this.request(`/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`, {
      method: 'POST',
      body: JSON.stringify({ transition: { id: transitionId } }),
    });
    return { transitioned: true };
  }
}

function quote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export function adf(text: string) {
  return {
    version: 1,
    type: 'doc',
    content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }],
  };
}

export function readValue(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (!value || typeof value !== 'object') return null;
  const option = value as { value?: unknown; name?: unknown; key?: unknown };
  for (const candidate of [option.value, option.name, option.key]) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return null;
}

export function normalizeWorkType(value?: string | null, issueType?: string | null): string | null {
  const normalized = value?.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (normalized === 'bug' || normalized === 'bug_fix') return 'bug';
  if (normalized === 'new_module' || normalized === 'module') return 'new_module';
  if (normalized === 'new_project' || normalized === 'project') return 'new_project';
  if (normalized === 'analysis' || normalized === 'analysis_only') return 'analysis';
  return issueType?.trim().toLowerCase() === 'bug' ? 'bug' : null;
}

export function textFromJiraDocument(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return null;
  const document = value as { content?: unknown[]; text?: unknown };
  if (typeof document.text === 'string') return document.text;
  return (
    (document.content ?? [])
      .map((item) => textFromJiraDocument(item))
      .filter(Boolean)
      .join(' ')
      .trim() || null
  );
}
