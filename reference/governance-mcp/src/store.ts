import { createHash, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { sanitize, safe } from './sanitize.js';
import type { AiSdlcJob, PendingAction, RpaEvent, WorkflowEvent } from './types.js';

// One store for what used to be four per-service schemas. Idempotency and
// dedup keys are preserved exactly: they are correctness, not style.

export class GovernanceStore {
  constructor(private readonly pool: Pool) {}

  // --- AI SDLC jobs ---

  async findJob(jobId: string): Promise<AiSdlcJob | null> {
    const result = await this.pool.query<{ payload: AiSdlcJob }>(
      'SELECT payload FROM ai_sdlc_jobs WHERE job_id=$1',
      [jobId],
    );
    return result.rows[0]?.payload ?? null;
  }

  async findJobByIntakeEvent(eventId: string): Promise<AiSdlcJob | null> {
    const result = await this.pool.query<{ payload: AiSdlcJob }>(
      'SELECT payload FROM ai_sdlc_jobs WHERE intake_event_id=$1',
      [eventId],
    );
    return result.rows[0]?.payload ?? null;
  }

  async findJobsByState(state: string): Promise<AiSdlcJob[]> {
    const result = await this.pool.query<{ payload: AiSdlcJob }>(
      'SELECT payload FROM ai_sdlc_jobs WHERE state=$1 ORDER BY updated_at DESC LIMIT 100',
      [state],
    );
    return result.rows.map((row) => row.payload);
  }

  async saveJob(job: AiSdlcJob): Promise<void> {
    await this.pool.query(
      `INSERT INTO ai_sdlc_jobs(job_id,intake_event_id,jira_issue_key,state,payload,created_at,updated_at)
       VALUES($1,$2,$3,$4,$5::jsonb,$6,now())
       ON CONFLICT(job_id) DO UPDATE SET state=EXCLUDED.state,payload=EXCLUDED.payload,updated_at=now()`,
      [job.job_id, job.intake_event_id, job.jira_issue_key, job.state, JSON.stringify(job), job.created_at],
    );
  }

  // --- Human-confirmed actions ---

  async findAction(actionId: string): Promise<PendingAction | null> {
    const result = await this.pool.query<{ payload: PendingAction }>(
      'SELECT payload FROM workflow_actions WHERE action_id=$1',
      [actionId],
    );
    return result.rows[0]?.payload ?? null;
  }

  async findActionByIdempotencyKey(key: string): Promise<PendingAction | null> {
    const result = await this.pool.query<{ payload: PendingAction }>(
      'SELECT payload FROM workflow_actions WHERE idempotency_key=$1',
      [key],
    );
    return result.rows[0]?.payload ?? null;
  }

  async saveAction(action: PendingAction): Promise<void> {
    await this.pool.query(
      `INSERT INTO workflow_actions(action_id,idempotency_key,status,payload,created_at,updated_at)
       VALUES($1,$2,$3,$4::jsonb,$5,now())
       ON CONFLICT(action_id) DO UPDATE SET status=EXCLUDED.status,payload=EXCLUDED.payload,updated_at=now()`,
      [action.action_id, action.idempotency_key, action.status, JSON.stringify(action), action.created_at],
    );
  }

  // --- Phase 5 plans ---

  async findPlan(planId: string): Promise<any | null> {
    const result = await this.pool.query<{ payload: any }>(
      'SELECT payload FROM project_automation_plans WHERE plan_id=$1',
      [planId],
    );
    return result.rows[0]?.payload ?? null;
  }

  async findPlanByRequest(requestId: string): Promise<any | null> {
    const result = await this.pool.query<{ payload: any }>(
      'SELECT payload FROM project_automation_plans WHERE request_id=$1',
      [requestId],
    );
    return result.rows[0]?.payload ?? null;
  }

  async savePlan(plan: { plan_id: string; request: { request_id: string }; state: string; created_at: string }): Promise<void> {
    await this.pool.query(
      `INSERT INTO project_automation_plans(plan_id,request_id,state,payload,created_at,updated_at)
       VALUES($1,$2,$3,$4::jsonb,$5,now())
       ON CONFLICT(plan_id) DO UPDATE SET state=EXCLUDED.state,payload=EXCLUDED.payload,updated_at=now()`,
      [plan.plan_id, plan.request.request_id, plan.state, JSON.stringify(plan), plan.created_at],
    );
  }

  // --- Phase 6 learning ---

  async findLearning(type: string, id: string): Promise<any | null> {
    const result = await this.pool.query<{ payload: any }>(
      'SELECT payload FROM hermes_learning_records WHERE record_type=$1 AND record_id=$2',
      [type, id],
    );
    return result.rows[0]?.payload ?? null;
  }

  async saveLearning(type: string, id: string, payload: unknown): Promise<void> {
    await this.pool.query(
      `INSERT INTO hermes_learning_records(record_type,record_id,payload)
       VALUES($1,$2,$3::jsonb)
       ON CONFLICT(record_type,record_id) DO UPDATE SET payload=EXCLUDED.payload,updated_at=now()`,
      [type, id, JSON.stringify(payload)],
    );
  }

  async audit(subjectType: string, subjectId: string, action: string, actorId: string, details: unknown = {}): Promise<void> {
    await this.pool.query(
      `INSERT INTO hermes_learning_audit(event_id,subject_type,subject_id,action,actor_id,occurred_at,details)
       VALUES($1,$2,$3,$4,$5,now(),$6::jsonb)`,
      [randomUUID(), subjectType, subjectId, action, actorId, JSON.stringify(sanitize(details))],
    );
  }

  async auditToolCall(input: {
    jobId: string | null;
    toolName: string;
    scope: unknown;
    decision: 'allow' | 'deny';
    evidenceRef?: string | null;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO mcp_tool_audit(event_id,job_id,tool_name,scope,decision,evidence_ref)
       VALUES($1,$2,$3,$4::jsonb,$5,$6)`,
      [
        randomUUID(),
        input.jobId,
        input.toolName,
        JSON.stringify(sanitize(input.scope ?? {})),
        input.decision,
        input.evidenceRef ?? null,
      ],
    );
  }

  // --- Reporting ---

  async ingestRpaEvent(event: RpaEvent, alertTarget: string): Promise<{ accepted: true; duplicate: boolean; event_id: string }> {
    const inserted = await this.pool.query(
      `INSERT INTO rpa_run_events(event_id,run_id,bot_id,project_id,environment,event_type,occurred_at,payload)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb) ON CONFLICT(event_id) DO NOTHING RETURNING event_id`,
      [
        event.event_id, event.run_id, event.bot_id, event.project_id,
        event.environment, event.event_type, event.occurred_at, JSON.stringify(sanitize(event)),
      ],
    );

    // Hourly dedup window so a flapping bot cannot spam the alert channel.
    if (inserted.rowCount && event.event_type === 'failed' && event.environment === 'prod') {
      const window = new Date(event.occurred_at).toISOString().slice(0, 13);
      const id = `alert:${hash(`${event.bot_id}:${event.environment}:${event.error?.code ?? 'UNKNOWN'}:${window}`)}`;
      const message = `RPA critical failure\nBot: ${event.bot_id}\nEnvironment: prod\nCode: ${safe(event.error?.code ?? 'UNKNOWN')}\nCorrelation: ${event.event_id}`;
      await this.enqueueNotification(id, alertTarget, message);
    }
    return { accepted: true, duplicate: inserted.rowCount === 0, event_id: event.event_id };
  }

  async ingestWorkflowEvent(event: WorkflowEvent, alertTarget: string): Promise<{ accepted: true; duplicate: boolean; event_id: string }> {
    const clean = sanitize(event);
    const inserted = await this.pool.query(
      `INSERT INTO workflow_events(event_id,aggregate_type,aggregate_id,event_type,occurred_at,payload)
       VALUES($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT(event_id) DO NOTHING RETURNING event_id`,
      [event.event_id, event.aggregate_type, event.aggregate_id, event.event_type, event.occurred_at, JSON.stringify(clean.payload)],
    );
    if (inserted.rowCount) {
      const evidence =
        typeof clean.payload.evidence_ref === 'string' ? `\nEvidence: ${safe(clean.payload.evidence_ref)}` : '';
      await this.enqueueNotification(
        `workflow:${event.event_id}`,
        alertTarget,
        `${label(event.aggregate_type)} ${safe(event.event_type)}\nID: ${safe(event.aggregate_id)}${evidence}`,
      );
    }
    return { accepted: true, duplicate: inserted.rowCount === 0, event_id: event.event_id };
  }

  async metrics(from: string, to: string): Promise<Record<string, unknown>> {
    const rows = await this.pool.query<{ event_type: string; count: string }>(
      'SELECT event_type,count(*)::text count FROM rpa_run_events WHERE occurred_at >= $1 AND occurred_at < $2 GROUP BY event_type',
      [from, to],
    );
    const counts = Object.fromEntries(rows.rows.map((r) => [r.event_type, Number(r.count)]));
    const terminal =
      (counts.completed ?? 0) + (counts.failed ?? 0) + (counts.cancelled ?? 0) + (counts.skipped ?? 0);
    return {
      schema_version: 1,
      from,
      to,
      timezone: 'Asia/Bangkok',
      counts,
      success_rate: terminal ? Number((((counts.completed ?? 0) / terminal) * 100).toFixed(2)) : 0,
    };
  }

  // --- Outbox ---

  async enqueueNotification(id: string, targetId: string, message: string): Promise<{ enqueued: boolean; id: string }> {
    const result = await this.pool.query(
      'INSERT INTO notification_outbox(id,target_id,message) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING RETURNING id',
      [id, targetId, safe(message)],
    );
    return { enqueued: result.rowCount === 1, id };
  }
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 24);
}

function label(value: WorkflowEvent['aggregate_type']): string {
  return value === 'ai_sdlc_job' ? 'AI SDLC job' : value === 'project_plan' ? 'Project plan' : 'Deployment';
}
