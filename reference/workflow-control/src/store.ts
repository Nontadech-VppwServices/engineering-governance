import type { Pool } from 'pg';
import type { PendingAction } from './types.js';
export interface ActionStore { findById(id: string): Promise<PendingAction | null>; findByIdempotencyKey(key: string): Promise<PendingAction | null>; save(action: PendingAction): Promise<void>; }
export class PostgresActionStore implements ActionStore {
  constructor(private readonly pool: Pool) {}
  async findById(id: string) { const result = await this.pool.query<{ payload: PendingAction }>('SELECT payload FROM workflow_actions WHERE action_id=$1', [id]); return result.rows[0]?.payload ?? null; }
  async findByIdempotencyKey(key: string) { const result = await this.pool.query<{ payload: PendingAction }>('SELECT payload FROM workflow_actions WHERE idempotency_key=$1', [key]); return result.rows[0]?.payload ?? null; }
  async save(action: PendingAction) { await this.pool.query(`INSERT INTO workflow_actions(action_id,idempotency_key,status,payload,created_at,updated_at) VALUES($1,$2,$3,$4::jsonb,$5,now()) ON CONFLICT(action_id) DO UPDATE SET status=EXCLUDED.status,payload=EXCLUDED.payload,updated_at=now()`, [action.action_id, action.idempotency_key, action.status, JSON.stringify(action), action.created_at]); }
}
export class MemoryActionStore implements ActionStore {
  private values = new Map<string, PendingAction>();
  async findById(id: string) { return this.values.get(id) ?? null; }
  async findByIdempotencyKey(key: string) { return [...this.values.values()].find((item) => item.idempotency_key === key) ?? null; }
  async save(action: PendingAction) { this.values.set(action.action_id, structuredClone(action)); }
}
