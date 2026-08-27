export type AutomationKind = 'new_module' | 'new_project';
export type PlanState = 'WAITING_PLAN_APPROVAL' | 'APPROVED' | 'EXECUTING' | 'COMPLETED' | 'BLOCKED' | 'FAILED';

export interface ContextGate {
  decision: { can_plan: boolean; can_modify_code: boolean; reason?: string | null };
  conflicts?: Array<{ blocking: boolean; message: string }>;
}

export interface ModuleRequest {
  project_id: string;
  module_name: string;
  repository: string;
  target_path: string;
  effective_context: ContextGate;
}

export interface NewProjectRequest {
  id: string;
  name: string;
  domain: string;
  project_type: 'website' | 'web_frontend' | 'fullstack_application' | 'backend_service' | 'rpa' | 'rpa_export' | 'browser_automation';
  deployment_type: 'aws' | 'on_prem';
  repository: string;
}

export interface AutomationRequest {
  schema_version: 1;
  request_id: string;
  jira_issue_key: string;
  kind: AutomationKind;
  requested_at: string;
  requested_by: string;
  module?: ModuleRequest;
  project?: NewProjectRequest;
}

export interface Approval {
  actor_id: string;
  actor_type: 'human';
  approved_at: string;
}

export interface PlanHistory {
  state: PlanState;
  entered_at: string;
  actor: 'system' | 'human';
  reason?: string | null;
}

export interface PlanOutput {
  type: 'scaffold' | 'phase4_handoff';
  path?: string;
  files?: string[];
  handoff?: Record<string, unknown>;
}

export interface AutomationPlan {
  schema_version: 1;
  plan_id: string;
  request: AutomationRequest;
  state: PlanState;
  archetype: string;
  steps: string[];
  approvals: Approval[];
  history: PlanHistory[];
  output: PlanOutput | null;
  created_at: string;
  updated_at: string;
}
