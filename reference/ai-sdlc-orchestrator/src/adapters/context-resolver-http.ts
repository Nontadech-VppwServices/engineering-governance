import type { ContextResolverPort } from '../ports.js';
import type { EffectiveContextView, IntakeEvent } from '../types.js';

export class ContextResolverHttpAdapter implements ContextResolverPort {
  constructor(
    private readonly baseUrl: string,
    private readonly authorization?: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async resolve(input: {
    requestId: string;
    jiraIssueKey: string;
    workType: IntakeEvent['work_type'];
    component?: string | null;
  }): Promise<EffectiveContextView> {
    const response = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, '')}/v1/context/resolve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(this.authorization ? { authorization: this.authorization } : {}) },
      body: JSON.stringify({
        schema_version: 1,
        request_id: input.requestId,
        jira_issue_key: input.jiraIssueKey,
        work_type: input.workType ?? null,
        component: input.component ?? null,
      }),
    });
    if (!response.ok) {
      throw new Error(`Context Resolver returned HTTP ${response.status}.`);
    }
    return (await response.json()) as EffectiveContextView;
  }
}
