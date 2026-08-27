import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { URL } from 'node:url';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { AutomationError, ProjectAutomationService } from './service.js';
import type { AutomationRequest } from './types.js';

export function createProjectAutomationHttpServer(service: ProjectAutomationService, apiToken: string, actorSigningSecret?: string): Server {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://project-automation.internal');
      if (req.method === 'GET' && url.pathname === '/healthz') return writeJson(res, 200, { status: 'ok' });
      if (!authorized(req, apiToken)) return writeJson(res, 401, { error: { code: 'UNAUTHORIZED', message: 'Bearer token is required.' } });
      if (req.method === 'POST' && url.pathname === '/v1/plans') return writeJson(res, 201, await service.createPlan(await readJson(req) as AutomationRequest));
      const match = url.pathname.match(/^\/v1\/plans\/([^/]+)(?:\/(approve|execute))?$/);
      if (match?.[1] && req.method === 'GET' && !match[2]) return writeJson(res, 200, await service.getPlan(decodeURIComponent(match[1])));
      if (match?.[1] && match[2] === 'approve' && req.method === 'POST') {
        const actorId = header(req, 'x-actor-id'); const actorType = header(req, 'x-actor-type');
        if (actorSigningSecret && !validActorSignature(req, url.pathname, actorId, actorType, actorSigningSecret)) return writeJson(res, 403, { error: { code: 'INVALID_ACTOR_SIGNATURE', message: 'Trusted actor signature is required.' } });
        return writeJson(res, 200, await service.approve(decodeURIComponent(match[1]), actorId, actorType));
      }
      if (match?.[1] && match[2] === 'execute' && req.method === 'POST') return writeJson(res, 200, await service.execute(decodeURIComponent(match[1])));
      return writeJson(res, 404, { error: { code: 'NOT_FOUND', message: 'Route not found.' } });
    } catch (error) {
      const known = error instanceof AutomationError ? error : new AutomationError(error instanceof Error ? error.message : 'Unexpected error.', 500, 'INTERNAL_ERROR');
      writeJson(res, known.statusCode, { error: { code: known.code, message: known.message } });
    }
  });
}

function validActorSignature(req: IncomingMessage, path: string, actorId: string, actorType: string, secret: string): boolean { const supplied = header(req, 'x-actor-signature'); const expected = createHmac('sha256', secret).update(`${req.method}:${path}:${actorId}:${actorType}`).digest('hex'); const a = Buffer.from(supplied); const b = Buffer.from(expected); return a.length === b.length && timingSafeEqual(a, b); }

function authorized(req: IncomingMessage, token: string): boolean { return token.length >= 16 && req.headers.authorization === `Bearer ${token}`; }
function header(req: IncomingMessage, key: string): string { const value = req.headers[key]; return Array.isArray(value) ? value[0] ?? '' : value ?? ''; }
async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) { const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); size += value.length; if (size > 1024 * 1024) throw new AutomationError('Request body too large.'); chunks.push(value); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new AutomationError('Valid JSON body is required.'); }
}
function writeJson(res: ServerResponse, status: number, value: unknown): void { res.statusCode = status; res.setHeader('content-type', 'application/json; charset=utf-8'); res.setHeader('cache-control', 'no-store'); res.end(JSON.stringify(value)); }
