export type MemoryStatus = 'active' | 'superseded' | 'revoked' | 'expired';
export interface SourceRef { source_type: 'jira' | 'repository' | 'adr' | 'bdr' | 'policy' | 'runtime' | 'session' | 'human'; locator: string; captured_at: string; }
export interface MemoryRecord {
  schema_version: 1; memory_id: string; scope: string; kind: 'fact' | 'preference' | 'lesson' | 'summary'; content: string;
  source_refs: SourceRef[]; classification: 'public' | 'internal' | 'confidential'; authoritative: false; status: MemoryStatus;
  created_at: string; expires_at?: string | null; supersedes?: string | null;
}
export interface LearningObservation { schema_version: 1; observation_id: string; scope: string; execution_ref: string; outcome: 'success' | 'failure' | 'correction' | 'near_miss'; evidence: string; suggested_action: string; created_at: string; }
export interface SkillDraft { name: string; description: string; version: string; content: string; }
export interface Evaluation { evaluation_id: string; actor_id: string; suite: string; passed: boolean; evidence_ref: string; evaluated_at: string; }
export interface HumanApproval { actor_id: string; actor_type: 'human'; approved_at: string; }
export type ProposalState = 'PROPOSED' | 'EVALUATING' | 'WAITING_HUMAN_APPROVAL' | 'APPROVED' | 'REJECTED' | 'PUBLISHED';
export interface ImprovementProposal { schema_version: 1; proposal_id: string; kind: 'skill_create' | 'skill_update' | 'skill_retire'; risk: 'low' | 'medium' | 'high'; skill: SkillDraft; observation_ids: string[]; state: ProposalState; evaluations: Evaluation[]; approvals: HumanApproval[]; created_at: string; updated_at: string; published_path?: string | null; }
export interface AuditEvent { event_id: string; subject_type: 'memory' | 'observation' | 'proposal'; subject_id: string; action: string; actor_id: string; occurred_at: string; details?: Record<string, unknown>; }
