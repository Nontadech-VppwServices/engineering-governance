import { resolveEffectiveContext } from './resolve.js';
import type { ContextSources } from './ports.js';
import type { EffectiveContext, JiraSnapshot, ProjectRegistrySnapshot, RoutingRepository } from './types.js';

export interface ContextResolveRequest {
  schema_version: 1;
  request_id: string;
  jira_issue_key?: string | null;
  project_id?: string | null;
  work_type?: 'bug' | 'new_module' | 'new_project' | 'analysis' | null;
  target_branch?: string | null;
  component?: string | null;
  repository_hints?: string[];
  refresh?: {
    jira?: boolean;
    repositories?: boolean;
    governance?: boolean;
  };
}

export class ContextResolutionError extends Error {
  constructor(
    message: string,
    public readonly statusCode: 400 | 404 | 503,
    public readonly code: string,
  ) {
    super(message);
  }
}

export class ContextResolverService {
  constructor(private readonly sources: ContextSources) {}

  async resolve(request: ContextResolveRequest): Promise<EffectiveContext> {
    validateRequest(request);

    const jira = await this.loadJira(request);
    const project = await this.loadProject(request, jira);

    if (!project) {
      throw new ContextResolutionError(
        'Project could not be mapped from the supplied request.',
        404,
        'PROJECT_NOT_FOUND',
      );
    }

    const effectiveJira = jira
      ? {
          ...jira,
          component: request.component ?? jira.component ?? null,
          workType: request.work_type ?? jira.workType ?? null,
        }
      : null;

    const rpaRouting =
      effectiveJira?.projectKey === 'RPA'
        ? await this.sources.rpaRouting.getRouting('RPA')
        : null;

    const discoveredRepositories = await this.resolveCandidates({
      request,
      project,
      jira: effectiveJira,
      rpaRoutingAvailable: Boolean(rpaRouting),
    });

    const governance = await this.sources.governance.load({
      project,
      jira: effectiveJira,
    });

    const baseInput = {
      requestId: request.request_id,
      project,
      jira: effectiveJira,
      rpaRouting: rpaRouting ?? undefined,
      discoveredRepositories,
      repositoryFacts: [],
      governance: governance.governance,
      business: governance.business,
      knownConflicts: governance.conflicts,
      unresolved: governance.unresolved,
      sources: [
        {
          id: `registry:${project.id}`,
          type: 'project_registry',
          authority: 'engineering_governance',
          retrievedAt: new Date().toISOString(),
        },
        ...(effectiveJira
          ? [
              {
                id: `jira:${effectiveJira.issueKey}`,
                type: 'jira_issue',
                authority: 'jira',
                retrievedAt: effectiveJira.retrievedAt,
              },
            ]
          : []),
        {
          id: 'governance:effective',
          type: 'governance',
          authority: 'engineering_governance',
          retrievedAt: new Date().toISOString(),
        },
      ],
    };

    // First pass determines the authoritative route, including deterministic RPA Component mapping.
    const preliminary = resolveEffectiveContext(baseInput);

    const repositoryFacts = await this.sources.repositoryFacts.inspect({
      repositories: preliminary.routing.repositories,
      targetBranch: request.target_branch,
    });

    const sources = [
      ...baseInput.sources,
      ...repositoryFacts.map((repo) => ({
        id: `github:${repo.repository}@${repo.targetBranch}`,
        type: 'repository',
        authority: 'github',
        retrievedAt: new Date().toISOString(),
      })),
    ];

    // Final pass binds repository facts only after routing has been resolved.
    return resolveEffectiveContext({
      ...baseInput,
      repositoryFacts,
      sources,
    });
  }

  private async loadJira(request: ContextResolveRequest): Promise<JiraSnapshot | null> {
    if (!request.jira_issue_key) return null;
    const issue = await this.sources.jira.getIssue(request.jira_issue_key);
    if (!issue) {
      throw new ContextResolutionError('Jira issue was not found.', 404, 'JIRA_ISSUE_NOT_FOUND');
    }
    return issue;
  }

  private async loadProject(
    request: ContextResolveRequest,
    jira: JiraSnapshot | null,
  ): Promise<ProjectRegistrySnapshot | null> {
    if (request.project_id) {
      return this.sources.projects.getById(request.project_id);
    }
    if (jira) {
      return this.sources.projects.getByJiraProjectKey(jira.projectKey);
    }
    return null;
  }

  private async resolveCandidates(input: {
    request: ContextResolveRequest;
    project: ProjectRegistrySnapshot;
    jira: JiraSnapshot | null;
    rpaRoutingAvailable: boolean;
  }): Promise<RoutingRepository[]> {
    const { request, project, jira } = input;

    if (jira?.projectKey === 'RPA' && input.rpaRoutingAvailable) {
      // Deterministic Component routing is resolved inside resolveRouting().
      return [];
    }

    return this.sources.repositoryDiscovery.discover({
      project,
      jira,
      component: request.component,
      repositoryHints: request.repository_hints ?? [],
    });
  }
}

function validateRequest(request: ContextResolveRequest): void {
  if (request.schema_version !== 1) {
    throw new ContextResolutionError('Unsupported schema_version.', 400, 'INVALID_SCHEMA_VERSION');
  }
  if (!request.request_id?.trim()) {
    throw new ContextResolutionError('request_id is required.', 400, 'INVALID_REQUEST');
  }
  if (!request.jira_issue_key && !request.project_id) {
    throw new ContextResolutionError(
      'Either jira_issue_key or project_id is required.',
      400,
      'INVALID_REQUEST',
    );
  }
}
