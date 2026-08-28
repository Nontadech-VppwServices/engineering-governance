import type { Pool } from 'pg';
import type { JobStorePort } from '../ports.js';
import type { AiSdlcJob } from '../types.js';

export class PostgresJobStore implements JobStorePort {
  constructor(private readonly pool: Pool) {}

  async findByIntakeEventId(eventId: string): Promise<AiSdlcJob | null> {
    const result = await this.pool.query<{ payload: AiSdlcJob }>(
      'SELECT payload FROM ai_sdlc_jobs WHERE intake_event_id = $1 LIMIT 1',
      [eventId],
    );
    return result.rows[0]?.payload ?? null;
  }

  async findById(jobId: string): Promise<AiSdlcJob | null> {
    const result = await this.pool.query<{ payload: AiSdlcJob }>(
      'SELECT payload FROM ai_sdlc_jobs WHERE job_id = $1 LIMIT 1',
      [jobId],
    );
    return result.rows[0]?.payload ?? null;
  }

  async findByPullRequest(repository: string, prNumber: number): Promise<AiSdlcJob | null> {
    const result = await this.pool.query<{ payload: AiSdlcJob }>(
      `SELECT payload
         FROM ai_sdlc_jobs
        WHERE EXISTS (
          SELECT 1
            FROM jsonb_array_elements(payload->'prs') pr
           WHERE pr->>'repository' = $1
             AND (pr->>'number')::int = $2
        )
        ORDER BY updated_at DESC
        LIMIT 1`,
      [repository, prNumber],
    );
    return result.rows[0]?.payload ?? null;
  }

  async findByState(state: AiSdlcJob['state']): Promise<AiSdlcJob[]> {
    const result = await this.pool.query<{ payload: AiSdlcJob }>(
      'SELECT payload FROM ai_sdlc_jobs WHERE state = $1 ORDER BY updated_at ASC',
      [state],
    );
    return result.rows.map((row) => row.payload);
  }

  async save(job: AiSdlcJob): Promise<void> {
    await this.pool.query(
      `INSERT INTO ai_sdlc_jobs (
         job_id, intake_event_id, jira_issue_key, state, payload, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
       ON CONFLICT (job_id) DO UPDATE SET
         state = EXCLUDED.state,
         payload = EXCLUDED.payload,
         updated_at = EXCLUDED.updated_at`,
      [
        job.job_id,
        job.intake_event_id,
        job.jira_issue_key,
        job.state,
        JSON.stringify(job),
        job.created_at,
        job.updated_at,
      ],
    );
  }
}
