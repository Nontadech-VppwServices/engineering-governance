import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { URL } from 'node:url';
import { issuePrincipal, verifyPrincipal } from './security.js';
import { ControlError, WorkflowControlService } from './service.js';
import type { Identity } from './types.js';

export interface ControlServerConfig { apiToken:string; gatewayToken:string; principalSecret:string; identities:Map<string,Identity>; phase4Url:string; phase4Token:string; phase5Url:string; phase5Token:string; contextUrl:string; contextToken:string; }
export function createControlServer(config: ControlServerConfig, service: WorkflowControlService): ReturnType<typeof createServer> {
  return createServer(async (req, res) => { try {
    const url = new URL(req.url ?? '/', 'http://workflow-control.internal');
    if (req.method === 'GET' && url.pathname === '/healthz') return json(res, 200, { status: 'ok' });
    if (req.method === 'POST' && url.pathname === '/v1/principals/issue') {
      if (!bearer(req, config.gatewayToken)) return json(res, 401, { error: { code: 'UNAUTHORIZED' } });
      const body = await readJson(req) as any; const identity = config.identities.get(String(body.line_user_id ?? ''));
      if (!identity) throw new ControlError('LINE user is not allowlisted.', 403, 'FORBIDDEN');
      return json(res, 200, { principal_token: issuePrincipal(identity, config.principalSecret, body.direct_message === true) });
    }
    if (!bearer(req, config.apiToken)) return json(res, 401, { error: { code: 'UNAUTHORIZED' } });
    const principal = verifyPrincipal(header(req, 'x-principal-token'), config.principalSecret);
    if (req.method === 'POST' && url.pathname === '/v1/actions/draft') return json(res, 201, await service.draft(await readJson(req) as any, principal));
    const actionMatch = url.pathname.match(/^\/v1\/actions\/([^/]+)(?:\/(confirm))?$/);
    if (req.method === 'GET' && actionMatch?.[1] && !actionMatch[2]) return json(res, 200, await service.get(decodeURIComponent(actionMatch[1])));
    if (req.method === 'POST' && actionMatch?.[1] && actionMatch[2]) return json(res, 200, await service.confirm(decodeURIComponent(actionMatch[1]), principal));
    const jobMatch = url.pathname.match(/^\/v1\/jobs\/([^/]+)$/);
    if (req.method === 'GET' && jobMatch?.[1]) return proxy(res, `${config.phase4Url}/v1/jobs/${encodeURIComponent(jobMatch[1])}`, config.phase4Token);
    return json(res, 404, { error: { code: 'NOT_FOUND' } });
  } catch (error) { const known = error instanceof ControlError ? error : new ControlError(error instanceof Error ? error.message : 'Unexpected failure.', /principal|signature|expired/i.test(String(error)) ? 401 : 500, 'REQUEST_FAILED'); return json(res, known.status, { error: { code: known.code, message: known.status === 500 ? 'Request failed unexpectedly.' : known.message } }); } });
}
async function proxy(res: ServerResponse, url: string, token: string) { const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } }); res.statusCode = response.status; res.setHeader('content-type', 'application/json'); res.end(await response.text()); }
function bearer(req: IncomingMessage, token: string) { return token.length >= 16 && req.headers.authorization === `Bearer ${token}`; }
function header(req: IncomingMessage, name: string) { const value = req.headers[name]; return Array.isArray(value) ? value[0] ?? '' : value ?? ''; }
async function readJson(req: IncomingMessage) { const chunks: Buffer[] = []; let size = 0; for await (const chunk of req) { const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); size += b.length; if (size > 1024 * 1024) throw new ControlError('Request body too large.'); chunks.push(b); } try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new ControlError('Valid JSON body is required.'); } }
function json(res: ServerResponse, status: number, value: unknown) { res.statusCode = status; res.setHeader('content-type', 'application/json; charset=utf-8'); res.setHeader('cache-control', 'no-store'); res.end(JSON.stringify(value)); }
