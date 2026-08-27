import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { ContextSources, GovernanceLoadResult } from '../ports.js';
import type { JiraSnapshot, ProjectRegistrySnapshot, RepositoryFactSnapshot, RoutingRepository, RpaRoutingTable } from '../types.js';

interface RuntimeSourcesConfig {
  governanceRoot: string;
  jiraBaseUrl: string;
  jiraAuthorization: string;
  githubApiUrl?: string;
  githubAuthorization: string;
}

export async function createRuntimeContextSources(config: RuntimeSourcesConfig): Promise<ContextSources> {
  const projectDir = join(config.governanceRoot, 'ssot/projects');
  const projects: Record<string, ProjectRegistrySnapshot> = {};
  const byJira: Record<string, string> = {};
  for (const name of (await readdir(projectDir)).filter((value) => value.endsWith('.yaml'))) {
    const raw = parse(await readFile(join(projectDir, name), 'utf8')) as any;
    if (!raw?.project?.id) continue;
    const repository = raw.repository?.organization && raw.repository?.name ? `${raw.repository.organization}/${raw.repository.name}` : null;
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
    if (raw.jira?.project_key) byJira[raw.jira.project_key] = raw.project.id;
  }

  const routingRaw = parse(await readFile(join(config.governanceRoot, 'ssot/jira-routing/RPA.yaml'), 'utf8')) as any;
  const rpaRouting: RpaRoutingTable = {
    projectKey: 'RPA',
    components: Object.fromEntries(Object.entries(routingRaw.components ?? {}).map(([key, value]: [string, any]) => [key, { repository: value.repository, repositoryRole: value.repository_role ?? 'primary', status: value.status ?? 'active' }])),
  };
  const githubBase = (config.githubApiUrl ?? 'https://api.github.com').replace(/\/$/, '');

  return {
    jira: { async getIssue(issueKey): Promise<JiraSnapshot | null> {
      const response = await fetch(`${config.jiraBaseUrl.replace(/\/$/, '')}/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=summary,status,issuetype,project,components` , { headers: { authorization: config.jiraAuthorization, accept: 'application/json' } });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`Jira returned HTTP ${response.status}.`);
      const value = await response.json() as any;
      return { issueKey: value.key, projectKey: value.fields.project.key, summary: value.fields.summary, status: value.fields.status?.name, issueType: value.fields.issuetype?.name, component: value.fields.components?.[0]?.name ?? null, retrievedAt: new Date().toISOString() };
    } },
    projects: {
      async getById(id) { return projects[id] ?? null; },
      async getByJiraProjectKey(key) { return byJira[key] ? projects[byJira[key]!] ?? null : null; },
    },
    rpaRouting: { async getRouting(key) { return key === 'RPA' ? rpaRouting : null; } },
    repositoryDiscovery: { async discover({ project }): Promise<RoutingRepository[]> {
      return project.defaultRepository ? [{ repository: project.defaultRepository, role: 'primary', confidence: 1, reason: 'Project registry default repository.', evidence: [`registry:${project.id}`] }] : [];
    } },
    repositoryFacts: { async inspect({ repositories, targetBranch }): Promise<RepositoryFactSnapshot[]> {
      return Promise.all(repositories.map(async (route) => {
        const response = await fetch(`${githubBase}/repos/${route.repository}`, { headers: githubHeaders(config.githubAuthorization) });
        if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status} for ${route.repository}.`);
        const value = await response.json() as any;
        return { repository: route.repository, targetBranch: targetBranch ?? value.default_branch ?? 'main', facts: { archived: Boolean(value.archived), visibility: value.visibility ?? null }, projectContextPaths: ['.ai/project.yaml'] };
      }));
    } },
    governance: { async load({ project }): Promise<GovernanceLoadResult> {
      return {
        governance: { policies: ['policies/ai-sdlc.md', 'policies/testing.md', 'policies/deployment.md'], adrs: ['decisions/adr/global/ADR-GLOBAL-005-phase4-ai-sdlc-orchestration.md'], bdrs: [], exceptions: [] },
        business: { contextStatus: project.businessContextStatus ?? 'unknown', contextPaths: ['docs/business/'], approvedSpecifications: [] },
        conflicts: [], unresolved: [],
      };
    } },
  };
}

function githubHeaders(authorization: string): Record<string, string> {
  return { authorization, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' };
}
