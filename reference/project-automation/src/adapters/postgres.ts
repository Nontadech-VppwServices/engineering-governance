import type { Pool } from 'pg';
import type { PlanStore } from '../ports.js';
import type { AutomationPlan } from '../types.js';

export class PostgresPlanStore implements PlanStore {
  constructor(private readonly pool: Pool) {}

  async findById(planId: string): Promise<AutomationPlan | null> {
    const result = await this.pool.query<{ payload: AutomationPlan }>('SELECT payload FROM project_automation_plans WHERE plan_id = $1', [planId]);
    return result.rows[0]?.payload ?? null;
  }

  async findByRequestId(requestId: string): Promise<AutomationPlan | null> {
    const result = await this.pool.query<{ payload: AutomationPlan }>('SELECT payload FROM project_automation_plans WHERE request_id = $1', [requestId]);
    return result.rows[0]?.payload ?? null;
  }

  async save(plan: AutomationPlan): Promise<void> {
    await this.pool.query(
      `INSERT INTO project_automation_plans (plan_id, request_id, state, payload, created_at, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6)
       ON CONFLICT (plan_id) DO UPDATE SET state = EXCLUDED.state, payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at`,
      [plan.plan_id, plan.request.request_id, plan.state, JSON.stringify(plan), plan.created_at, plan.updated_at],
    );
  }
}
