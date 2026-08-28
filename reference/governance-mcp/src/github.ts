import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import { GovernanceError, type PullRequestRef } from './types.js';

// Ported from ai-sdlc-orchestrator/src/adapters/github-rest.ts and the
// deployment half of workflow-control/src/executor.ts. Merge and production
// deploy are never exposed as MCP tools; they are reachable only through a
// human-confirmed action, and even then only as a protected-workflow dispatch.

export interface GitHubConfig {
  apiBaseUrl?: string;
  authorization: string;
  governanceRoot: string;
}

export class GitHubClient {
  private readonly api: string;

  constructor(
    private readonly config: GitHubConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.api = config.apiBaseUrl?.replace(/\/$/, '') ?? 'https://api.github.com';
  }

  private headers(): Record<string, string> {
    return {
      authorization: this.config.authorization,
      accept: 'application/vnd.github+json',
      'content-type': 'application/json',
      'x-github-api-version': '2022-11-28',
    };
  }

  private async request(path: string, init: RequestInit = {}): Promise<any> {
    const response = await this.fetchImpl(`${this.api}${path}`, { ...init, headers: this.headers() });
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new GovernanceError(`GitHub returned HTTP ${response.status}.`, 502, 'GITHUB_ERROR');
    }
    if (response.status === 204) return { accepted: true };
    return response.json();
  }

  async getRepository(repository: string): Promise<{ default_branch: string; archived: boolean; visibility: string | null } | null> {
    const data = await this.request(`/repos/${repository}`);
    if (!data) return null;
    return {
      default_branch: data.default_branch ?? 'main',
      archived: Boolean(data.archived),
      visibility: data.visibility ?? null,
    };
  }

  async searchCode(repository: string, query: string): Promise<unknown> {
    const q = encodeURIComponent(`${query} repo:${repository}`);
    const data = await this.request(`/search/code?q=${q}&per_page=20`);
    return (data?.items ?? []).map((item: any) => ({ path: item.path, url: item.html_url }));
  }

  async readFile(repository: string, path: string, ref?: string): Promise<{ path: string; content: string } | null> {
    const suffix = ref ? `?ref=${encodeURIComponent(ref)}` : '';
    const data = await this.request(`/repos/${repository}/contents/${encodeURI(path)}${suffix}`);
    if (!data?.content) return null;
    return { path, content: Buffer.from(data.content, 'base64').toString('utf8') };
  }

  async ensureBranch(repository: string, baseBranch: string, branch: string): Promise<void> {
    const existing = await this.request(`/repos/${repository}/git/ref/heads/${encodeURIComponent(branch)}`);
    if (existing) return;
    const base = await this.request(`/repos/${repository}/git/ref/heads/${encodeURIComponent(baseBranch)}`);
    if (!base) throw new GovernanceError(`Base branch '${baseBranch}' not found.`, 404, 'NOT_FOUND');
    const response = await this.fetchImpl(`${this.api}/repos/${repository}/git/refs`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: base.object.sha }),
    });
    if (!response.ok && response.status !== 422) {
      throw new GovernanceError(`GitHub branch creation failed with HTTP ${response.status}.`, 502, 'GITHUB_ERROR');
    }
  }

  async findOpenPullRequest(repository: string, headBranch: string): Promise<PullRequestRef | null> {
    const owner = repository.split('/')[0];
    if (!owner) throw new GovernanceError(`Invalid repository: ${repository}`);
    const data = await this.request(
      `/repos/${repository}/pulls?state=open&head=${encodeURIComponent(`${owner}:${headBranch}`)}`,
    );
    const pr = data?.[0];
    return pr
      ? { repository, number: pr.number, url: pr.html_url, state: pr.state, merged: Boolean(pr.merged_at) }
      : null;
  }

  async createPullRequest(input: {
    repository: string;
    baseBranch: string;
    headBranch: string;
    title: string;
    body: string;
  }): Promise<PullRequestRef> {
    const existing = await this.findOpenPullRequest(input.repository, input.headBranch);
    if (existing) return existing;
    const pr = await this.request(`/repos/${input.repository}/pulls`, {
      method: 'POST',
      body: JSON.stringify({
        title: input.title,
        body: input.body,
        head: input.headBranch,
        base: input.baseBranch,
        draft: false,
      }),
    });
    return {
      repository: input.repository,
      number: pr.number,
      url: pr.html_url,
      state: pr.state,
      merged: Boolean(pr.merged_at),
    };
  }

  async getPullRequestStatus(repository: string, number: number): Promise<{ state: 'open' | 'closed'; merged: boolean }> {
    const data = await this.request(`/repos/${repository}/pulls/${number}`);
    if (!data) throw new GovernanceError('Pull request not found.', 404, 'NOT_FOUND');
    return { state: data.state, merged: Boolean(data.merged_at) };
  }

  // Auto-merge only. Direct merge is never available: GitHub branch protection
  // still has to pass before anything lands.
  async enableAutoMerge(repository: string, number: number): Promise<unknown> {
    const pr = await this.request(`/repos/${repository}/pulls/${number}`);
    if (!pr) throw new GovernanceError('Pull request not found.', 404, 'NOT_FOUND');
    const query =
      'mutation($id:ID!){enablePullRequestAutoMerge(input:{pullRequestId:$id,mergeMethod:SQUASH}){pullRequest{number autoMergeRequest{enabledAt}}}}';
    const response = await this.fetchImpl('https://api.github.com/graphql', {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ query, variables: { id: pr.node_id } }),
    });
    if (!response.ok) {
      throw new GovernanceError(`GitHub auto-merge failed with HTTP ${response.status}.`, 502, 'GITHUB_ERROR');
    }
    return response.json();
  }

  async dispatchWorkflow(repository: string, workflow: string, ref: string, inputs: Record<string, string>): Promise<void> {
    await this.request(
      `/repos/${repository}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`,
      { method: 'POST', body: JSON.stringify({ ref, inputs }) },
    );
  }

  // Ported verbatim in behaviour from workflow-control executor. The workflow
  // name comes from the project registry, never from the caller.
  async authoritativeDeployment(
    repository: string,
    environment: string,
    kind: 'deployment' | 'rollback' = 'deployment',
  ): Promise<{ workflow: string; defaultBranch: string }> {
    const dir = join(this.config.governanceRoot, 'ssot/projects');
    for (const file of (await readdir(dir)).filter((v) => v.endsWith('.yaml'))) {
      const value = parse(await readFile(join(dir, file), 'utf8')) as any;
      const registered =
        value.repository?.organization && value.repository?.name
          ? `${value.repository.organization}/${value.repository.name}`
          : null;
      if (registered !== repository) continue;

      if (value.unresolved?.some((item: string) => /deployment.*(drift|mechanism|mapping)/i.test(item))) {
        throw new GovernanceError(
          'Project registry has unresolved deployment configuration.',
          409,
          'DEPLOYMENT_CONFIGURATION_DRIFT',
        );
      }
      const deployment = value.ci_cd ?? value.deployment ?? {};
      const key =
        kind === 'rollback'
          ? 'rollback_workflow'
          : environment === 'prod'
            ? 'production_workflow'
            : environment === 'dev'
              ? 'development_workflow'
              : 'uat_workflow';
      const workflow = deployment[key];
      if (typeof workflow !== 'string' || !/^\.github\/workflows\/[A-Za-z0-9._-]+\.ya?ml$/.test(workflow)) {
        throw new GovernanceError(
          `No verified ${kind === 'rollback' ? 'rollback' : environment} workflow is registered.`,
          409,
          'DEPLOYMENT_NOT_VERIFIED',
        );
      }
      return { workflow, defaultBranch: value.repository?.default_branch ?? 'main' };
    }
    throw new GovernanceError('Repository is not registered for deployment.', 404, 'PROJECT_NOT_FOUND');
  }
}
