import { createHmac, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { JiraIntakeService } from './intake.js';
import { normalizeJiraWebhook, type JiraWebhookNormalizerConfig } from './jira-webhook.js';
import type { AiSdlcOrchestrator } from './orchestrator.js';
import type { IntakeEvent, PullRequestMergedEvent } from './types.js';

export interface Phase4HttpServerConfig {
  jiraSharedSecret: string;
  githubWebhookSecret: string;
  jiraWebhook?: JiraWebhookNormalizerConfig;
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

      if (req.method === 'POST' && req.url === '/webhooks/jira') {
        if (req.headers['x-ai-sdlc-webhook-secret'] !== config.jiraSharedSecret) {
          writeJson(res, 401, { error: 'invalid_webhook_secret' });
          return;
        }
        const raw = await readBody(req);
        const payload = JSON.parse(raw) as unknown;
        const event = isNormalizedIntakeEvent(payload)
          ? payload
          : normalizeJiraWebhook(payload, config.jiraWebhook, {
              webhookIdentifier: headerValue(req.headers['x-atlassian-webhook-identifier']),
              receivedAt: new Date().toISOString(),
            });
        if (!event) {
          writeJson(res, 202, { accepted: false, ignored: true });
          return;
        }
        await intake.ingest(event);
        writeJson(res, 202, { accepted: true, event_id: event.event_id });
        return;
      }

      if (req.method === 'POST' && req.url === '/webhooks/github') {
        const raw = await readBody(req);
        const signature = String(req.headers['x-hub-signature-256'] ?? '');
        if (!verifyGithubSignature(raw, signature, config.githubWebhookSecret)) {
          writeJson(res, 401, { error: 'invalid_github_signature' });
          return;
        }
        if (req.headers['x-github-event'] !== 'pull_request') {
          writeJson(res, 202, { ignored: true });
          return;
        }
        const payload = JSON.parse(raw) as {
          repository?: { full_name?: string };
          pull_request?: { number?: number; merged?: boolean; state?: string };
        };
        if (!payload.repository?.full_name || !payload.pull_request?.number) {
          writeJson(res, 400, { error: 'invalid_pull_request_payload' });
          return;
        }
        const event: PullRequestMergedEvent = {
          repository: payload.repository.full_name,
          pr_number: payload.pull_request.number,
          merged: Boolean(payload.pull_request.merged),
        };
        const job = await orchestrator.handlePullRequestMerged(event);
        writeJson(res, 200, { handled: Boolean(job), job_id: job?.job_id ?? null, state: job?.state ?? null });
        return;
      }

      writeJson(res, 404, { error: 'not_found' });
    } catch (error) {
      writeJson(res, 500, { error: 'internal_error', message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });
}

function isNormalizedIntakeEvent(payload: unknown): payload is IntakeEvent {
  if (!payload || typeof payload !== 'object') return false;
  const value = payload as Partial<IntakeEvent>;
  return value.schema_version === 1
    && typeof value.event_id === 'string'
    && typeof value.issue_key === 'string'
    && typeof value.event_type === 'string';
}

function headerValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function verifyGithubSignature(raw: string, signature: string, secret: string): boolean {
  if (!signature.startsWith('sha256=')) return false;
  const expected = `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
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
