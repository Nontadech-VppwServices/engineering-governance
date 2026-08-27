import { randomUUID } from 'node:crypto';
import { hasRole } from './security.js';
import type { ActionStore } from './store.js';
import type { ActionType, LinePrincipal, PendingAction, Role } from './types.js';

export class ControlError extends Error { constructor(message: string, readonly status = 400, readonly code = 'INVALID_REQUEST') { super(message); } }
export interface ActionExecutor { execute(action: PendingAction, principal: LinePrincipal): Promise<unknown>; }
const REQUIRED_ROLE: Record<ActionType, Role> = { create_requirement: 'requester', update_requirement: 'requester', approve_plan: 'approver', execute_plan: 'approver', provide_information: 'requester', request_merge: 'approver', request_deployment: 'deployer', request_rollback: 'deployer', cancel_job: 'requester', retry_job: 'requester' };

export class WorkflowControlService {
  constructor(private readonly store: ActionStore, private readonly executor: ActionExecutor, private readonly ttlSeconds = 600, private readonly events?: { publish(action: PendingAction): Promise<void> }) {}
  async draft(input: { idempotency_key: string; type: ActionType; payload: Record<string, unknown> }, principal: LinePrincipal): Promise<PendingAction> {
    if (!input.idempotency_key?.trim() || !REQUIRED_ROLE[input.type] || !input.payload || typeof input.payload !== 'object') throw new ControlError('Invalid action draft.');
    if (!hasRole(principal, REQUIRED_ROLE[input.type])) throw new ControlError('Role is not permitted for this action.', 403, 'FORBIDDEN');
    const existing = await this.store.findByIdempotencyKey(input.idempotency_key); if (existing) return existing;
    const now = new Date();
    const action: PendingAction = { schema_version: 1, action_id: `act_${randomUUID()}`, idempotency_key: input.idempotency_key, type: input.type, payload: structuredClone(input.payload), requested_by: principal.line_user_id, status: 'DRAFT', expires_at: new Date(now.getTime() + this.ttlSeconds * 1000).toISOString(), created_at: now.toISOString(), confirmed_at: null, result: null };
    await this.store.save(action); return action;
  }
  async confirm(id: string, principal: LinePrincipal): Promise<PendingAction> {
    let action = await this.store.findById(id); if (!action) throw new ControlError('Action not found.', 404, 'NOT_FOUND');
    if (action.requested_by !== principal.line_user_id || !principal.direct_message) throw new ControlError('Confirmation must be performed by the requester in a 1:1 chat.', 403, 'PRIVATE_CONFIRMATION_REQUIRED');
    if (!hasRole(principal, REQUIRED_ROLE[action.type])) throw new ControlError('Role is not permitted for this action.', 403, 'FORBIDDEN');
    if (action.status === 'EXECUTED') return action;
    if (action.status !== 'DRAFT') throw new ControlError('Action is not confirmable.', 409, 'INVALID_STATE');
    if (Date.parse(action.expires_at) <= Date.now()) { action = { ...action, status: 'EXPIRED' }; await this.store.save(action); throw new ControlError('Action expired.', 409, 'ACTION_EXPIRED'); }
    action = { ...action, status: 'CONFIRMED', confirmed_at: new Date().toISOString() }; await this.store.save(action);
    try { const result = await this.executor.execute(action, principal); action = { ...action, status: 'EXECUTED', result }; await this.store.save(action); await this.events?.publish(action); return action; }
    catch (error) { action = { ...action, status: 'FAILED', result: { error: error instanceof Error ? error.message : 'Execution failed.' } }; await this.store.save(action); await this.events?.publish(action); throw error; }
  }
  async get(id: string): Promise<PendingAction> { const action = await this.store.findById(id); if (!action) throw new ControlError('Action not found.', 404, 'NOT_FOUND'); return action; }
}
