import type {
  BusinessSnapshot,
  Conflict,
  GovernanceSnapshot,
  JiraSnapshot,
  ProjectRegistrySnapshot,
  RepositoryFactSnapshot,
  RoutingRepository,
  RpaRoutingTable,
} from './types.js';

export interface JiraSource {
  getIssue(issueKey: string): Promise<JiraSnapshot | null>;
}

export interface ProjectRegistrySource {
  getById(projectId: string): Promise<ProjectRegistrySnapshot | null>;
  getByJiraProjectKey(projectKey: string): Promise<ProjectRegistrySnapshot | null>;
}

export interface RpaRoutingSource {
  getRouting(projectKey: string): Promise<RpaRoutingTable | null>;
}

export interface RepositoryDiscoverySource {
  discover(input: {
    project: ProjectRegistrySnapshot;
    jira: JiraSnapshot | null;
    component?: string | null;
    repositoryHints?: string[];
  }): Promise<RoutingRepository[]>;
}

export interface RepositoryFactSource {
  inspect(input: {
    repositories: RoutingRepository[];
    targetBranch?: string | null;
  }): Promise<RepositoryFactSnapshot[]>;
}

export interface GovernanceLoadResult {
  governance: GovernanceSnapshot;
  business: BusinessSnapshot;
  conflicts: Conflict[];
  unresolved: string[];
}

export interface GovernanceSource {
  load(input: {
    project: ProjectRegistrySnapshot;
    jira: JiraSnapshot | null;
  }): Promise<GovernanceLoadResult>;
}

export interface ContextSources {
  jira: JiraSource;
  projects: ProjectRegistrySource;
  rpaRouting: RpaRoutingSource;
  repositoryDiscovery: RepositoryDiscoverySource;
  repositoryFacts: RepositoryFactSource;
  governance: GovernanceSource;
}
