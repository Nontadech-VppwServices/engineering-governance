import type { Pool } from 'pg';
import type { LearningStore } from '../ports.js';
import type { AuditEvent, ImprovementProposal, LearningObservation, MemoryRecord } from '../types.js';
export class PostgresLearningStore implements LearningStore {
  constructor(private readonly pool: Pool) {}
  async findMemory(id: string) { return this.find<MemoryRecord>('memory', id); }
  async saveMemory(value: MemoryRecord) { await this.save('memory', value.memory_id, value); }
  async searchMemories(scope: string, query?: string): Promise<MemoryRecord[]> {
    const values: unknown[] = [scope]; let predicate = '';
    if (query) { values.push(`%${query}%`); predicate = ` AND payload->>'content' ILIKE $2`; }
    const result = await this.pool.query<{ payload: MemoryRecord }>(`SELECT payload FROM hermes_learning_records WHERE record_type = 'memory' AND payload->>'scope' = $1${predicate} ORDER BY created_at DESC`, values);
    return result.rows.map((row) => row.payload);
  }
  async findObservation(id: string) { return this.find<LearningObservation>('observation', id); }
  async saveObservation(value: LearningObservation) { await this.save('observation', value.observation_id, value); }
  async findProposal(id: string) { return this.find<ImprovementProposal>('proposal', id); }
  async saveProposal(value: ImprovementProposal) { await this.save('proposal', value.proposal_id, value); }
  async appendAudit(value: AuditEvent) { await this.pool.query(`INSERT INTO hermes_learning_audit (event_id, subject_type, subject_id, action, actor_id, occurred_at, details) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`, [value.event_id, value.subject_type, value.subject_id, value.action, value.actor_id, value.occurred_at, JSON.stringify(value.details ?? {})]); }
  private async find<T>(type: string, id: string): Promise<T | null> { const result = await this.pool.query<{ payload: T }>('SELECT payload FROM hermes_learning_records WHERE record_type = $1 AND record_id = $2', [type, id]); return result.rows[0]?.payload ?? null; }
  private async save<T>(type: string, id: string, payload: T): Promise<void> { await this.pool.query(`INSERT INTO hermes_learning_records (record_type, record_id, payload, created_at, updated_at) VALUES ($1,$2,$3::jsonb,now(),now()) ON CONFLICT (record_type, record_id) DO UPDATE SET payload=EXCLUDED.payload, updated_at=now()`, [type, id, JSON.stringify(payload)]); }
}
