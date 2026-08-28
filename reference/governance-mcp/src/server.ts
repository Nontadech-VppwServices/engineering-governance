import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { resolveEffectiveContext, type GovernanceRegistry } from './context.js';
import { isKnownGate, requiredGates, WorkspaceManager } from './git.js';
import type { GitHubClient } from './github.js';
import type { JiraClient } from './jira.js';
import { issuePrincipal, verifyPrincipal } from './principal.js';
import {
  assertImplementationWriteAllowed,
  assertRepositoryAllowed,
  assertSafeRepositoryPath,
  issueJobToken,
  verifyJobToken,
} from './scope.js';
import { transitionJob } from './state-machine.js';
import type { GovernanceStore } from './store.js';
import { assertNoSecret, sanitize } from './sanitize.js';
import {
  GovernanceError,
  type ActionType,
  type AiSdlcJob,
  type ExecutionPhase,
  type ExecutionScope,
  type Identity,
  type JobState,
  type WorkType,
} from './types.js';
import type { ActionService } from './actions.js';

export interface ServerConfig {
  jobTokenSecret: string;
  principalSecret: string;
  alertTargetId: string;
  reportTargetId: string;
  identities: Map<string, Identity>;
}

export interface ServerDeps {
  store: GovernanceStore;
  jira: JiraClient;
  github: GitHubClient;
  workspace: WorkspaceManager;
  actions: ActionService;
  registry: GovernanceRegistry;
  config: ServerConfig;
}

const ACTION_TYPES = [
  'create_requirement', 'update_requirement', 'approve_plan', 'execute_plan',
  'provide_information', 'request_merge', 'request_deployment', 'request_rollback',
  'cancel_job', 'retry_job',
] as const;

const JOB_STATES = [
  'RECEIVED', 'RESOLVING_CONTEXT', 'WAITING_INFORMATION', 'ANALYZING', 'PLANNING',
  'WAITING_PLAN_APPROVAL', 'CODING', 'TESTING', 'CREATING_PR', 'WAITING_REVIEW',
  'DONE', 'FAILED', 'CANCELLED',
] as const;

export function createGovernanceMcpServer(deps: ServerDeps): McpServer {
  const server = new McpServer({ name: 'vespiario-governance', version: '1.0.0' });
  const { store, jira, github, workspace, actions, registry, config } = deps;

  // Every tool goes through this: it audits the call, redacts the result, and
  // turns a GovernanceError into a denial the model can read but not bypass.
  const register = server.registerTool.bind(server) as (
    name: string,
    config: { description: string; inputSchema: unknown },
    cb: (args: any) => Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }>,
  ) => unknown;

  function tool<S extends z.ZodTypeAny>(
    name: string,
    description: string,
    inputSchema: S,
    handler: (args: z.output<S>) => Promise<unknown>,
  ): void {
    register(name, { description, inputSchema }, async (args: any) => {
      const jobId = typeof args?.job_token === 'string' ? peekJobId(args.job_token) : null;
      try {
        const result = await handler(args);
        await store.auditToolCall({ jobId, toolName: name, scope: scopeOf(args), decision: 'allow' });
        return { content: [{ type: 'text' as const, text: JSON.stringify(sanitize(result)) }] };
      } catch (error) {
        await store
          .auditToolCall({ jobId, toolName: name, scope: scopeOf(args), decision: 'deny' })
          .catch(() => undefined);
        const message = error instanceof Error ? error.message : 'Tool call failed.';
        const code = error instanceof GovernanceError ? error.code : 'TOOL_FAILED';
        return {
          isError: true,
          content: [{ type: 'text' as const, text: JSON.stringify({ error: { code, message } }) }],
        };
      }
    });
  }

  function scope(token: string): ExecutionScope {
    return verifyJobToken(token, config.jobTokenSecret);
  }

  // ---------------------------------------------------------------- context

  tool(
    'get_effective_context',
    'Resolve authoritative Effective Context for a Jira issue or project. Deterministic; never uses model inference.',
    z.object({
      jira_issue_key: z.string().optional(),
      project_id: z.string().optional(),
    }),
    async ({ jira_issue_key, project_id }) => {
      const snapshot = jira_issue_key ? await jira.snapshot(jira_issue_key) : null;
      if (jira_issue_key && !snapshot) throw new GovernanceError('Jira issue not found.', 404, 'NOT_FOUND');

      const projectId =
        project_id ?? (snapshot?.projectKey ? registry.byJiraKey[snapshot.projectKey] : undefined);
      const project = projectId ? registry.projects[projectId] : undefined;
      if (!project) {
        throw new GovernanceError(
          'Project could not be mapped from the supplied request.',
          404,
          'PROJECT_NOT_FOUND',
        );
      }

      const context = resolveEffectiveContext({
        requestId: `ctx_${randomUUID()}`,
        project,
        jira: snapshot,
        rpaRouting: registry.rpaRouting,
      });

      // Repository facts come from GitHub, not from the registry alone.
      const routing = context.routing as { repositories: Array<{ repository: string }> };
      const facts = await Promise.all(
        routing.repositories.map(async (route) => {
          const repo = await github.getRepository(route.repository);
          return {
            repository: route.repository,
            target_branch: repo?.default_branch ?? project.defaultBranch,
            facts: { archived: repo?.archived ?? null, visibility: repo?.visibility ?? null },
            project_context_paths: ['.ai/project.yaml'],
          };
        }),
      );
      return { ...context, repositories: facts };
    },
  );

  tool(
    'list_ready_jira_issues',
    'List Jira issues assigned to the AI assignee inside the permitted projects. Backs the scheduled intake task.',
    z.object({ lookback_minutes: z.number().int().min(1).max(10080).default(20) }),
    async ({ lookback_minutes }) => ({ issues: await jira.listReadyIssues(lookback_minutes) }),
  );

  tool(
    'get_jira_issue',
    'Read a Jira issue.',
    z.object({ issue_key: z.string().min(3) }),
    async ({ issue_key }) => {
      const issue = await jira.getIssue(issue_key);
      if (!issue) throw new GovernanceError('Jira issue not found.', 404, 'NOT_FOUND');
      return issue;
    },
  );

  tool(
    'add_jira_comment',
    'Add a sanitized AI SDLC comment to the Jira issue bound to this execution scope.',
    z.object({ job_token: z.string(), comment: z.string().min(1).max(4000) }),
    async ({ job_token, comment }) => {
      const s = scope(job_token);
      assertNoSecret(comment);
      return jira.addComment(s.jira_issue_key, comment.trim());
    },
  );

  tool(
    'sync_jira_state',
    'Move the scoped Jira issue to the status mapped from a canonical job state. The mapping is governance SSOT, not model output.',
    z.object({ job_token: z.string(), canonical_state: z.enum(JOB_STATES) }),
    async ({ job_token, canonical_state }) => {
      const s = scope(job_token);
      return jira.syncState(s.jira_issue_key, canonical_state);
    },
  );

  // ------------------------------------------------------------- job state

  tool(
    'create_job',
    'Create or return the AI SDLC job for an intake event. Idempotent on intake_event_id.',
    z.object({
      intake_event_id: z.string().min(1),
      jira_issue_key: z.string().min(3),
      work_type: z.enum(['bug', 'new_module', 'new_project', 'analysis']),
    }),
    async ({ intake_event_id, jira_issue_key, work_type }) => {
      const existing = await store.findJobByIntakeEvent(intake_event_id);
      if (existing) return existing;
      const now = new Date().toISOString();
      const job: AiSdlcJob = {
        schema_version: 1,
        job_id: `job_${randomUUID()}`,
        intake_event_id,
        jira_issue_key,
        work_type: work_type as WorkType,
        state: 'RECEIVED',
        created_at: now,
        updated_at: now,
        repositories: [],
        prs: [],
        blocking_reason: null,
        history: [{ state: 'RECEIVED', entered_at: now, actor: 'system', reason: null }],
      };
      await store.saveJob(job);
      return job;
    },
  );

  tool(
    'get_job',
    'Read an AI SDLC job with its state history.',
    z.object({ job_id: z.string().min(1) }),
    async ({ job_id }) => {
      const job = await store.findJob(job_id);
      if (!job) throw new GovernanceError('Job not found.', 404, 'NOT_FOUND');
      return job;
    },
  );

  tool(
    'record_job_state',
    'Record a job state transition. Illegal transitions are rejected server-side.',
    z.object({
      job_id: z.string().min(1),
      state: z.enum(JOB_STATES),
      reason: z.string().max(1000).optional(),
    }),
    async ({ job_id, state, reason }) => {
      const job = await store.findJob(job_id);
      if (!job) throw new GovernanceError('Job not found.', 404, 'NOT_FOUND');
      const next = transitionJob(job, state as JobState, 'ai', reason ?? null);
      await store.saveJob(next);
      return next;
    },
  );

  // ------------------------------------------------------- workspace / git

  tool(
    'prepare_workspace',
    'Clone the routed repository into the job workspace and mint the scoped job token used by every other execution tool.',
    z.object({
      job_id: z.string().min(1),
      repository: z.string().min(3),
      execution_phase: z.enum(['analyze', 'plan', 'implement']),
    }),
    async ({ job_id, repository, execution_phase }) => {
      const job = await store.findJob(job_id);
      if (!job) throw new GovernanceError('Job not found.', 404, 'NOT_FOUND');

      // The scope is derived from Effective Context, never from the caller.
      const snapshot = await jira.snapshot(job.jira_issue_key);
      const projectId = snapshot?.projectKey ? registry.byJiraKey[snapshot.projectKey] : undefined;
      const project = projectId ? registry.projects[projectId] : undefined;
      if (!project) throw new GovernanceError('Project could not be mapped.', 404, 'PROJECT_NOT_FOUND');

      const context = resolveEffectiveContext({
        requestId: `ctx_${randomUUID()}`,
        project,
        jira: snapshot,
        rpaRouting: registry.rpaRouting,
      }) as any;

      const allowed: string[] = context.routing.repositories.map((r: any) => r.repository);
      if (!allowed.includes(repository)) {
        throw new GovernanceError(
          `Repository '${repository}' is not routed for ${job.jira_issue_key}.`,
          403,
          'ROUTING_CONFLICT',
        );
      }
      if (execution_phase === 'implement' && !context.decision.can_modify_code) {
        throw new GovernanceError(
          context.decision.reason ?? 'Effective Context does not permit code modification.',
          403,
          'FORBIDDEN',
        );
      }

      const repo = await github.getRepository(repository);
      const baseBranch = repo?.default_branch ?? project.defaultBranch;
      const workingBranch = `ai/${job.jira_issue_key.toLowerCase()}-${job.job_id.slice(-8)}`;

      const prepared = await workspace.prepare({
        jobId: job.job_id,
        repository,
        baseBranch,
        workingBranch,
      });

      const execution = job.execution ?? {
        archetype: project.archetype,
        base_branches: {},
        working_branches: {},
        gates: {},
      };
      execution.archetype = project.archetype;
      execution.base_branches[repository] = baseBranch;
      execution.working_branches[repository] = workingBranch;
      execution.gates[repository] = {};

      const updated: AiSdlcJob = {
        ...job,
        repositories: [...new Set([...job.repositories, repository])],
        execution,
        updated_at: new Date().toISOString(),
      };
      await store.saveJob(updated);

      const executionScope: ExecutionScope = {
        schema_version: 1,
        job_id: job.job_id,
        jira_issue_key: job.jira_issue_key,
        execution_phase: execution_phase as ExecutionPhase,
        allowed_repositories: [repository],
        working_branches: { [repository]: workingBranch },
        permissions: {
          can_modify_code: Boolean(context.decision.can_modify_code) && execution_phase === 'implement',
          can_create_pr: Boolean(context.decision.can_create_pr),
          can_merge: false,
          can_deploy_production: false,
          can_access_production_credentials: false,
        },
        effective_context_ref: context.request_id,
      };

      return {
        job_token: issueJobToken(executionScope, config.jobTokenSecret),
        workspace_path: prepared.path,
        repository,
        base_branch: baseBranch,
        working_branch: workingBranch,
        execution_phase,
        required_gates: requiredGates(project.archetype),
        effective_context: context,
      };
    },
  );

  tool(
    'search_repository',
    'Search only a repository allowed by the current execution scope.',
    z.object({ job_token: z.string(), repository: z.string().min(3), query: z.string().min(1).max(500) }),
    async ({ job_token, repository, query }) => {
      const s = scope(job_token);
      assertRepositoryAllowed(s, repository);
      return { results: await github.searchCode(repository, query) };
    },
  );

  tool(
    'read_repository_file',
    'Read a repository file inside the current execution scope.',
    z.object({ job_token: z.string(), repository: z.string().min(3), path: z.string().min(1).max(1000) }),
    async ({ job_token, repository, path }) => {
      const s = scope(job_token);
      assertRepositoryAllowed(s, repository);
      assertSafeRepositoryPath(path);
      const file = await github.readFile(repository, path);
      if (!file) throw new GovernanceError('File not found.', 404, 'NOT_FOUND');
      return file;
    },
  );

  tool(
    'run_quality_gate',
    'Run one named policy-approved quality gate and record its verdict. Arbitrary shell commands are not accepted.',
    z.object({ job_token: z.string(), repository: z.string().min(3), gate_key: z.string().min(1).max(100) }),
    async ({ job_token, repository, gate_key }) => {
      const s = scope(job_token);
      assertRepositoryAllowed(s, repository);
      if (!isKnownGate(gate_key)) {
        throw new GovernanceError(`Unknown quality gate '${gate_key}'.`, 400, 'UNKNOWN_GATE');
      }
      const job = await store.findJob(s.job_id);
      if (!job?.execution) throw new GovernanceError('Workspace is not prepared.', 409, 'INVALID_STATE');

      const verdict = await workspace.runGate({
        jobId: s.job_id,
        repository,
        gateKey: gate_key,
        archetype: job.execution.archetype,
      });

      job.execution.gates[repository] = { ...(job.execution.gates[repository] ?? {}), [gate_key]: verdict };
      await store.saveJob({ ...job, updated_at: new Date().toISOString() });
      return verdict;
    },
  );

  tool(
    'commit_and_push',
    'Commit and push the pre-approved working branch. Refused unless every required gate has a recorded passing verdict.',
    z.object({ job_token: z.string(), repository: z.string().min(3), message: z.string().min(1).max(300) }),
    async ({ job_token, repository, message }) => {
      const s = scope(job_token);
      const branch = assertImplementationWriteAllowed(s, repository);
      const job = await assertGatesPassed(store, s.job_id, repository);
      const baseBranch = job.execution!.base_branches[repository]!;

      const result = await workspace.commitAndPush({
        jobId: s.job_id,
        repository,
        baseBranch,
        workingBranch: branch,
        message,
      });
      return { ...result, repository, working_branch: branch };
    },
  );

  tool(
    'create_pull_request',
    'Open a pull request for the pre-approved working branch after trusted quality verification. Merge is never available.',
    z.object({
      job_token: z.string(),
      repository: z.string().min(3),
      title: z.string().min(1).max(300),
      body: z.string().min(1).max(20000),
    }),
    async ({ job_token, repository, title, body }) => {
      const s = scope(job_token);
      const branch = assertImplementationWriteAllowed(s, repository);
      if (!s.permissions.can_create_pr) {
        throw new GovernanceError('Effective Context denied PR creation for this job.', 403, 'FORBIDDEN');
      }
      const job = await assertGatesPassed(store, s.job_id, repository);
      assertNoSecret(body);

      const pr = await github.createPullRequest({
        repository,
        baseBranch: job.execution!.base_branches[repository]!,
        headBranch: branch,
        title,
        body,
      });
      await store.saveJob({
        ...job,
        prs: [...job.prs.filter((p) => !(p.repository === pr.repository && p.number === pr.number)), pr],
        updated_at: new Date().toISOString(),
      });
      return pr;
    },
  );

  tool(
    'get_pull_request_status',
    'Read the current state of a pull request opened for this job.',
    z.object({ job_token: z.string(), repository: z.string().min(3), pr_number: z.number().int().min(1) }),
    async ({ job_token, repository, pr_number }) => {
      const s = scope(job_token);
      assertRepositoryAllowed(s, repository);
      return github.getPullRequestStatus(repository, pr_number);
    },
  );

  // ------------------------------------------------- human-confirmed actions

  tool(
    'issue_principal',
    'Exchange an authenticated LINE gateway identity for a short-lived principal token. The user ID must come from gateway metadata, never from chat text.',
    z.object({ line_user_id: z.string().min(2), direct_message: z.boolean() }),
    async ({ line_user_id, direct_message }) => {
      const identity = config.identities.get(line_user_id);
      if (!identity) throw new GovernanceError('LINE user is not allowlisted.', 403, 'FORBIDDEN');
      return {
        principal_token: issuePrincipal(identity, config.principalSecret, direct_message),
        roles: identity.roles,
      };
    },
  );

  tool(
    'draft_action',
    'Create a pending state-changing action for human confirmation. Nothing is executed at this point.',
    z.object({
      principal_token: z.string(),
      idempotency_key: z.string().min(1),
      type: z.enum(ACTION_TYPES),
      payload: z.record(z.string(), z.unknown()),
    }),
    async ({ principal_token, idempotency_key, type, payload }) => {
      const principal = verifyPrincipal(principal_token, config.principalSecret);
      return actions.draft(
        { idempotency_key, type: type as ActionType, payload: payload as Record<string, unknown> },
        principal,
      );
    },
  );

  tool(
    'confirm_action',
    'Confirm and execute a pending action. Must be the requester, in a 1:1 chat, before the action expires.',
    z.object({ principal_token: z.string(), action_id: z.string().min(1) }),
    async ({ principal_token, action_id }) => {
      const principal = verifyPrincipal(principal_token, config.principalSecret);
      return actions.confirm(action_id, principal);
    },
  );

  tool(
    'get_action',
    'Read a pending or completed action.',
    z.object({ action_id: z.string().min(1) }),
    async ({ action_id }) => actions.get(action_id),
  );

  // ------------------------------------------------------ Phase 5 / Phase 6

  tool(
    'create_plan',
    'Create a New Module or New Project plan that waits for a named human approval.',
    z.object({
      request_id: z.string().min(1),
      jira_issue_key: z.string().min(3),
      kind: z.enum(['new_module', 'new_project']),
      requested_by: z.string().min(1),
      steps: z.array(z.string().min(1)).min(1),
      archetype: z.string().min(1),
      target: z.record(z.string(), z.unknown()),
    }),
    async (input) => {
      const existing = await store.findPlanByRequest(input.request_id);
      if (existing) return existing;
      const now = new Date().toISOString();
      const plan = {
        schema_version: 1,
        plan_id: `plan_${randomUUID()}`,
        request: { ...input, request_id: input.request_id },
        state: 'WAITING_PLAN_APPROVAL',
        archetype: input.archetype,
        steps: input.steps,
        approvals: [] as unknown[],
        history: [{ state: 'WAITING_PLAN_APPROVAL', entered_at: now, actor: 'system', reason: null }],
        output: null,
        created_at: now,
        updated_at: now,
      };
      await store.savePlan(plan as any);
      return plan;
    },
  );

  tool(
    'get_plan',
    'Read a Phase 5 plan and its approval state.',
    z.object({ plan_id: z.string().min(1) }),
    async ({ plan_id }) => {
      const plan = await store.findPlan(plan_id);
      if (!plan) throw new GovernanceError('Plan not found.', 404, 'NOT_FOUND');
      return plan;
    },
  );

  tool(
    'record_observation',
    'Record a Phase 6 learning observation with an evidence reference.',
    z.object({
      observation_id: z.string().min(1),
      scope: z.string().min(1),
      outcome: z.enum(['success', 'failure', 'correction', 'near_miss']),
      execution_ref: z.string().min(1),
      evidence: z.string().min(1).max(8000),
      suggested_action: z.string().min(1).max(4000),
    }),
    async (input) => {
      assertNoSecret(`${input.evidence}\n${input.suggested_action}`);
      const existing = await store.findLearning('observation', input.observation_id);
      if (existing) return existing;
      const value = { schema_version: 1, ...input, created_at: new Date().toISOString() };
      await store.saveLearning('observation', input.observation_id, value);
      await store.audit('observation', input.observation_id, 'created', 'hermes');
      return value;
    },
  );

  tool(
    'propose_skill_change',
    'Propose a skill create/update/retire. A proposal is never self-approving; publication requires named human approval.',
    z.object({
      proposal_id: z.string().min(1),
      kind: z.enum(['skill_create', 'skill_update', 'skill_retire']),
      risk: z.enum(['low', 'medium', 'high']),
      observation_ids: z.array(z.string().min(1)).min(1),
      skill_name: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
      skill_version: z.string().regex(/^[A-Za-z0-9._-]+$/),
      skill_description: z.string().min(1),
      skill_content: z.string().min(1).max(100000),
    }),
    async (input) => {
      const existing = await store.findLearning('proposal', input.proposal_id);
      if (existing) return existing;
      for (const id of new Set(input.observation_ids)) {
        if (!(await store.findLearning('observation', id))) {
          throw new GovernanceError(`Observation not found: ${id}`, 409, 'OBSERVATION_NOT_FOUND');
        }
      }
      assertNoSecret(input.skill_content);
      const now = new Date().toISOString();
      const proposal = {
        schema_version: 1,
        ...input,
        state: 'PROPOSED',
        evaluations: [] as unknown[],
        approvals: [] as unknown[],
        published_path: null,
        created_at: now,
        updated_at: now,
      };
      await store.saveLearning('proposal', input.proposal_id, proposal);
      await store.audit('proposal', input.proposal_id, 'created', 'hermes', { risk: input.risk });
      return proposal;
    },
  );

  // ------------------------------------------------------------- reporting

  tool(
    'ingest_rpa_event',
    'Ingest one RPA run event. Deduplicated on event_id; a prod failure raises a rate-limited alert.',
    z.object({
      event_id: z.string().min(1),
      run_id: z.string().min(1),
      bot_id: z.string().min(1),
      project_id: z.string().min(1),
      environment: z.enum(['dev', 'uat', 'prod', 'local', 'unknown']),
      event_type: z.enum(['started', 'completed', 'failed', 'cancelled', 'skipped']),
      occurred_at: z.string().min(1),
      metrics: z.record(z.string(), z.number()).optional(),
      error: z.object({ code: z.string().optional(), summary: z.string().optional() }).optional(),
    }),
    async (input) => {
      if (Number.isNaN(Date.parse(input.occurred_at))) {
        throw new GovernanceError('occurred_at must be an ISO date-time.');
      }
      return store.ingestRpaEvent({ schema_version: 1, ...input } as any, config.alertTargetId);
    },
  );

  tool(
    'query_rpa_metrics',
    'Aggregate RPA run outcomes for a period. Backs the scheduled daily/weekly/monthly reports.',
    z.object({ from: z.string().min(1), to: z.string().min(1) }),
    async ({ from, to }) => {
      if (Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) {
        throw new GovernanceError('from/to must be ISO date-times.');
      }
      return store.metrics(from, to);
    },
  );

  tool(
    'send_line_message',
    'Queue a LINE message on the transactional outbox. Delivery, retry and dead-lettering are deterministic; the tool returns once the message is durably queued.',
    z.object({
      idempotency_key: z.string().min(1).max(200),
      message: z.string().min(1).max(4000),
      target_id: z.string().min(1).optional(),
    }),
    async ({ idempotency_key, message, target_id }) => {
      assertNoSecret(message);
      const target = target_id ?? config.reportTargetId;
      return store.enqueueNotification(`hermes:${idempotency_key}`, target, message);
    },
  );

  return server;
}

async function assertGatesPassed(
  store: GovernanceStore,
  jobId: string,
  repository: string,
): Promise<AiSdlcJob> {
  const job = await store.findJob(jobId);
  if (!job?.execution) throw new GovernanceError('Workspace is not prepared.', 409, 'INVALID_STATE');
  const recorded = job.execution.gates[repository] ?? {};
  const missing = requiredGates(job.execution.archetype).filter(
    (key) => recorded[key]?.status !== 'passed',
  );
  if (missing.length) {
    throw new GovernanceError(
      `Trusted quality verification has not passed for '${repository}': ${missing.join(', ')}.`,
      409,
      'QUALITY_GATES_NOT_VERIFIED',
    );
  }
  return job;
}

function peekJobId(token: string): string | null {
  try {
    const payload = token.split('.')[0];
    if (!payload) return null;
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')).job_id ?? null;
  } catch {
    return null;
  }
}

// Audit records the shape of a call, never its secrets or full payloads.
function scopeOf(args: unknown): Record<string, unknown> {
  if (!args || typeof args !== 'object') return {};
  const a = args as Record<string, unknown>;
  return {
    ...(typeof a.repository === 'string' ? { repository: a.repository } : {}),
    ...(typeof a.issue_key === 'string' ? { issue_key: a.issue_key } : {}),
    ...(typeof a.gate_key === 'string' ? { gate_key: a.gate_key } : {}),
    ...(typeof a.type === 'string' ? { action_type: a.type } : {}),
  };
}
