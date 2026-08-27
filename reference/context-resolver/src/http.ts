import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { URL } from 'node:url';
import { ContextResolutionError, ContextResolverService, type ContextResolveRequest } from './service.js';

const MAX_BODY_BYTES = 1024 * 1024;

export function createContextResolverHttpServer(service: ContextResolverService): Server {
  return createServer(async (req, res) => {
    try {
      await routeRequest(req, res, service);
    } catch (error) {
      writeError(res, error);
    }
  });
}

async function routeRequest(
  req: IncomingMessage,
  res: ServerResponse,
  service: ContextResolverService,
): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://context-resolver.internal');

  if (req.method === 'GET' && url.pathname === '/healthz') {
    writeJson(res, 200, { status: 'ok' });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/v1/context/resolve') {
    const body = await readJsonBody(req);
    const context = await service.resolve(body as ContextResolveRequest);
    writeJson(res, 200, context);
    return;
  }

  const projectMatch = url.pathname.match(/^\/v1\/projects\/([^/]+)\/context$/);
  if (req.method === 'GET' && projectMatch?.[1]) {
    const projectId = decodeURIComponent(projectMatch[1]);
    const targetBranch = url.searchParams.get('targetBranch');
    const request: ContextResolveRequest = {
      schema_version: 1,
      request_id: `project:${projectId}:${Date.now()}`,
      project_id: projectId,
      target_branch: targetBranch,
      refresh: {
        repositories: url.searchParams.get('refresh') === 'true',
      },
    };
    const context = await service.resolve(request);
    writeJson(res, 200, context);
    return;
  }

  writeJson(res, 404, {
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: 'Route not found.',
    },
  });
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_BODY_BYTES) {
      throw new ContextResolutionError('Request body is too large.', 400, 'REQUEST_TOO_LARGE');
    }
    chunks.push(buffer);
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) {
    throw new ContextResolutionError('JSON request body is required.', 400, 'INVALID_JSON');
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new ContextResolutionError('Request body must be valid JSON.', 400, 'INVALID_JSON');
  }
}

function writeError(res: ServerResponse, error: unknown): void {
  if (error instanceof ContextResolutionError) {
    writeJson(res, error.statusCode, {
      error: {
        code: error.code,
        message: error.message,
      },
    });
    return;
  }

  writeJson(res, 500, {
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Context resolution failed unexpectedly.',
    },
  });
}

function writeJson(res: ServerResponse, statusCode: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(json);
}
