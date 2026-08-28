import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';

// Effective Context assembly. Ported from reference/context-resolver
// (resolve.ts + routing.ts + adapters/runtime.ts). The output contract is
// pinned by schemas/effective-context.schema.json and must not drift.
// This core must never call an LLM.

export type RoutingStatus =
  | 'resolved'
  | 'analyzing_candidates'
  | 'multi_repo'
  | 'routing_conflict'
  | 'unmapped_component'
  | 'waiting_information';

export interface RoutingRepository {
  repository: string;
  role: string;
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

export interface ProjectSnapshot {
  id: string;
  name: string;
  domain: string | null;
  type: string | null;
  archetype: string | null;
  jiraProjectKey: string | null;
  defaultRepository: string | null;
  defaultBranch: string;
  testingCompliance: string | null;
  businessContextStatus: string | null;
  deploymentStatus: string | null;
}

export interface JiraSnapshot {
  issueKey: string;
  projectKey: string;
  summary?: string | null;
  status?: string | null;
  issueType?: string | null;
  component?: string | null;
  workType?: string | null;
  retrievedAt: string;
}

export interface RpaRoutingTable {
  projectKey: 'RPA';
  components: Record<string, { repository: string; repositoryRole?: string; status?: string }>;
}

const ALWAYS_BLOCKING = new Set<Conflict['type']>([
  'routing_conflict',
  'unmapped_component',
  'unresolved_authority',
  'policy_violation',
]);

const MIN_MODIFY_CONFIDENCE = 0.85;

export interface RoutingResult {
  mode: 'deterministic_component' | 'ai_discovery' | 'project_default' | 'explicit';
  status: RoutingStatus;
  repositories: RoutingRepository[];
  conflicts: Conflict[];
  unresolved: string[];
}

export function resolveRouting(args: {
  project: ProjectSnapshot;
  jira?: JiraSnapshot | null;
  rpaRouting?: RpaRoutingTable | null;
  discoveredRepositories?: RoutingRepository[];
}): RoutingResult {
  const { project, jira, rpaRouting, discoveredRepositories = [] } = args;

  if (jira?.projectKey === 'RPA') return resolveRpaRouting(jira, rpaRouting);

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

function resolveRpaRouting(jira: JiraSnapshot, routingTable?: RpaRoutingTable | null): RoutingResult {
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

export interface ResolverInput {
  requestId: string;
  generatedAt?: string;
  project: ProjectSnapshot;
  jira?: JiraSnapshot | null;
  rpaRouting?: RpaRoutingTable | null;
  discoveredRepositories?: RoutingRepository[];
  repositoryFacts?: Array<{
    repository: string;
    targetBranch: string;
    facts: Record<string, unknown>;
    projectContextPaths?: string[];
  }>;
  knownConflicts?: Conflict[];
  unresolved?: string[];
}

export function resolveEffectiveContext(input: ResolverInput): Record<string, unknown> {
  const routing = resolveRouting({
    project: input.project,
    jira: input.jira,
    rpaRouting: input.rpaRouting,
    discoveredRepositories: input.discoveredRepositories,
  });

  const conflicts = [...(input.knownConflicts ?? []), ...routing.conflicts].map((conflict) => ({
    ...conflict,
    blocking: conflict.blocking || ALWAYS_BLOCKING.has(conflict.type),
  }));
  const unresolved = [...new Set([...(input.unresolved ?? []), ...routing.unresolved])];

  const routingReady = routing.status === 'resolved' || routing.status === 'multi_repo';
  const hasBlockingConflict = conflicts.some((conflict) => conflict.blocking);
  const hasUnresolvedRouting = unresolved.some(
    (item) => item.includes('routing') || item.includes('component'),
  );

  const canPlan =
    Boolean(input.project.id) &&
    !conflicts.some((conflict) => conflict.type === 'policy_violation' && conflict.blocking);
  const canModifyCode = canPlan && routingReady && !hasBlockingConflict && !hasUnresolvedRouting;

  const reason = !canPlan
    ? 'Planning blocked by policy or missing project identity.'
    : !routingReady
      ? 'Repository routing is not sufficiently resolved.'
      : hasBlockingConflict
        ? 'Blocking governance/routing conflict must be resolved first.'
        : hasUnresolvedRouting
          ? 'Repository/component routing remains unresolved.'
          : null;

  const routed = new Set(routing.repositories.map((item) => item.repository));
  const repositoryFacts = (input.repositoryFacts ?? []).filter(
    (repo) => routed.size === 0 || routed.has(repo.repository),
  );
  const generatedAt = input.generatedAt ?? new Date().toISOString();

  return {
    schema_version: 1,
    request_id: input.requestId,
    generated_at: generatedAt,
    project: {
      id: input.project.id,
      name: input.project.name,
      domain: input.project.domain,
      type: input.project.type,
      archetype: input.project.archetype,
      jira_project_key: input.project.jiraProjectKey ?? input.jira?.projectKey ?? null,
    },
    jira: input.jira
      ? {
          issue_key: input.jira.issueKey,
          summary: input.jira.summary ?? null,
          status: input.jira.status ?? null,
          issue_type: input.jira.issueType ?? null,
          component: input.jira.component ?? null,
          work_type: input.jira.workType ?? null,
          retrieved_at: input.jira.retrievedAt,
        }
      : null,
    routing: { mode: routing.mode, status: routing.status, repositories: routing.repositories },
    governance: {
      policies: ['policies/ai-sdlc.md', 'policies/testing.md', 'policies/deployment.md'],
      adrs: [
        'decisions/adr/global/ADR-GLOBAL-005-phase4-ai-sdlc-orchestration.md',
        'decisions/adr/global/ADR-GLOBAL-010-hermes-first-consolidation.md',
      ],
      bdrs: [],
      exceptions: [],
    },
    business: {
      context_status: input.project.businessContextStatus ?? 'unknown',
      context_paths: ['docs/business/'],
      approved_specifications: [],
      live_jira_is_authoritative: true,
    },
    repositories: repositoryFacts.map((repo) => ({
      repository: repo.repository,
      target_branch: repo.targetBranch,
      facts: repo.facts,
      project_context_paths: repo.projectContextPaths ?? [],
    })),
    compliance: {
      testing: input.project.testingCompliance,
      business_context: input.project.businessContextStatus,
      deployment: input.project.deploymentStatus,
      findings: conflicts
        .filter((c) => c.type === 'architecture_drift' || c.type === 'configuration_drift')
        .map((c) => c.message),
    },
    conflicts,
    unresolved,
    decision: {
      can_plan: canPlan,
      can_modify_code: canModifyCode,
      can_create_pr: canModifyCode,
      can_deploy_production: false,
      reason,
    },
    sources: [
      { id: 'ssot/projects', type: 'governance_registry', authority: 'authoritative', retrieved_at: generatedAt, cached: false },
      ...(input.jira
        ? [{ id: input.jira.issueKey, type: 'jira_issue', authority: 'authoritative', retrieved_at: input.jira.retrievedAt, cached: false }]
        : []),
    ],
  };
}

// --- SSOT registry loading (from adapters/runtime.ts) ---

export interface GovernanceRegistry {
  projects: Record<string, ProjectSnapshot>;
  byJiraKey: Record<string, string>;
  rpaRouting: RpaRoutingTable;
}

export async function loadRegistry(governanceRoot: string): Promise<GovernanceRegistry> {
  const projectDir = join(governanceRoot, 'ssot/projects');
  const projects: Record<string, ProjectSnapshot> = {};
  const byJiraKey: Record<string, string> = {};

  for (const name of (await readdir(projectDir)).filter((v) => v.endsWith('.yaml'))) {
    const raw = parse(await readFile(join(projectDir, name), 'utf8')) as any;
    if (!raw?.project?.id) continue;
    const repository =
      raw.repository?.organization && raw.repository?.name
        ? `${raw.repository.organization}/${raw.repository.name}`
        : null;
    projects[raw.project.id] = {
      id: raw.project.id,
      name: raw.project.name ?? raw.project.id,
      domain: raw.project.domain ?? null,
      type: raw.project.type ?? null,
      archetype: raw.project.archetype ?? null,
      jiraProjectKey: raw.jira?.project_key ?? null,
      defaultRepository: repository,
      defaultBranch: raw.repository?.default_branch ?? 'main',
      testingCompliance: raw.testing?.compliance_status ?? null,
      businessContextStatus: raw.business_context?.status ?? null,
      deploymentStatus: raw.deployment?.status ?? null,
    };
    if (raw.jira?.project_key) byJiraKey[raw.jira.project_key] = raw.project.id;
  }

  const routingRaw = parse(
    await readFile(join(governanceRoot, 'ssot/jira-routing/RPA.yaml'), 'utf8'),
  ) as any;

  return {
    projects,
    byJiraKey,
    rpaRouting: {
      projectKey: 'RPA',
      components: Object.fromEntries(
        Object.entries(routingRaw?.components ?? {}).map(([key, value]: [string, any]) => [
          key,
          {
            repository: value.repository,
            repositoryRole: value.repository_role ?? 'primary',
            status: value.status ?? 'active',
          },
        ]),
      ),
    },
  };
}
