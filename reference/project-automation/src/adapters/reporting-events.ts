import type { AutomationPlan } from '../types.js';

export class ReportingPlanEventPublisher {
  constructor(private readonly baseUrl: string, private readonly token: string, private readonly fetchImpl: typeof fetch = fetch) {}
  async publish(plan: AutomationPlan): Promise<void> {
    try {
      const response = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, '')}/v1/workflow/events`, {
        method: 'POST',
        headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          schema_version: 1,
          event_id: `phase5:${plan.plan_id}:${plan.state}`,
          aggregate_type: 'project_plan',
          aggregate_id: plan.plan_id,
          event_type: plan.state.toLowerCase(),
          occurred_at: plan.updated_at,
          payload: { jira_issue_key: plan.request.jira_issue_key, kind: plan.request.kind, evidence_ref: plan.plan_id },
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      console.error(JSON.stringify({ service: 'project-automation', event: 'reporting_event_failed', plan_id: plan.plan_id, error: error instanceof Error ? error.message : 'delivery failed' }));
    }
  }
}
