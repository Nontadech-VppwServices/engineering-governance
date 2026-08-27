import type { PendingAction } from './types.js';

export class ReportingActionEventPublisher {
  constructor(private readonly baseUrl: string, private readonly token: string, private readonly fetchImpl: typeof fetch = fetch) {}
  async publish(action: PendingAction): Promise<void> {
    if (!['request_deployment', 'request_rollback'].includes(action.type)) return;
    try {
      const response = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, '')}/v1/workflow/events`, {
        method: 'POST',
        headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          schema_version: 1,
          event_id: `deployment:${action.action_id}:${action.status}`,
          aggregate_type: 'deployment',
          aggregate_id: action.action_id,
          event_type: action.status.toLowerCase(),
          occurred_at: action.confirmed_at ?? action.created_at,
          payload: {
            repository: action.payload.repository,
            environment: action.payload.environment,
            ref: action.payload.ref,
            evidence_ref: action.action_id,
            result: action.result,
          },
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      console.error(JSON.stringify({ service: 'workflow-control', event: 'reporting_event_failed', action_id: action.action_id, error: error instanceof Error ? error.message : 'delivery failed' }));
    }
  }
}
