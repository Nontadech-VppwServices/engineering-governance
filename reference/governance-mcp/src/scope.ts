import { createHmac, timingSafeEqual } from 'node:crypto';
import { GovernanceError, type ExecutionScope } from './types.js';

// ADR-GLOBAL-009 bound one MCP *server instance* to one job. This server is
// long-lived and shared, so the binding moves to a per-call signed job token:
// governance-mcp mints it in prepare_workspace and verifies it on every scoped
// call. Hermes carries the token but can neither mint nor widen one.

export function issueJobToken(scope: ExecutionScope, secret: string): string {
  validateScope(scope);
  const payload = Buffer.from(JSON.stringify(scope)).toString('base64url');
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyJobToken(token: string, secret: string): ExecutionScope {
  const [payload, signature] = String(token ?? '').split('.');
  if (!payload || !signature) throw new GovernanceError('Invalid job token.', 401, 'INVALID_JOB_TOKEN');
  const expected = sign(payload, secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new GovernanceError('Invalid job token signature.', 401, 'INVALID_JOB_TOKEN');
  }
  const scope = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as ExecutionScope;
  validateScope(scope);
  return scope;
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

// --- Guards. Ported from reference/ai-sdlc-mcp/src/server.ts unchanged. ---

export function validateScope(scope: ExecutionScope): void {
  if (scope.schema_version !== 1) throw new GovernanceError('Unsupported MCP scope schema version.');
  if (!scope.job_id?.trim()) throw new GovernanceError('job_id is required.');
  if (!/^[A-Z][A-Z0-9_]+-[0-9]+$/.test(scope.jira_issue_key ?? '')) {
    throw new GovernanceError('Invalid Jira issue key.');
  }
  if (!scope.allowed_repositories?.length) {
    throw new GovernanceError('At least one allowed repository is required.');
  }
  if (scope.permissions.can_merge !== false) {
    throw new GovernanceError('MCP scope can never grant merge authority.', 403, 'FORBIDDEN');
  }
  if (scope.permissions.can_deploy_production !== false) {
    throw new GovernanceError('MCP scope can never grant production deployment authority.', 403, 'FORBIDDEN');
  }
  if (scope.permissions.can_access_production_credentials !== false) {
    throw new GovernanceError('MCP scope can never grant production credential access.', 403, 'FORBIDDEN');
  }
}

export function assertRepositoryAllowed(scope: ExecutionScope, repository: string): void {
  if (!scope.allowed_repositories.includes(repository)) {
    throw new GovernanceError(
      `Repository '${repository}' is outside the current AI SDLC execution scope.`,
      403,
      'FORBIDDEN',
    );
  }
}

export function assertImplementationWriteAllowed(scope: ExecutionScope, repository: string): string {
  assertRepositoryAllowed(scope, repository);
  if (scope.execution_phase !== 'implement') {
    throw new GovernanceError(`Git write is forbidden during '${scope.execution_phase}'.`, 403, 'FORBIDDEN');
  }
  if (!scope.permissions.can_modify_code) {
    throw new GovernanceError('Control Plane denied code modification for this job.', 403, 'FORBIDDEN');
  }
  const branch = scope.working_branches[repository];
  if (!branch) {
    throw new GovernanceError(`No approved working branch exists for '${repository}'.`, 403, 'FORBIDDEN');
  }
  return branch;
}

export function assertSafeRepositoryPath(path: string): void {
  if (path.startsWith('/') || path.startsWith('\\') || path.split(/[\\/]+/).includes('..')) {
    throw new GovernanceError('Repository path escapes the allowed repository root.', 403, 'FORBIDDEN');
  }
}
