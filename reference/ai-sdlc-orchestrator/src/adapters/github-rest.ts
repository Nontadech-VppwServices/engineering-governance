import type { GitHostPort } from '../ports.js';
import type { PullRequestRef } from '../types.js';

export interface GitHubRestAdapterConfig {
  apiBaseUrl?: string;
  authorization: string;
}

export interface GitHubPullRequestStatus {
  state: 'open' | 'closed';
  merged: boolean;
}

export class GitHubRestAdapter implements GitHostPort {
  private readonly apiBaseUrl: string;

  constructor(
    private readonly config: GitHubRestAdapterConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.apiBaseUrl = config.apiBaseUrl?.replace(/\/$/, '') ?? 'https://api.github.com';
  }

  async getPullRequestStatus(repository: string, number: number): Promise<GitHubPullRequestStatus> {
    const response = await this.fetchImpl(
      `${this.apiBaseUrl}/repos/${repository}/pulls/${number}`,
      { headers: this.headers() },
    );
    if (!response.ok) throw new Error(`GitHub pull request lookup failed with HTTP ${response.status}.`);
    const data = await response.json() as { state: 'open' | 'closed'; merged_at?: string | null };
    return { state: data.state, merged: Boolean(data.merged_at) };
  }

  async getDefaultBranch(repository: string): Promise<string> {
    const response = await this.fetchImpl(`${this.apiBaseUrl}/repos/${repository}`, { headers: this.headers() });
    if (!response.ok) throw new Error(`GitHub repository lookup failed with HTTP ${response.status}.`);
    const data = await response.json() as { default_branch: string };
    return data.default_branch;
  }

  async ensureBranch(input: { repository: string; baseBranch: string; branch: string }): Promise<void> {
    const existing = await this.fetchImpl(
      `${this.apiBaseUrl}/repos/${input.repository}/git/ref/heads/${encodeURIComponent(input.branch)}`,
      { headers: this.headers() },
    );
    if (existing.ok) return;
    if (existing.status !== 404) throw new Error(`GitHub branch lookup failed with HTTP ${existing.status}.`);

    const base = await this.fetchImpl(
      `${this.apiBaseUrl}/repos/${input.repository}/git/ref/heads/${encodeURIComponent(input.baseBranch)}`,
      { headers: this.headers() },
    );
    if (!base.ok) throw new Error(`GitHub base branch lookup failed with HTTP ${base.status}.`);
    const baseData = await base.json() as { object: { sha: string } };

    const created = await this.fetchImpl(`${this.apiBaseUrl}/repos/${input.repository}/git/refs`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ ref: `refs/heads/${input.branch}`, sha: baseData.object.sha }),
    });
    if (!created.ok && created.status !== 422) {
      throw new Error(`GitHub branch creation failed with HTTP ${created.status}.`);
    }
  }

  async findOpenPullRequest(input: {
    repository: string;
    headBranch: string;
    jiraIssueKey: string;
  }): Promise<PullRequestRef | null> {
    const owner = input.repository.split('/')[0];
    if (!owner) throw new Error(`Invalid repository: ${input.repository}`);
    const url = `${this.apiBaseUrl}/repos/${input.repository}/pulls?state=open&head=${encodeURIComponent(`${owner}:${input.headBranch}`)}`;
    const response = await this.fetchImpl(url, { headers: this.headers() });
    if (!response.ok) throw new Error(`GitHub PR lookup failed with HTTP ${response.status}.`);
    const prs = await response.json() as Array<{ number: number; html_url: string; state: 'open' | 'closed'; merged_at?: string | null }>;
    const pr = prs[0];
    return pr
      ? { repository: input.repository, number: pr.number, url: pr.html_url, state: pr.state, merged: Boolean(pr.merged_at) }
      : null;
  }

  async createPullRequest(input: {
    repository: string;
    baseBranch: string;
    headBranch: string;
    title: string;
    body: string;
  }): Promise<PullRequestRef> {
    const response = await this.fetchImpl(`${this.apiBaseUrl}/repos/${input.repository}/pulls`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        title: input.title,
        body: input.body,
        head: input.headBranch,
        base: input.baseBranch,
        draft: false,
      }),
    });
    if (!response.ok) throw new Error(`GitHub PR creation failed with HTTP ${response.status}.`);
    const pr = await response.json() as { number: number; html_url: string; state: 'open' | 'closed'; merged_at?: string | null };
    return {
      repository: input.repository,
      number: pr.number,
      url: pr.html_url,
      state: pr.state,
      merged: Boolean(pr.merged_at),
    };
  }

  private headers(): Record<string, string> {
    return {
      authorization: this.config.authorization,
      accept: 'application/vnd.github+json',
      'content-type': 'application/json',
      'x-github-api-version': '2022-11-28',
    };
  }
}
