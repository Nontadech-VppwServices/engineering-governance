import type { AiSdlcJob } from '../types.js';

export interface JobEventPublisher {
  publish(job: AiSdlcJob, message: string): Promise<void>;
}

export class CompositeJobEventPublisher implements JobEventPublisher {
  constructor(private readonly publishers: JobEventPublisher[]) {}
  async publish(job: AiSdlcJob, message: string): Promise<void> {
    await Promise.all(this.publishers.map((publisher) => publisher.publish(job, message)));
  }
}

export class ReportingEventAdapter implements JobEventPublisher {
  constructor(private readonly baseUrl: string, private readonly token: string, private readonly fetchImpl: typeof fetch = fetch) {}
  async publish(job: AiSdlcJob, message: string): Promise<void> {
    const response = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, '')}/v1/workflow/events`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        schema_version: 1,
        event_id: `phase4:${job.job_id}:${job.state}`,
        aggregate_type: 'ai_sdlc_job',
        aggregate_id: job.job_id,
        event_type: job.state.toLowerCase(),
        occurred_at: job.updated_at,
        payload: { jira_issue_key: job.jira_issue_key, work_type: job.work_type, evidence_ref: job.job_id, summary: sanitize(message) },
      }),
    });
    if (!response.ok) throw new Error(`Reporting rejected Phase 4 event with HTTP ${response.status}.`);
  }
}

function sanitize(value: string): string {
  return value.replace(/(password|token|secret)\s*[:=]\s*\S+/gi, '$1=<redacted>').slice(0, 2000);
}
