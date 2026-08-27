import type { ContextSources, GovernanceLoadResult } from '../ports.js';
import type {
  JiraSnapshot,
  ProjectRegistrySnapshot,
  RepositoryFactSnapshot,
  RoutingRepository,
  RpaRoutingTable,
} from '../types.js';

export interface StaticContextData {
  jiraIssues?: Record<string, JiraSnapshot>;
  projects?: Record<string, ProjectRegistrySnapshot>;
  projectByJiraKey?: Record<string, string>;
  rpaRouting?: RpaRoutingTable | null;
  discoveries?: Record<string, RoutingRepository[]>;
  repositoryFacts?: Record<string, RepositoryFactSnapshot>;
  governance?: Record<string, GovernanceLoadResult>;
}

export function createStaticContextSources(data: StaticContextData): ContextSources {
  const projects = data.projects ?? {};

  return {
    jira: {
      async getIssue(issueKey) {
        return data.jiraIssues?.[issueKey] ?? null;
      },
    },
    projects: {
      async getById(projectId) {
        return projects[projectId] ?? null;
      },
      async getByJiraProjectKey(projectKey) {
        const projectId = data.projectByJiraKey?.[projectKey];
        return projectId ? projects[projectId] ?? null : null;
      },
    },
    rpaRouting: {
      async getRouting(projectKey) {
        return projectKey === 'RPA' ? data.rpaRouting ?? null : null;
      },
    },
    repositoryDiscovery: {
      async discover({ project }) {
        return data.discoveries?.[project.id] ?? [];
      },
    },
    repositoryFacts: {
      async inspect({ repositories, targetBranch }) {
        return repositories.map((route) => {
          const existing = data.repositoryFacts?.[route.repository];
          if (existing) {
            return targetBranch ? { ...existing, targetBranch } : existing;
          }
          return {
            repository: route.repository,
            targetBranch: targetBranch ?? 'main',
            facts: {},
            projectContextPaths: [],
          };
        });
      },
    },
    governance: {
      async load({ project }) {
        return (
          data.governance?.[project.id] ?? {
            governance: { policies: [], adrs: [], bdrs: [], exceptions: [] },
            business: { contextStatus: 'unknown', contextPaths: [], approvedSpecifications: [] },
            conflicts: [],
            unresolved: [],
          }
        );
      },
    },
  };
}
