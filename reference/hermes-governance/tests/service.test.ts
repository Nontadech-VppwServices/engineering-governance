import { describe, expect, it } from 'vitest';
import { HermesGovernanceService, InMemoryLearningStore, InMemorySkillPublisher, type ImprovementProposal, type LearningObservation, type MemoryRecord } from '../src/index.js';
const observation: LearningObservation = { schema_version: 1, observation_id: 'obs-1', scope: 'PIM', execution_ref: 'job:PIM-1', outcome: 'correction', evidence: 'API checks must run before E2E.', suggested_action: 'Add an ordering rule to the skill.', created_at: '2026-08-27T00:00:00.000Z' };
const proposal = { schema_version: 1 as const, proposal_id: 'proposal-1', kind: 'skill_create' as const, risk: 'medium' as const, skill: { name: 'quality-gate-order', description: 'Run governed quality gates in their required order.', version: '1.0.0', content: '# Procedure\n\nResolve Effective Context, then run required quality gates.' }, observation_ids: ['obs-1'] };

describe('HermesGovernanceService', () => {
  it('stores only non-authoritative, sourced, non-secret memory', async () => {
    const service = new HermesGovernanceService(new InMemoryLearningStore(), new InMemorySkillPublisher());
    const memory: MemoryRecord = { schema_version: 1, memory_id: 'mem-1', scope: 'PIM', kind: 'lesson', content: 'API tests are a required gate; re-check policy before acting.', source_refs: [{ source_type: 'policy', locator: 'policies/testing.md', captured_at: '2026-08-27T00:00:00.000Z' }], classification: 'internal', authoritative: false, status: 'active', created_at: '2026-08-27T00:00:00.000Z' };
    await service.recordMemory(memory, 'hermes'); const result = await service.searchMemories('PIM', 'API tests');
    expect(result.authoritative).toBe(false); expect(result.records).toHaveLength(1); expect(result.warning).toContain('Re-check');
    await expect(service.recordMemory({ ...memory, memory_id: 'mem-2', content: 'password=super-secret-value' }, 'hermes')).rejects.toMatchObject({ code: 'SECRET_CONTENT_REJECTED' });
    await expect(service.revokeMemory('mem-1', 'hermes', 'ai')).rejects.toMatchObject({ code: 'HUMAN_APPROVAL_REQUIRED' });
    expect((await service.revokeMemory('mem-1', 'data-owner', 'human')).status).toBe('revoked');
    expect((await service.searchMemories('PIM')).records).toHaveLength(0);
  });

  it('requires passing evaluation and a human approval before publishing', async () => {
    const publisher = new InMemorySkillPublisher(); const service = new HermesGovernanceService(new InMemoryLearningStore(), publisher);
    await service.recordObservation(observation, 'hermes'); await service.createProposal(proposal, 'hermes');
    await expect(service.publish('proposal-1', 'hermes')).rejects.toMatchObject({ code: 'APPROVAL_REQUIRED' });
    await service.evaluate('proposal-1', { evaluation_id: 'eval-1', actor_id: 'ci', suite: 'skill-regression', passed: true, evidence_ref: 'ci://1', evaluated_at: '2026-08-27T01:00:00.000Z' });
    await expect(service.approve('proposal-1', 'hermes', 'ai')).rejects.toMatchObject({ code: 'HUMAN_APPROVAL_REQUIRED' });
    const approved = await service.approve('proposal-1', 'owner@example.com', 'human'); expect(approved.state).toBe('APPROVED');
    const published = await service.publish('proposal-1', 'phase6-service'); expect(published.state).toBe('PUBLISHED'); expect(publisher.skills.size).toBe(1);
  });

  it('requires two distinct human reviewers for high-risk skills', async () => {
    const service = new HermesGovernanceService(new InMemoryLearningStore(), new InMemorySkillPublisher()); await service.recordObservation(observation, 'hermes');
    await service.createProposal({ ...proposal, proposal_id: 'high-1', risk: 'high' }, 'hermes');
    await service.evaluate('high-1', { evaluation_id: 'eval-high', actor_id: 'ci', suite: 'security', passed: true, evidence_ref: 'ci://2', evaluated_at: '2026-08-27T01:00:00.000Z' });
    expect((await service.approve('high-1', 'reviewer-1', 'human')).state).toBe('WAITING_HUMAN_APPROVAL');
    expect((await service.approve('high-1', 'reviewer-2', 'human')).state).toBe('APPROVED');
  });
});
