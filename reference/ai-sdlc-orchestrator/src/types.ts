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

export interface IntakeEvent {
  schema_version: 1;
  event_id: string;
  occurred_at: string;
  issue_key: string;
  event_type: 'issue_created' | 'issue_updated' | 'issue_assigned' | 'manual_trigger';
  work_type?: WorkType | null;
  component?: string | null;
  trigger_reason?: string | null;
  plan_approved?: boolean;
}

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
}

export interface RoutedRepository {
  repository: string;
  role: string;
  confidence: number;
  reason: string;
}

export interface EffectiveContextView {
  request_id: string;
  project: {
    id: string;
    type?: string | null;
    archetype?: string | null;
  };
  jira: null | {
    issue_key: string;
    summary: string | null;
    component: string | null;
  };
  routing: {
    status: 'resolved' | 'multi_repo' | 'analyzing_candidates' | 'routing_conflict' | 'unmapped_component' | 'waiting_information';
    repositories: RoutedRepository[];
  };
  compliance: {
    testing: string | null;
  };
  decision: {
    can_plan: boolean;
    can_modify_code: boolean;
    can_create_pr: boolean;
    can_deploy_production: false;
    reason: string | null;
  };
  conflicts: Array<{ type: string; blocking: boolean; message: string }>;
  unresolved: string[];
}

export interface QualityGateResult {
  key: string;
  required: boolean;
  status: 'passed' | 'failed' | 'not_run' | 'not_applicable';
  details?: string | null;
}

export interface AgentExecutionRequest {
  schema_version: 1;
  job_id: string;
  jira_issue_key: string;
  work_type: WorkType;
  repository: string;
  base_branch: string;
  working_branch: string;
  requirement?: string;
  effective_context: EffectiveContextView;
  constraints: {
    allow_merge: false;
    allow_production_deploy: false;
    allow_production_credentials: false;
  };
}

export interface AgentExecutionResult {
  schema_version: 1;
  job_id: string;
  repository: string;
  status: 'completed' | 'blocked' | 'failed' | 'analysis_only';
  summary?: string | null;
  commit_sha?: string | null;
  changed_files: string[];
  quality_gates: QualityGateResult[];
  blocking_reason?: string | null;
}

export interface PullRequestMergedEvent {
  repository: string;
  pr_number: number;
  merged: boolean;
  jira_issue_key?: string | null;
  job_id?: string | null;
}
