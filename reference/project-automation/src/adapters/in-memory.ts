import type { PlanStore, ScaffoldPublisher } from '../ports.js';
import type { AutomationPlan } from '../types.js';

export class InMemoryPlanStore implements PlanStore {
  private readonly plans = new Map<string, AutomationPlan>();

  async findById(planId: string): Promise<AutomationPlan | null> {
    return this.plans.get(planId) ?? null;
  }

  async findByRequestId(requestId: string): Promise<AutomationPlan | null> {
    return [...this.plans.values()].find((plan) => plan.request.request_id === requestId) ?? null;
  }

  async save(plan: AutomationPlan): Promise<void> {
    this.plans.set(plan.plan_id, structuredClone(plan));
  }
}

export class InMemoryScaffoldPublisher implements ScaffoldPublisher {
  readonly published = new Map<string, Record<string, string>>();

  async publish(outputName: string, files: Record<string, string>): Promise<{ path: string; files: string[] }> {
    this.published.set(outputName, structuredClone(files));
    return { path: outputName, files: Object.keys(files).sort() };
  }
}
