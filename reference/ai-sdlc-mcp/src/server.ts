import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import type { AiSdlcMcpPorts, ExecutionScope } from './types.js';

export function createAiSdlcMcpServer(scope: ExecutionScope, ports: AiSdlcMcpPorts): McpServer {
  validateScope(scope);
  const server = new McpServer({ name: 'vespiario-ai-sdlc', version: '1.0.0' });

  server.registerTool(
    'get_effective_context',
    {
      description: 'Return Effective Context for the current AI SDLC job only.',
      inputSchema: z.object({}),
    },
    async () => toolResult(await ports.getEffectiveContext()),
  );

  server.registerTool(
    'get_jira_issue',
    {
      description: 'Return the Jira issue bound to the current AI SDLC job.',
      inputSchema: z.object({}),
    },
    async () => toolResult(await ports.getJiraIssue()),
  );

  server.registerTool(
    'search_repository',
    {
      description: 'Search only a repository allowed by the current execution scope.',
      inputSchema: z.object({
        repository: z.string().min(3),
        query: z.string().min(1).max(500),
      }),
    },
    async ({ repository, query }) => {
      assertRepositoryAllowed(scope, repository);
      return toolResult(await ports.searchRepository(repository, query));
    },
  );

  server.registerTool(
    'read_repository_file',
    {
      description: 'Read a repository file inside the current execution scope.',
      inputSchema: z.object({
        repository: z.string().min(3),
        path: z.string().min(1).max(1000),
      }),
    },
    async ({ repository, path }) => {
      assertRepositoryAllowed(scope, repository);
      assertSafeRepositoryPath(path);
      return toolResult(await ports.readRepositoryFile(repository, path));
    },
  );

  server.registerTool(
    'run_quality_gate',
    {
      description: 'Run one named policy-approved quality gate. Arbitrary shell commands are not accepted.',
      inputSchema: z.object({
        repository: z.string().min(3),
        gate_key: z.string().min(1).max(100),
      }),
    },
    async ({ repository, gate_key }) => {
      assertRepositoryAllowed(scope, repository);
      return toolResult(await ports.runQualityGate(repository, gate_key));
    },
  );

  server.registerTool(
    'ensure_working_branch',
    {
      description: 'Request creation/verification of the pre-approved AI working branch for an implementation run.',
      inputSchema: z.object({ repository: z.string().min(3) }),
    },
    async ({ repository }) => {
      const branch = assertImplementationWriteAllowed(scope, repository);
      return toolResult(await ports.ensureWorkingBranch(repository, branch));
    },
  );

  server.registerTool(
    'commit_verified_changes',
    {
      description: 'Request a trusted commit after independent quality verification. Hermes never receives Git credentials.',
      inputSchema: z.object({
        repository: z.string().min(3),
        message: z.string().min(1).max(300),
      }),
    },
    async ({ repository, message }) => {
      const branch = assertImplementationWriteAllowed(scope, repository);
      await assertTrustedQualityVerified(ports, repository);
      return toolResult(await ports.commitVerifiedChanges(repository, branch, message));
    },
  );

  server.registerTool(
    'push_working_branch',
    {
      description: 'Request push of only the pre-approved AI working branch.',
      inputSchema: z.object({ repository: z.string().min(3) }),
    },
    async ({ repository }) => {
      const branch = assertImplementationWriteAllowed(scope, repository);
      await assertTrustedQualityVerified(ports, repository);
      return toolResult(await ports.pushWorkingBranch(repository, branch));
    },
  );

  server.registerTool(
    'create_pull_request',
    {
      description: 'Request PR creation for the pre-approved working branch after trusted quality verification.',
      inputSchema: z.object({
        repository: z.string().min(3),
        title: z.string().min(1).max(300),
        body: z.string().min(1).max(20000),
      }),
    },
    async ({ repository, title, body }) => {
      const branch = assertImplementationWriteAllowed(scope, repository);
      if (!scope.permissions.can_create_pr) throw new Error('Control Plane denied PR creation for this job.');
      await assertTrustedQualityVerified(ports, repository);
      return toolResult(await ports.createPullRequest(repository, branch, title, body));
    },
  );

  server.registerTool(
    'add_jira_comment',
    {
      description: 'Add a sanitized AI SDLC comment to the Jira issue bound to this execution scope.',
      inputSchema: z.object({ comment: z.string().min(1).max(4000) }),
    },
    async ({ comment }) => toolResult(await ports.addJiraComment(sanitizeComment(comment))),
  );

  return server;
}

export function validateScope(scope: ExecutionScope): void {
  if (scope.schema_version !== 1) throw new Error('Unsupported MCP scope schema version.');
  if (!scope.job_id.trim()) throw new Error('job_id is required.');
  if (!/^[A-Z][A-Z0-9_]+-[0-9]+$/.test(scope.jira_issue_key)) throw new Error('Invalid Jira issue key.');
  if (!scope.allowed_repositories.length) throw new Error('At least one allowed repository is required.');
  if (scope.permissions.can_merge !== false) throw new Error('MCP scope can never grant merge authority.');
  if (scope.permissions.can_deploy_production !== false) throw new Error('MCP scope can never grant production deployment authority.');
  if (scope.permissions.can_access_production_credentials !== false) throw new Error('MCP scope can never grant production credential access.');
}

export function assertRepositoryAllowed(scope: ExecutionScope, repository: string): void {
  if (!scope.allowed_repositories.includes(repository)) {
    throw new Error(`Repository '${repository}' is outside the current AI SDLC execution scope.`);
  }
}

export function assertImplementationWriteAllowed(scope: ExecutionScope, repository: string): string {
  assertRepositoryAllowed(scope, repository);
  if (scope.execution_phase !== 'implement') throw new Error(`Git write is forbidden during '${scope.execution_phase}'.`);
  if (!scope.permissions.can_modify_code) throw new Error('Control Plane denied code modification for this job.');
  const branch = scope.working_branches[repository];
  if (!branch) throw new Error(`No approved working branch exists for '${repository}'.`);
  return branch;
}

export function assertSafeRepositoryPath(path: string): void {
  if (path.startsWith('/') || path.startsWith('\\') || path.split(/[\\/]+/).includes('..')) {
    throw new Error('Repository path escapes the allowed repository root.');
  }
}

async function assertTrustedQualityVerified(ports: AiSdlcMcpPorts, repository: string): Promise<void> {
  if (!(await ports.isTrustedQualityVerified(repository))) {
    throw new Error(`Trusted quality verification has not passed for '${repository}'.`);
  }
}

function sanitizeComment(comment: string): string {
  const forbidden = /(authorization\s*:\s*bearer|password\s*[=:]|secret\s*[=:]|token\s*[=:])/i;
  if (forbidden.test(comment)) throw new Error('Jira comment appears to contain a credential or secret.');
  return comment.trim();
}

function toolResult(value: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value) }],
  };
}
