import type { QueuePort } from './ports.js';
import type { IntakeEvent } from './types.js';

export class JiraIntakeService {
  constructor(private readonly queue: QueuePort) {}

  async ingest(event: IntakeEvent): Promise<void> {
    validateIntakeEvent(event);
    await this.queue.enqueue(event);
  }
}

export function validateIntakeEvent(event: IntakeEvent): void {
  if (event.schema_version !== 1) throw new Error('Unsupported intake schema version.');
  if (!event.event_id?.trim()) throw new Error('event_id is required.');
  if (!/^[A-Z][A-Z0-9_]+-[0-9]+$/.test(event.issue_key)) throw new Error('Invalid Jira issue key.');
  if (!event.occurred_at || Number.isNaN(Date.parse(event.occurred_at))) throw new Error('occurred_at must be an ISO date-time.');
}
