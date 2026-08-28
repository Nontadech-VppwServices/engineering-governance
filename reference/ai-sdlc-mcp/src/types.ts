export type ExecutionPhase = 'analyze' | 'plan' | 'implement';

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
  status: 'passed' | 'failed' | 'not_run' | 'not_applicable';
  required: boolean;
  details?: string | null;
}

export interface AiSdlcMcpPorts {
  getEffectiveContext(): Promise<unknown>;
  getJiraIssue(): Promise<unknown>;
  searchRepository(repository: string, query: string): Promise<unknown>;
  readRepositoryFile(repository: string, path: string): Promise<unknown>;
  runQualityGate(repository: string, gateKey: string): Promise<QualityGateVerdict>;
  isTrustedQualityVerified(repository: string): Promise<boolean>;
  ensureWorkingBranch(repository: string, branch: string): Promise<unknown>;
  commitVerifiedChanges(repository: string, branch: string, message: string): Promise<unknown>;
  pushWorkingBranch(repository: string, branch: string): Promise<unknown>;
  createPullRequest(repository: string, branch: string, title: string, body: string): Promise<unknown>;
  addJiraComment(comment: string): Promise<unknown>;
}
