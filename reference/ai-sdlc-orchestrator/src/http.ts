import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { JiraIntakeService } from './intake.js';
import type { AiSdlcOrchestrator } from './orchestrator.js';
import type { IntakeEvent } from './types.js';

export interface Phase4HttpServerConfig {
  apiToken?: string;
}

export function createPhase4HttpServer(
  config: Phase4HttpServerConfig,
  intake: JiraIntakeService,
  orchestrator: AiSdlcOrchestrator,
): Server {
  return createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/healthz') {
        writeJson(res, 200, { status: 'ok' });
        return;
      }

      const url = new URL(req.url ?? '/', 'http://phase4.internal');
      const jobMatch = url.pathname.match(/^\/v1\/jobs\/([^/]+)$/);
      if (req.method === 'GET' && jobMatch?.[1]) {
        if (!authorized(req, config.apiToken)) return writeJson(res, 401, { error: 'unauthorized' });
        const job = await orchestrator.getJob(decodeURIComponent(jobMatch[1]));
        writeJson(res, job ? 200 : 404, job ?? { error: 'job_not_found' });
        return;
      }
      const jobActionMatch = url.pathname.match(/^\/v1\/jobs\/([^/]+)\/(cancel|retry)$/);
      if (req.method === 'POST' && jobActionMatch?.[1] && jobActionMatch[2]) {
        if (!authorized(req, config.apiToken)) return writeJson(res, 401, { error: 'unauthorized' });
        const jobId = decodeURIComponent(jobActionMatch[1]);
        const job = await orchestrator.getJob(jobId);
        if (!job) return writeJson(res, 404, { error: 'job_not_found' });
        if (jobActionMatch[2] === 'cancel') return writeJson(res, 200, await orchestrator.cancelJob(jobId));
        const event: IntakeEvent = { schema_version: 1, event_id: `retry:${jobId}:${Date.now()}`, occurred_at: new Date().toISOString(), issue_key: job.jira_issue_key, event_type: 'manual_trigger', work_type: job.work_type, trigger_reason: `Authorized retry of ${jobId}.`, plan_approved: job.work_type === 'new_module' };
        await intake.ingest(event); return writeJson(res, 202, { accepted: true, event_id: event.event_id });
      }

      if (req.method === 'POST' && url.pathname === '/v1/handoffs/phase5') {
        if (!authorized(req, config.apiToken)) return writeJson(res, 401, { error: 'unauthorized' });
        const body = JSON.parse(await readBody(req)) as Record<string, unknown>;
        if (body.schema_version !== 1 || typeof body.plan_id !== 'string' || typeof body.jira_issue_key !== 'string' || body.work_type !== 'new_module') {
          return writeJson(res, 400, { error: 'invalid_phase5_handoff' });
        }
        const event: IntakeEvent = {
          schema_version: 1,
          event_id: `phase5:${body.plan_id}`,
          occurred_at: new Date().toISOString(),
          issue_key: body.jira_issue_key,
          event_type: 'manual_trigger',
          work_type: 'new_module',
          component: typeof body.component === 'string' ? body.component : null,
          trigger_reason: `Approved Phase 5 handoff ${body.plan_id}.`,
          plan_approved: true,
        };
        await intake.ingest(event);
        writeJson(res, 202, { accepted: true, event_id: event.event_id });
        return;
      }

      writeJson(res, 404, { error: 'not_found' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const badRequest = error instanceof SyntaxError || /required|invalid|too large|unsupported/i.test(message);
      writeJson(res, badRequest ? 400 : 500, { error: badRequest ? 'invalid_request' : 'internal_error', message: badRequest ? message : 'Request failed unexpectedly.' });
    }
  });
}

function authorized(req: IncomingMessage, token?: string): boolean {
  return Boolean(token && token.length >= 16 && req.headers.authorization === `Bearer ${token}`);
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 1024 * 1024) throw new Error('Request body too large.');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function writeJson(res: ServerResponse, status: number, value: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(value));
}
