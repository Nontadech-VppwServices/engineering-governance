import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { URL } from 'node:url';
import { HermesGovernanceService, LearningError } from './service.js';
import type { Evaluation, ImprovementProposal, LearningObservation, MemoryRecord } from './types.js';
export function createHermesGovernanceHttpServer(service: HermesGovernanceService, apiToken: string): Server {
  return createServer(async (req, res) => { try {
    const url = new URL(req.url ?? '/', 'http://hermes-governance.internal');
    if (req.method === 'GET' && url.pathname === '/healthz') return json(res, 200, { status: 'ok' });
    if (req.headers.authorization !== `Bearer ${apiToken}` || apiToken.length < 16) return json(res, 401, { error: { code: 'UNAUTHORIZED', message: 'Bearer token is required.' } });
    const actor = header(req, 'x-actor-id') || 'hermes';
    if (req.method === 'POST' && url.pathname === '/v1/memories') return json(res, 201, await service.recordMemory(await body(req) as MemoryRecord, actor));
    if (req.method === 'GET' && url.pathname === '/v1/memories') return json(res, 200, await service.searchMemories(url.searchParams.get('scope') ?? '', url.searchParams.get('query') ?? undefined));
    const memoryMatch = url.pathname.match(/^\/v1\/memories\/([^/]+)\/revoke$/);
    if (req.method === 'POST' && memoryMatch?.[1]) return json(res, 200, await service.revokeMemory(decodeURIComponent(memoryMatch[1]), actor, header(req, 'x-actor-type')));
    if (req.method === 'POST' && url.pathname === '/v1/observations') return json(res, 201, await service.recordObservation(await body(req) as LearningObservation, actor));
    if (req.method === 'POST' && url.pathname === '/v1/proposals') return json(res, 201, await service.createProposal(await body(req) as Omit<ImprovementProposal, 'state' | 'evaluations' | 'approvals' | 'created_at' | 'updated_at' | 'published_path'>, actor));
    const match = url.pathname.match(/^\/v1\/proposals\/([^/]+)(?:\/(evaluate|approve|reject|publish))?$/); const id = match?.[1] ? decodeURIComponent(match[1]) : '';
    if (id && !match?.[2] && req.method === 'GET') return json(res, 200, await service.getProposal(id));
    if (id && match?.[2] === 'evaluate' && req.method === 'POST') return json(res, 200, await service.evaluate(id, await body(req) as Evaluation));
    if (id && match?.[2] === 'approve' && req.method === 'POST') return json(res, 200, await service.approve(id, actor, header(req, 'x-actor-type')));
    if (id && match?.[2] === 'reject' && req.method === 'POST') return json(res, 200, await service.reject(id, actor, header(req, 'x-actor-type')));
    if (id && match?.[2] === 'publish' && req.method === 'POST') return json(res, 200, await service.publish(id, actor));
    return json(res, 404, { error: { code: 'NOT_FOUND', message: 'Route not found.' } });
  } catch (error) { const known = error instanceof LearningError ? error : new LearningError(error instanceof Error ? error.message : 'Unexpected error.', 500, 'INTERNAL_ERROR'); json(res, known.statusCode, { error: { code: known.code, message: known.message } }); } });
}
function header(req: IncomingMessage, key: string): string { const value = req.headers[key]; return Array.isArray(value) ? value[0] ?? '' : value ?? ''; }
async function body(req: IncomingMessage): Promise<unknown> { const chunks: Buffer[] = []; let size = 0; for await (const chunk of req) { const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); size += value.length; if (size > 1024 * 1024) throw new LearningError('Request body too large.'); chunks.push(value); } try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new LearningError('Valid JSON body is required.'); } }
function json(res: ServerResponse, status: number, value: unknown): void { res.statusCode = status; res.setHeader('content-type', 'application/json; charset=utf-8'); res.setHeader('cache-control', 'no-store'); res.end(JSON.stringify(value)); }
