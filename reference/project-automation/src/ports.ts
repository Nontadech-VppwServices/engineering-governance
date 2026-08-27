import type { AutomationPlan } from './types.js';

export interface PlanStore {
  findById(planId: string): Promise<AutomationPlan | null>;
  findByRequestId(requestId: string): Promise<AutomationPlan | null>;
  save(plan: AutomationPlan): Promise<void>;
}

export interface ScaffoldPublisher {
  publish(outputName: string, files: Record<string, string>): Promise<{ path: string; files: string[] }>;
}
