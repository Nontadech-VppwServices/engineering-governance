export type RoutingStatus =
  | 'resolved'
  | 'analyzing_candidates'
  | 'multi_repo'
  | 'routing_conflict'
  | 'unmapped_component'
  | 'waiting_information';

export type RepositoryRole =
  | 'primary'
  | 'secondary'
  | 'frontend'
  | 'backend'
  | 'cms'
  | 'worker'
  | 'test_only'
  | 'unknown';

export interface RoutingRepository {
  repository: string;
  role: RepositoryRole;
  confidence: number;
  reason: string;
  evidence: string[];
}

export interface Conflict {
  type:
    | 'architecture_drift'
    | 'configuration_drift'
    | 'documentation_drift'
    | 'routing_conflict'
    | 'unmapped_component'
    | 'unresolved_authority'
    | 'policy_violation'
    | 'stale_context';
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  blocking: boolean;
  message: string;
  sources: string[];
}

export interface RpaRoutingEntry {
  repository: string;
  repositoryRole?: RepositoryRole;
  status?: 'active' | 'deprecated';
}

export interface RpaRoutingTable {
  projectKey: 'RPA';
  components: Record<string, RpaRoutingEntry>;
}

export interface JiraSnapshot {
  issueKey: string;
  projectKey: string;
  summary?: string;
  status?: string;
  issueType?: string;
  component?: string | null;
  workType?: string | null;
  retrievedAt: string;
}

export interface ProjectRegistrySnapshot {
  id: string;
  name: string;
  domain?: string | null;
  type?: string | null;
  archetype?: string | null;
  jiraProjectKey?: string | null;
  defaultRepository?: string | null;
  defaultBranch?: string | null;
  testingCompliance?: string | null;
  businessContextStatus?: string | null;
  deploymentStatus?: string | null;
}

export interface RepositoryFactSnapshot {
  repository: string;
  targetBranch: string;
  facts: Record<string, unknown>;
  projectContextPaths?: string[];
}

export interface GovernanceSnapshot {
  policies: string[];
  adrs: string[];
  bdrs: string[];
  exceptions?: string[];
}

export interface BusinessSnapshot {
  contextStatus: string;
  contextPaths: string[];
  approvedSpecifications?: string[];
}

export interface SourceRef {
  id: string;
  type: string;
  authority: string;
  retrievedAt: string;
  cached?: boolean;
}

export interface ResolverInput {
  requestId: string;
  generatedAt?: string;
  project: ProjectRegistrySnapshot;
  jira?: JiraSnapshot | null;
  rpaRouting?: RpaRoutingTable;
  discoveredRepositories?: RoutingRepository[];
  repositoryFacts?: RepositoryFactSnapshot[];
  governance: GovernanceSnapshot;
  business: BusinessSnapshot;
  knownConflicts?: Conflict[];
  unresolved?: string[];
  sources: SourceRef[];
}

export interface EffectiveContext {
  schema_version: 1;
  request_id: string;
  generated_at: string;
  project: {
    id: string;
    name: string;
    domain: string | null;
    type: string | null;
    archetype: string | null;
    jira_project_key: string | null;
  };
  jira: null | {
    issue_key: string;
    summary: string | null;
    status: string | null;
    issue_type: string | null;
    component: string | null;
    work_type: string | null;
    retrieved_at: string;
  };
  routing: {
    mode: 'deterministic_component' | 'ai_discovery' | 'project_default' | 'explicit';
    status: RoutingStatus;
    repositories: RoutingRepository[];
  };
  governance: {
    policies: string[];
    adrs: string[];
    bdrs: string[];
    exceptions: string[];
  };
  business: {
    context_status: string;
    context_paths: string[];
    approved_specifications: string[];
    live_jira_is_authoritative: true;
  };
  repositories: Array<{
    repository: string;
    target_branch: string;
    facts: Record<string, unknown>;
    project_context_paths: string[];
  }>;
  compliance: {
    testing: string | null;
    business_context: string | null;
    deployment: string | null;
    findings: string[];
  };
  conflicts: Conflict[];
  unresolved: string[];
  decision: {
    can_plan: boolean;
    can_modify_code: boolean;
    can_create_pr: boolean;
    can_deploy_production: false;
    reason: string | null;
  };
  sources: Array<{
    id: string;
    type: string;
    authority: string;
    retrieved_at: string;
    cached: boolean;
  }>;
}
