import type { LearningStore, SkillPublisher } from '../ports.js';
import type { AuditEvent, ImprovementProposal, LearningObservation, MemoryRecord, SkillDraft } from '../types.js';
export class InMemoryLearningStore implements LearningStore {
  readonly memories = new Map<string, MemoryRecord>(); readonly observations = new Map<string, LearningObservation>(); readonly proposals = new Map<string, ImprovementProposal>(); readonly audit: AuditEvent[] = [];
  async findMemory(id: string) { return this.memories.get(id) ?? null; }
  async saveMemory(value: MemoryRecord) { this.memories.set(value.memory_id, structuredClone(value)); }
  async searchMemories(scope: string, query?: string) { const needle = query?.toLowerCase(); return [...this.memories.values()].filter((item) => item.scope === scope && (!needle || item.content.toLowerCase().includes(needle))); }
  async findObservation(id: string) { return this.observations.get(id) ?? null; }
  async saveObservation(value: LearningObservation) { this.observations.set(value.observation_id, structuredClone(value)); }
  async findProposal(id: string) { return this.proposals.get(id) ?? null; }
  async saveProposal(value: ImprovementProposal) { this.proposals.set(value.proposal_id, structuredClone(value)); }
  async appendAudit(value: AuditEvent) { this.audit.push(structuredClone(value)); }
}
export class InMemorySkillPublisher implements SkillPublisher { readonly skills = new Map<string, SkillDraft>(); async publish(proposal: ImprovementProposal) { const suffix = proposal.kind === 'skill_retire' ? 'RETIREMENT.md' : 'SKILL.md'; const path = `${proposal.skill.name}-${proposal.skill.version}/${suffix}`; this.skills.set(path, structuredClone(proposal.skill)); return path; } }
