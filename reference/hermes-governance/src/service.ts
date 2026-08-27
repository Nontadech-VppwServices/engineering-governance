import { randomUUID } from 'node:crypto';
import type { LearningStore, SkillPublisher } from './ports.js';
import type { AuditEvent, Evaluation, ImprovementProposal, LearningObservation, MemoryRecord } from './types.js';

export class LearningError extends Error { constructor(message: string, readonly statusCode = 400, readonly code = 'INVALID_REQUEST') { super(message); } }

export class HermesGovernanceService {
  constructor(private readonly store: LearningStore, private readonly publisher: SkillPublisher) {}

  async recordMemory(memory: MemoryRecord, actorId: string): Promise<MemoryRecord> {
    validateMemory(memory);
    const existing = await this.store.findMemory(memory.memory_id); if (existing) return existing;
    if (memory.supersedes) {
      const previous = await this.store.findMemory(memory.supersedes); if (!previous) throw new LearningError('Superseded memory does not exist.');
      if (previous.scope !== memory.scope || previous.status !== 'active') throw new LearningError('Only active memory in the same scope can be superseded.', 409, 'INVALID_SUPERSESSION');
      await this.store.saveMemory({ ...previous, status: 'superseded' }); await this.audit('memory', previous.memory_id, 'superseded', actorId, { replacement: memory.memory_id });
    }
    await this.store.saveMemory(memory); await this.audit('memory', memory.memory_id, 'created', actorId); return memory;
  }

  async revokeMemory(memoryId: string, actorId: string, actorType: string): Promise<MemoryRecord> {
    const value = await this.store.findMemory(memoryId); if (!value) throw new LearningError('Memory not found.', 404, 'MEMORY_NOT_FOUND');
    if (actorType !== 'human' || !actorId.trim()) throw new LearningError('A named human actor is required to revoke memory.', 403, 'HUMAN_APPROVAL_REQUIRED');
    if (value.status === 'revoked') return value;
    const revoked = { ...value, status: 'revoked' as const }; await this.store.saveMemory(revoked); await this.audit('memory', memoryId, 'revoked', actorId); return revoked;
  }

  async searchMemories(scope: string, query?: string): Promise<{ authoritative: false; warning: string; records: MemoryRecord[] }> {
    if (!scope.trim()) throw new LearningError('scope is required.');
    const now = Date.now(); const records = (await this.store.searchMemories(scope, query)).filter((item) => item.status === 'active' && (!item.expires_at || Date.parse(item.expires_at) > now));
    return { authoritative: false, warning: 'Memory is contextual cache. Re-check cited authoritative sources before material action.', records };
  }

  async recordObservation(value: LearningObservation, actorId: string): Promise<LearningObservation> {
    if (!value || typeof value !== 'object' || value.schema_version !== 1 || !value.observation_id?.trim() || !value.scope?.trim() || !value.execution_ref?.trim() || !value.evidence?.trim() || !value.suggested_action?.trim() || !['success', 'failure', 'correction', 'near_miss'].includes(value.outcome) || Number.isNaN(Date.parse(value.created_at))) throw new LearningError('Observation fields are incomplete or invalid.');
    assertNoSecret(`${value.evidence}\n${value.suggested_action}`); const existing = await this.store.findObservation(value.observation_id); if (existing) return existing;
    await this.store.saveObservation(value); await this.audit('observation', value.observation_id, 'created', actorId); return value;
  }

  async createProposal(input: Omit<ImprovementProposal, 'state' | 'evaluations' | 'approvals' | 'created_at' | 'updated_at' | 'published_path'>, actorId: string): Promise<ImprovementProposal> {
    if (!input || typeof input !== 'object' || input.schema_version !== 1 || !input.proposal_id?.trim() || !['skill_create', 'skill_update', 'skill_retire'].includes(input.kind) || !['low', 'medium', 'high'].includes(input.risk) || !input.skill || !/^[a-z0-9][a-z0-9-]*$/.test(input.skill.name) || !/^[A-Za-z0-9._-]+$/.test(input.skill.version) || !input.skill.description?.trim() || !input.skill.content?.trim() || !Array.isArray(input.observation_ids) || input.observation_ids.length === 0 || input.observation_ids.some((id) => typeof id !== 'string' || !id.trim())) throw new LearningError('Proposal identity, risk, skill, and observations are required.');
    const existing = await this.store.findProposal(input.proposal_id); if (existing) return existing;
    for (const id of new Set(input.observation_ids)) if (!await this.store.findObservation(id)) throw new LearningError(`Observation not found: ${id}`, 409, 'OBSERVATION_NOT_FOUND');
    assertNoSecret(input.skill.content); const now = new Date().toISOString();
    const proposal: ImprovementProposal = { ...input, state: 'PROPOSED', evaluations: [], approvals: [], created_at: now, updated_at: now, published_path: null };
    await this.store.saveProposal(proposal); await this.audit('proposal', proposal.proposal_id, 'created', actorId, { risk: proposal.risk }); return proposal;
  }

  async getProposal(id: string): Promise<ImprovementProposal> { const value = await this.store.findProposal(id); if (!value) throw new LearningError('Proposal not found.', 404, 'PROPOSAL_NOT_FOUND'); return value; }

  async evaluate(id: string, evaluation: Evaluation): Promise<ImprovementProposal> {
    let value = await this.getProposal(id); if (!['PROPOSED', 'EVALUATING'].includes(value.state)) throw new LearningError('Proposal cannot be evaluated in its current state.', 409, 'INVALID_STATE');
    if (!evaluation || typeof evaluation !== 'object' || !evaluation.evaluation_id?.trim() || !evaluation.actor_id?.trim() || !evaluation.suite?.trim() || typeof evaluation.passed !== 'boolean' || !evaluation.evidence_ref?.trim() || Number.isNaN(Date.parse(evaluation.evaluated_at))) throw new LearningError('Evaluation evidence is required and must be valid.');
    if (value.evaluations.some((item) => item.evaluation_id === evaluation.evaluation_id)) return value;
    const evaluations = [...value.evaluations, evaluation]; const state = evaluations.every((item) => item.passed) ? 'WAITING_HUMAN_APPROVAL' as const : 'EVALUATING' as const;
    value = { ...value, evaluations, state, updated_at: new Date().toISOString() }; await this.store.saveProposal(value); await this.audit('proposal', id, evaluation.passed ? 'evaluation_passed' : 'evaluation_failed', evaluation.actor_id, { suite: evaluation.suite }); return value;
  }

  async approve(id: string, actorId: string, actorType: string): Promise<ImprovementProposal> {
    let value = await this.getProposal(id); if (actorType !== 'human' || !actorId.trim()) throw new LearningError('A named human reviewer is required.', 403, 'HUMAN_APPROVAL_REQUIRED');
    if (value.state !== 'WAITING_HUMAN_APPROVAL') throw new LearningError('All evaluations must pass before approval.', 409, 'EVALUATION_GATE_REQUIRED');
    if (value.approvals.some((item) => item.actor_id === actorId)) return value;
    const approvals = [...value.approvals, { actor_id: actorId, actor_type: 'human' as const, approved_at: new Date().toISOString() }]; const needed = value.risk === 'high' ? 2 : 1;
    value = { ...value, approvals, state: approvals.length >= needed ? 'APPROVED' : 'WAITING_HUMAN_APPROVAL', updated_at: new Date().toISOString() };
    await this.store.saveProposal(value); await this.audit('proposal', id, 'approved', actorId, { approvals: approvals.length, required: needed }); return value;
  }

  async reject(id: string, actorId: string, actorType: string): Promise<ImprovementProposal> {
    let value = await this.getProposal(id); if (actorType !== 'human' || !actorId.trim()) throw new LearningError('A named human reviewer is required.', 403, 'HUMAN_APPROVAL_REQUIRED');
    if (['PUBLISHED', 'REJECTED'].includes(value.state)) throw new LearningError('Proposal cannot be rejected in its current state.', 409, 'INVALID_STATE');
    value = { ...value, state: 'REJECTED', updated_at: new Date().toISOString() }; await this.store.saveProposal(value); await this.audit('proposal', id, 'rejected', actorId); return value;
  }

  async publish(id: string, actorId: string): Promise<ImprovementProposal> {
    let value = await this.getProposal(id); if (value.state === 'PUBLISHED') return value; if (value.state !== 'APPROVED') throw new LearningError('Proposal must be approved before publication.', 409, 'APPROVAL_REQUIRED');
    const path = await this.publisher.publish(value); value = { ...value, state: 'PUBLISHED', published_path: path, updated_at: new Date().toISOString() };
    await this.store.saveProposal(value); await this.audit('proposal', id, 'published', actorId, { path }); return value;
  }

  private async audit(subjectType: AuditEvent['subject_type'], subjectId: string, action: string, actorId: string, details?: Record<string, unknown>) { await this.store.appendAudit({ event_id: randomUUID(), subject_type: subjectType, subject_id: subjectId, action, actor_id: actorId || 'unknown', occurred_at: new Date().toISOString(), details }); }
}

function validateMemory(value: MemoryRecord): void {
  if (!value || typeof value !== 'object' || value.schema_version !== 1 || value.authoritative !== false || !value.memory_id?.trim() || !value.scope?.trim() || !value.content?.trim() || !Array.isArray(value.source_refs) || value.source_refs.length === 0) throw new LearningError('Memory must be non-authoritative and include identity, scope, content, and provenance.');
  if (!['fact', 'preference', 'lesson', 'summary'].includes(value.kind) || !['public', 'internal', 'confidential'].includes(value.classification) || value.status !== 'active' || Number.isNaN(Date.parse(value.created_at)) || (value.expires_at != null && Number.isNaN(Date.parse(value.expires_at)))) throw new LearningError('Memory kind, classification, status, or dates are invalid.');
  if (value.content.length > 20000) throw new LearningError('Memory content is too large.');
  if (value.source_refs.some((ref) => !ref || !['jira', 'repository', 'adr', 'bdr', 'policy', 'runtime', 'session', 'human'].includes(ref.source_type) || !ref.locator?.trim() || Number.isNaN(Date.parse(ref.captured_at)))) throw new LearningError('Memory provenance is invalid.');
  assertNoSecret(value.content);
}

function assertNoSecret(content: string): void {
  const patterns = [/-----BEGIN [A-Z ]*PRIVATE KEY-----/i, /\b(?:password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret)\s*[:=]\s*[^\s]{6,}/i, /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/];
  if (patterns.some((pattern) => pattern.test(content))) throw new LearningError('Secret-like content is prohibited.', 422, 'SECRET_CONTENT_REJECTED');
}
