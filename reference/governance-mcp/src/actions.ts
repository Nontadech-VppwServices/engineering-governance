import { randomUUID } from 'node:crypto';
import { hasRole } from './principal.js';
import { GovernanceError, type ActionType, type LinePrincipal, type PendingAction, type Role } from './types.js';
import type { GovernanceStore } from './store.js';
import type { JiraClient } from './jira.js';
import type { GitHubClient } from './github.js';

// Ported from workflow-control. Two-step draft/confirm with TTL, idempotency
// and a 1:1-confirmation rule. This is the human-authority gate: it stays
// deterministic because an LLM must never be able to decide that a human
// approved something.

const REQUIRED_ROLE: Record<ActionType, Role> = {
  create_requirement: 'requester',
  update_requirement: 'requester',
  approve_plan: 'approver',
  execute_plan: 'approver',
  provide_information: 'requester',
  request_merge: 'approver',
  request_deployment: 'deployer',
  request_rollback: 'deployer',
  cancel_job: 'requester',
  retry_job: 'requester',
};

export interface ActionDeps {
  store: GovernanceStore;
  jira: JiraClient;
  github: GitHubClient;
  approvePlan(planId: string, principal: LinePrincipal): Promise<unknown>;
  executePlan(planId: string): Promise<unknown>;
  jobAction(jobId: string, operation: 'cancel' | 'retry'): Promise<unknown>;
}

export class ActionService {
  constructor(
    private readonly deps: ActionDeps,
    private readonly ttlSeconds = 600,
  ) {}

  async draft(
    input: { idempotency_key: string; type: ActionType; payload: Record<string, unknown> },
    principal: LinePrincipal,
  ): Promise<PendingAction> {
    if (!input.idempotency_key?.trim() || !REQUIRED_ROLE[input.type] || !input.payload || typeof input.payload !== 'object') {
      throw new GovernanceError('Invalid action draft.');
    }
    if (!hasRole(principal, REQUIRED_ROLE[input.type])) {
      throw new GovernanceError('Role is not permitted for this action.', 403, 'FORBIDDEN');
    }
    const existing = await this.deps.store.findActionByIdempotencyKey(input.idempotency_key);
    if (existing) return existing;

    const now = new Date();
    const action: PendingAction = {
      schema_version: 1,
      action_id: `act_${randomUUID()}`,
      idempotency_key: input.idempotency_key,
      type: input.type,
      payload: structuredClone(input.payload),
      requested_by: principal.line_user_id,
      status: 'DRAFT',
      expires_at: new Date(now.getTime() + this.ttlSeconds * 1000).toISOString(),
      created_at: now.toISOString(),
      confirmed_at: null,
      result: null,
    };
    await this.deps.store.saveAction(action);
    return action;
  }

  async confirm(actionId: string, principal: LinePrincipal): Promise<PendingAction> {
    let action = await this.deps.store.findAction(actionId);
    if (!action) throw new GovernanceError('Action not found.', 404, 'NOT_FOUND');
    if (action.requested_by !== principal.line_user_id || !principal.direct_message) {
      throw new GovernanceError(
        'Confirmation must be performed by the requester in a 1:1 chat.',
        403,
        'PRIVATE_CONFIRMATION_REQUIRED',
      );
    }
    if (!hasRole(principal, REQUIRED_ROLE[action.type])) {
      throw new GovernanceError('Role is not permitted for this action.', 403, 'FORBIDDEN');
    }
    if (action.status === 'EXECUTED') return action;
    if (action.status !== 'DRAFT') throw new GovernanceError('Action is not confirmable.', 409, 'INVALID_STATE');
    if (Date.parse(action.expires_at) <= Date.now()) {
      action = { ...action, status: 'EXPIRED' };
      await this.deps.store.saveAction(action);
      throw new GovernanceError('Action expired.', 409, 'ACTION_EXPIRED');
    }

    action = { ...action, status: 'CONFIRMED', confirmed_at: new Date().toISOString() };
    await this.deps.store.saveAction(action);

    try {
      const result = await this.execute(action, principal);
      action = { ...action, status: 'EXECUTED', result };
      await this.deps.store.saveAction(action);
      return action;
    } catch (error) {
      action = {
        ...action,
        status: 'FAILED',
        result: { error: error instanceof Error ? error.message : 'Execution failed.' },
      };
      await this.deps.store.saveAction(action);
      throw error;
    }
  }

  async get(actionId: string): Promise<PendingAction> {
    const action = await this.deps.store.findAction(actionId);
    if (!action) throw new GovernanceError('Action not found.', 404, 'NOT_FOUND');
    return action;
  }

  private async execute(action: PendingAction, principal: LinePrincipal): Promise<unknown> {
    const p = action.payload;
    switch (action.type) {
      case 'create_requirement':
        return this.deps.jira.createIssue({
          projectKey: required(p, 'project_key'),
          summary: required(p, 'summary'),
          issueType: required(p, 'issue_type'),
          description: typeof p.description === 'string' ? p.description : '',
          workType: typeof p.work_type === 'string' ? p.work_type : undefined,
          requestedBy: principal.jira_account_id,
        });
      case 'update_requirement':
        return this.deps.jira.updateIssue(required(p, 'issue_key'), {
          summary: typeof p.summary === 'string' ? p.summary : undefined,
          description: typeof p.description === 'string' ? p.description : undefined,
        });
      case 'provide_information':
        return this.deps.jira.addComment(required(p, 'issue_key'), required(p, 'message'));
      case 'approve_plan':
        return this.deps.approvePlan(required(p, 'plan_id'), principal);
      case 'execute_plan':
        return this.deps.executePlan(required(p, 'plan_id'));
      case 'cancel_job':
        return this.deps.jobAction(required(p, 'job_id'), 'cancel');
      case 'retry_job':
        return this.deps.jobAction(required(p, 'job_id'), 'retry');
      case 'request_merge':
        return this.requestMerge(p);
      case 'request_deployment':
        return this.requestDeployment(p);
      case 'request_rollback':
        return this.requestRollback(p);
    }
  }

  private async requestMerge(p: Record<string, unknown>): Promise<unknown> {
    const repository = repositoryName(p);
    const number = Number(p.pr_number);
    if (!Number.isInteger(number) || number < 1) throw new GovernanceError('pr_number is invalid.');
    return this.deps.github.enableAutoMerge(repository, number);
  }

  private async requestDeployment(p: Record<string, unknown>): Promise<unknown> {
    const repository = repositoryName(p);
    const requestedWorkflow = required(p, 'workflow');
    const ref = required(p, 'ref');
    const environment = required(p, 'environment');
    if (!['dev', 'uat', 'prod'].includes(environment)) {
      throw new GovernanceError('Deployment target is not permitted.');
    }
    const deployment = await this.deps.github.authoritativeDeployment(repository, environment);
    if (requestedWorkflow !== deployment.workflow) {
      throw new GovernanceError(
        'Requested workflow does not match the authoritative project registry.',
        409,
        'DEPLOYMENT_CONFIGURATION_DRIFT',
      );
    }
    if (
      environment === 'prod' &&
      ref !== deployment.defaultBranch &&
      !/^prod-[A-Za-z0-9._-]+$/.test(ref)
    ) {
      throw new GovernanceError(
        'Production ref must be the default branch or an approved prod-* release tag.',
        409,
        'INVALID_PRODUCTION_REF',
      );
    }
    await this.deps.github.dispatchWorkflow(repository, deployment.workflow, ref, {
      environment,
      requested_via: 'line',
    });
    return {
      repository,
      workflow: deployment.workflow,
      ref,
      environment,
      state: environment === 'prod' ? 'WAITING_GITHUB_APPROVAL' : 'DISPATCHED',
    };
  }

  private async requestRollback(p: Record<string, unknown>): Promise<unknown> {
    const repository = repositoryName(p);
    const ref = required(p, 'ref');
    const rollbackTo = required(p, 'rollback_to');
    const rollback = await this.deps.github.authoritativeDeployment(repository, 'prod', 'rollback');
    if (ref !== rollback.defaultBranch && !/^prod-[A-Za-z0-9._-]+$/.test(ref)) {
      throw new GovernanceError(
        'Rollback workflow ref must be the default branch or an approved prod-* release tag.',
        409,
        'INVALID_PRODUCTION_REF',
      );
    }
    await this.deps.github.dispatchWorkflow(repository, rollback.workflow, ref, {
      environment: 'prod',
      rollback_to: rollbackTo,
      requested_via: 'line',
    });
    return {
      repository,
      workflow: rollback.workflow,
      ref,
      rollback_to: rollbackTo,
      environment: 'prod',
      state: 'WAITING_GITHUB_APPROVAL',
    };
  }
}

function required(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  if (typeof value !== 'string' || !value.trim()) throw new GovernanceError(`${key} is required.`);
  return value.trim();
}

function repositoryName(payload: Record<string, unknown>): string {
  const value = required(payload, 'repository');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) throw new GovernanceError('repository is invalid.');
  return value;
}
