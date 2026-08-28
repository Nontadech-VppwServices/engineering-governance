// Shared contracts. Ported verbatim where an existing schema in schemas/ or a
// persisted payload depends on the exact field names.

export type ExecutionPhase = 'analyze' | 'plan' | 'implement';
export type WorkType = 'bug' | 'new_module' | 'new_project' | 'analysis';

export type JobState =
  | 'RECEIVED'
  | 'RESOLVING_CONTEXT'
  | 'WAITING_INFORMATION'
  | 'ANALYZING'
  | 'PLANNING'
  | 'WAITING_PLAN_APPROVAL'
  | 'CODING'
  | 'TESTING'
  | 'CREATING_PR'
  | 'WAITING_REVIEW'
  | 'DONE'
  | 'FAILED'
  | 'CANCELLED';

export interface StateHistoryEntry {
  state: JobState;
  entered_at: string;
  actor: 'system' | 'ai' | 'human' | 'github' | 'jira';
  reason?: string | null;
}

export interface PullRequestRef {
  repository: string;
  number: number;
  url: string;
  state: 'open' | 'closed';
  merged: boolean;
}

export interface AiSdlcJob {
  schema_version: 1;
  job_id: string;
  intake_event_id: string;
  jira_issue_key: string;
  work_type: WorkType;
  state: JobState;
  created_at: string;
  updated_at: string;
  repositories: string[];
  prs: PullRequestRef[];
  blocking_reason?: string | null;
  artifacts?: Array<{ kind: 'analysis' | 'plan'; content: string; created_at: string }>;
  history: StateHistoryEntry[];
  // Execution bookkeeping. Quality-gate verdicts live here so that
  // commit/push/PR can be gated on a recorded verdict rather than on the
  // agent's claim that tests passed.
  execution?: {
    archetype: string | null;
    base_branches: Record<string, string>;
    working_branches: Record<string, string>;
    gates: Record<string, Record<string, QualityGateVerdict>>;
  };
}

// --- MCP execution scope (schemas/ai-sdlc-mcp-scope.schema.json) ---

export interface ExecutionScope {
  schema_version: 1;
  job_id: string;
  jira_issue_key: string;
  execution_phase: ExecutionPhase;
  allowed_repositories: string[];
  working_branches: Record<string, string>;
  permissions: {
    can_modify_code: boolean;
    can_create_pr: boolean;
    can_merge: false;
    can_deploy_production: false;
    can_access_production_credentials: false;
  };
  effective_context_ref?: string | null;
}

export interface QualityGateVerdict {
  key: string;
  required: boolean;
  status: 'passed' | 'failed' | 'not_run' | 'not_applicable';
  details?: string | null;
}

// --- Human approval (workflow-control) ---

export type Role = 'viewer' | 'requester' | 'approver' | 'deployer' | 'admin';

export type ActionType =
  | 'create_requirement'
  | 'update_requirement'
  | 'approve_plan'
  | 'execute_plan'
  | 'provide_information'
  | 'request_merge'
  | 'request_deployment'
  | 'request_rollback'
  | 'cancel_job'
  | 'retry_job';

export interface Identity {
  line_user_id: string;
  jira_account_id: string;
  github_login: string;
  roles: Role[];
}

export interface LinePrincipal extends Identity {
  source_type: 'user' | 'group' | 'room';
  direct_message: boolean;
  issued_at: string;
  expires_at: string;
}

export interface PendingAction {
  schema_version: 1;
  action_id: string;
  idempotency_key: string;
  type: ActionType;
  payload: Record<string, unknown>;
  requested_by: string;
  status: 'DRAFT' | 'CONFIRMED' | 'EXECUTED' | 'FAILED' | 'EXPIRED';
  expires_at: string;
  created_at: string;
  confirmed_at: string | null;
  result: unknown;
}

// --- Reporting ---

export interface RpaEvent {
  schema_version: 1;
  event_id: string;
  run_id: string;
  bot_id: string;
  project_id: string;
  environment: 'dev' | 'uat' | 'prod' | 'local' | 'unknown';
  event_type: 'started' | 'completed' | 'failed' | 'cancelled' | 'skipped';
  occurred_at: string;
  metrics?: Record<string, number>;
  error?: { code?: string; summary?: string };
  evidence?: Record<string, unknown>;
}

export interface WorkflowEvent {
  schema_version: 1;
  event_id: string;
  aggregate_type: 'ai_sdlc_job' | 'project_plan' | 'deployment';
  aggregate_id: string;
  event_type: string;
  occurred_at: string;
  payload: Record<string, unknown>;
}

export class GovernanceError extends Error {
  constructor(message: string, readonly status = 400, readonly code = 'INVALID_REQUEST') {
    super(message);
  }
}
