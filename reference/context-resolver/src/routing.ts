import type {
  Conflict,
  JiraSnapshot,
  ProjectRegistrySnapshot,
  RoutingRepository,
  RoutingStatus,
  RpaRoutingTable,
} from './types.js';

export interface RoutingResult {
  mode: 'deterministic_component' | 'ai_discovery' | 'project_default' | 'explicit';
  status: RoutingStatus;
  repositories: RoutingRepository[];
  conflicts: Conflict[];
  unresolved: string[];
}

const MIN_MODIFY_CONFIDENCE = 0.85;

export function resolveRouting(args: {
  project: ProjectRegistrySnapshot;
  jira?: JiraSnapshot | null;
  rpaRouting?: RpaRoutingTable;
  discoveredRepositories?: RoutingRepository[];
}): RoutingResult {
  const { project, jira, rpaRouting, discoveredRepositories = [] } = args;

  if (jira?.projectKey === 'RPA') {
    return resolveRpaRouting(jira, rpaRouting);
  }

  if (discoveredRepositories.length > 0) {
    const sorted = [...discoveredRepositories].sort((a, b) => b.confidence - a.confidence);
    const strong = sorted.filter((repo) => repo.confidence >= MIN_MODIFY_CONFIDENCE);

    if (strong.length === 0) {
      return {
        mode: 'ai_discovery',
        status: 'analyzing_candidates',
        repositories: sorted,
        conflicts: [],
        unresolved: ['repository_routing_requires_more_evidence'],
      };
    }

    return {
      mode: 'ai_discovery',
      status: strong.length > 1 ? 'multi_repo' : 'resolved',
      repositories: strong,
      conflicts: [],
      unresolved: [],
    };
  }

  if (project.defaultRepository) {
    return {
      mode: 'project_default',
      status: 'resolved',
      repositories: [
        {
          repository: project.defaultRepository,
          role: 'primary',
          confidence: 1,
          reason: 'Project registry defines a single default repository.',
          evidence: ['project_registry'],
        },
      ],
      conflicts: [],
      unresolved: [],
    };
  }

  return {
    mode: 'ai_discovery',
    status: 'waiting_information',
    repositories: [],
    conflicts: [],
    unresolved: ['repository_routing_unresolved'],
  };
}

function resolveRpaRouting(
  jira: JiraSnapshot,
  routingTable?: RpaRoutingTable,
): RoutingResult {
  const component = jira.component?.trim();

  if (!component) {
    return {
      mode: 'deterministic_component',
      status: 'unmapped_component',
      repositories: [],
      conflicts: [
        {
          type: 'unmapped_component',
          severity: 'high',
          blocking: true,
          message: 'Jira project RPA requires a registered Component before repository routing.',
          sources: [jira.issueKey],
        },
      ],
      unresolved: ['jira_rpa_component'],
    };
  }

  const entry = routingTable?.components[component];
  if (!entry || entry.status === 'deprecated') {
    return {
      mode: 'deterministic_component',
      status: 'unmapped_component',
      repositories: [],
      conflicts: [
        {
          type: 'unmapped_component',
          severity: 'high',
          blocking: true,
          message: `RPA Component ${component} has no active repository route.`,
          sources: [jira.issueKey, 'ssot/jira-routing/RPA.yaml'],
        },
      ],
      unresolved: [`rpa_component:${component}`],
    };
  }

  return {
    mode: 'deterministic_component',
    status: 'resolved',
    repositories: [
      {
        repository: entry.repository,
        role: entry.repositoryRole ?? 'primary',
        confidence: 1,
        reason: `Jira RPA Component ${component} maps deterministically through governance SSOT.`,
        evidence: [jira.issueKey, `component:${component}`, 'ssot/jira-routing/RPA.yaml'],
      },
    ],
    conflicts: [],
    unresolved: [],
  };
}
