import type { PlanStore, ScaffoldPublisher } from './ports.js';
import { buildScaffold, selectArchetype } from './scaffolds.js';
import type { AutomationPlan, AutomationRequest, PlanState } from './types.js';

export class AutomationError extends Error {
  constructor(message: string, readonly statusCode = 400, readonly code = 'INVALID_REQUEST') { super(message); }
}

export class ProjectAutomationService {
  constructor(private readonly store: PlanStore, private readonly publisher: ScaffoldPublisher) {}

  async createPlan(request: AutomationRequest): Promise<AutomationPlan> {
    validateRequest(request);
    const existing = await this.store.findByRequestId(request.request_id);
    if (existing) return existing;
    const now = new Date().toISOString();
    let archetype = 'repository-native-module';
    if (request.kind === 'new_project') {
      try { archetype = selectArchetype(request.project!); }
      catch (error) { throw new AutomationError(error instanceof Error ? error.message : 'No accepted archetype matches.', 409, 'ARCHETYPE_EXCEPTION_REQUIRED'); }
    }
    const steps = request.kind === 'new_project'
      ? ['select accepted golden archetype', 'generate repository baseline in staging', 'run generated quality gates', 'submit scaffold through human-reviewed Git workflow']
      : ['confirm Effective Context and repository route', 'review module implementation plan', 'resume Phase 4 agent execution', 'run required quality gates and create PR'];
    const plan: AutomationPlan = {
      schema_version: 1,
      plan_id: `plan:${request.request_id}`,
      request,
      state: 'WAITING_PLAN_APPROVAL',
      archetype,
      steps,
      approvals: [],
      history: [{ state: 'WAITING_PLAN_APPROVAL', entered_at: now, actor: 'system', reason: 'Human plan approval is mandatory.' }],
      output: null,
      created_at: now,
      updated_at: now,
    };
    await this.store.save(plan);
    return plan;
  }

  async getPlan(planId: string): Promise<AutomationPlan> {
    const plan = await this.store.findById(planId);
    if (!plan) throw new AutomationError('Plan not found.', 404, 'PLAN_NOT_FOUND');
    return plan;
  }

  async approve(planId: string, actorId: string, actorType: string): Promise<AutomationPlan> {
    let plan = await this.getPlan(planId);
    if (actorType !== 'human' || !actorId.trim()) throw new AutomationError('A named human actor is required.', 403, 'HUMAN_APPROVAL_REQUIRED');
    if (plan.state !== 'WAITING_PLAN_APPROVAL') throw new AutomationError('Plan is not waiting for approval.', 409, 'INVALID_STATE');
    const now = new Date().toISOString();
    plan = transition(plan, 'APPROVED', 'human', now, 'Human plan approval received.');
    plan = { ...plan, approvals: [...plan.approvals, { actor_id: actorId, actor_type: 'human', approved_at: now }] };
    await this.store.save(plan);
    return plan;
  }

  async execute(planId: string): Promise<AutomationPlan> {
    let plan = await this.getPlan(planId);
    if (plan.state === 'COMPLETED') return plan;
    const retryableFailure = plan.state === 'FAILED' && plan.approvals.length > 0 && plan.output === null;
    if (!['APPROVED', 'EXECUTING'].includes(plan.state) && !retryableFailure) throw new AutomationError('Plan must be approved before execution.', 409, 'APPROVAL_REQUIRED');
    if (plan.state === 'APPROVED' || retryableFailure) { plan = transition(plan, 'EXECUTING', 'system', undefined, retryableFailure ? 'Retrying an approved plan after execution failure.' : undefined); await this.store.save(plan); }
    try {
      if (plan.request.kind === 'new_project') {
        const project = plan.request.project!;
        const published = await this.publisher.publish(project.repository, buildScaffold(project, plan.archetype));
        plan = { ...plan, output: { type: 'scaffold', ...published } };
      } else {
        const module = plan.request.module!;
        plan = {
          ...plan,
          output: {
            type: 'phase4_handoff',
            handoff: {
              schema_version: 1,
              jira_issue_key: plan.request.jira_issue_key,
              work_type: 'new_module',
              project_id: module.project_id,
              module_name: module.module_name,
              repository: module.repository,
              target_path: module.target_path,
              requires_fresh_effective_context: true,
              constraints: { allow_merge: false, allow_production_deploy: false, allow_production_credentials: false },
            },
          },
        };
      }
      plan = transition(plan, 'COMPLETED', 'system');
      await this.store.save(plan);
      return plan;
    } catch (error) {
      plan = transition(plan, 'FAILED', 'system', undefined, error instanceof Error ? error.message : 'Execution failed.');
      await this.store.save(plan);
      throw error;
    }
  }
}

function validateRequest(request: AutomationRequest): void {
  if (!request || typeof request !== 'object' || request.schema_version !== 1 || !request.request_id?.trim() || !request.jira_issue_key?.trim() || !request.requested_by?.trim()) throw new AutomationError('Required request identity is missing.');
  if (Number.isNaN(Date.parse(request.requested_at))) throw new AutomationError('requested_at must be an ISO date-time.');
  if (request.kind === 'new_project') {
    if (!request.project || request.module || !request.project.name?.trim() || !request.project.domain?.trim()) throw new AutomationError('New Project requires complete project metadata and forbids module.');
    if (!/^[A-Z][A-Z0-9_]*$/.test(request.project.id) || !/^[A-Za-z0-9._-]+$/.test(request.project.repository)) throw new AutomationError('Project ID or repository name is invalid.');
  } else if (request.kind === 'new_module') {
    if (!request.module || request.project || !request.module.project_id?.trim() || !request.module.module_name?.trim() || !request.module.repository?.trim() || !request.module.target_path?.trim() || !request.module.effective_context?.decision) throw new AutomationError('New Module requires complete module/context data and forbids project.');
    const context = request.module.effective_context;
    const conflict = context.conflicts?.find((item) => item.blocking);
    if (!context.decision.can_plan || conflict) throw new AutomationError(context.decision.reason ?? conflict?.message ?? 'Effective Context blocks planning.', 409, 'CONTEXT_BLOCKED');
    if (request.module.target_path.startsWith('/') || request.module.target_path.split('/').includes('..')) throw new AutomationError('Module target_path must be repository-relative and cannot traverse.');
  } else {
    throw new AutomationError('Unsupported automation kind.');
  }
}

function transition(plan: AutomationPlan, state: PlanState, actor: 'system' | 'human', now = new Date().toISOString(), reason?: string): AutomationPlan {
  return { ...plan, state, updated_at: now, history: [...plan.history, { state, entered_at: now, actor, reason: reason ?? null }] };
}
