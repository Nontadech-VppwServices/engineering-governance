import type { AuditEvent, ImprovementProposal, LearningObservation, MemoryRecord } from './types.js';
export interface LearningStore {
  findMemory(id: string): Promise<MemoryRecord | null>; saveMemory(value: MemoryRecord): Promise<void>; searchMemories(scope: string, query?: string): Promise<MemoryRecord[]>;
  findObservation(id: string): Promise<LearningObservation | null>; saveObservation(value: LearningObservation): Promise<void>;
  findProposal(id: string): Promise<ImprovementProposal | null>; saveProposal(value: ImprovementProposal): Promise<void>;
  appendAudit(value: AuditEvent): Promise<void>;
}
export interface SkillPublisher { publish(proposal: ImprovementProposal): Promise<string>; }
