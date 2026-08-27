import { resolveRouting } from './routing.js';
import type { Conflict, EffectiveContext, ResolverInput } from './types.js';

const ALWAYS_BLOCKING = new Set<Conflict['type']>([
  'routing_conflict',
  'unmapped_component',
  'unresolved_authority',
  'policy_violation',
]);

export function resolveEffectiveContext(input: ResolverInput): EffectiveContext {
  const routing = resolveRouting({
    project: input.project,
    jira: input.jira,
    rpaRouting: input.rpaRouting,
    discoveredRepositories: input.discoveredRepositories,
  });

  const conflicts = normalizeConflicts([
    ...(input.knownConflicts ?? []),
    ...routing.conflicts,
  ]);

  const unresolved = unique([
    ...(input.unresolved ?? []),
    ...routing.unresolved,
  ]);

  const routingReady = routing.status === 'resolved' || routing.status === 'multi_repo';
  const hasBlockingConflict = conflicts.some(
    (conflict) => conflict.blocking || ALWAYS_BLOCKING.has(conflict.type),
  );
  const hasUnresolvedRouting = unresolved.some((item) => item.includes('routing') || item.includes('component'));

  const canPlan = Boolean(input.project.id) && !conflicts.some((conflict) => conflict.type === 'policy_violation' && conflict.blocking);
  const canModifyCode = canPlan && routingReady && !hasBlockingConflict && !hasUnresolvedRouting;
  const canCreatePr = canModifyCode;

  const reason = !canPlan
    ? 'Planning blocked by policy or missing project identity.'
    : !routingReady
      ? 'Repository routing is not sufficiently resolved.'
      : hasBlockingConflict
        ? 'Blocking governance/routing conflict must be resolved first.'
        : hasUnresolvedRouting
          ? 'Repository/component routing remains unresolved.'
          : null;

  const routedRepositoryNames = new Set(routing.repositories.map((item) => item.repository));
  const repositoryFacts = (input.repositoryFacts ?? []).filter((repo) =>
    routedRepositoryNames.size === 0 || routedRepositoryNames.has(repo.repository),
  );

  return {
    schema_version: 1,
    request_id: input.requestId,
    generated_at: input.generatedAt ?? new Date().toISOString(),
    project: {
      id: input.project.id,
      name: input.project.name,
      domain: input.project.domain ?? null,
      type: input.project.type ?? null,
      archetype: input.project.archetype ?? null,
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
    routing: {
      mode: routing.mode,
      status: routing.status,
      repositories: routing.repositories,
    },
    governance: {
      policies: input.governance.policies,
      adrs: input.governance.adrs,
      bdrs: input.governance.bdrs,
      exceptions: input.governance.exceptions ?? [],
    },
    business: {
      context_status: input.business.contextStatus,
      context_paths: input.business.contextPaths,
      approved_specifications: input.business.approvedSpecifications ?? [],
      live_jira_is_authoritative: true,
    },
    repositories: repositoryFacts.map((repo) => ({
      repository: repo.repository,
      target_branch: repo.targetBranch,
      facts: repo.facts,
      project_context_paths: repo.projectContextPaths ?? [],
    })),
    compliance: {
      testing: input.project.testingCompliance ?? null,
      business_context: input.project.businessContextStatus ?? null,
      deployment: input.project.deploymentStatus ?? null,
      findings: conflicts
        .filter((conflict) => conflict.type === 'architecture_drift' || conflict.type === 'configuration_drift')
        .map((conflict) => conflict.message),
    },
    conflicts,
    unresolved,
    decision: {
      can_plan: canPlan,
      can_modify_code: canModifyCode,
      can_create_pr: canCreatePr,
      can_deploy_production: false,
      reason,
    },
    sources: input.sources.map((source) => ({
      id: source.id,
      type: source.type,
      authority: source.authority,
      retrieved_at: source.retrievedAt,
      cached: source.cached ?? false,
    })),
  };
}

function normalizeConflicts(conflicts: Conflict[]): Conflict[] {
  return conflicts.map((conflict) => ({
    ...conflict,
    blocking: conflict.blocking || ALWAYS_BLOCKING.has(conflict.type),
  }));
}

function unique(items: string[]): string[] {
  return [...new Set(items)];
}
