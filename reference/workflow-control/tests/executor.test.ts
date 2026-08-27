import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { HttpActionExecutor } from '../src/executor.js';
import type { LinePrincipal, PendingAction } from '../src/types.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe('authoritative deployment dispatch', () => {
  it('reads deployment and separate rollback workflows from the project registry', async () => {
    const root = await mkdtemp(join(tmpdir(), 'workflow-control-')); roots.push(root);
    await mkdir(join(root, 'ssot/projects'), { recursive: true });
    await writeFile(join(root, 'ssot/projects/APP.yaml'), `repository:\n  organization: Acme\n  name: app\n  default_branch: main\ndeployment:\n  development_workflow: .github/workflows/ci.yml\n  production_workflow: .github/workflows/prod.yml\n  rollback_workflow: .github/workflows/rollback.yml\n`);
    const calls: Array<{ url: string; body: any }> = [];
    const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => { calls.push({ url: String(input), body: init?.body ? JSON.parse(String(init.body)) : null }); return new Response(null, { status: 204 }); };
    const executor = new HttpActionExecutor({ jiraBaseUrl: 'https://jira.example', jiraAuthorization: 'Basic x', jiraAiAssigneeAccountId: 'jira-1', phase4Url: 'http://phase4', phase4Token: 'phase4-token-1234', phase5Url: 'http://phase5', phase5Token: 'phase5-token-1234', actorSigningSecret: 'actor-secret-1234', governanceRoot: root, githubApiUrl: 'https://github.example', githubAuthorization: 'Bearer github-token' }, fetchImpl as typeof fetch);
    const principal: LinePrincipal = { line_user_id: 'U1', jira_account_id: 'jira-1', github_login: 'alice', roles: ['deployer'], source_type: 'user', direct_message: true, issued_at: new Date().toISOString(), expires_at: new Date(Date.now() + 60000).toISOString() };
    const action = (type: PendingAction['type'], payload: Record<string, unknown>): PendingAction => ({ schema_version: 1, action_id: `act-${type}`, idempotency_key: `key-${type}`, type, payload, requested_by: 'U1', status: 'CONFIRMED', expires_at: principal.expires_at, created_at: principal.issued_at, confirmed_at: principal.issued_at, result: null });
    await expect(executor.execute(action('request_deployment', { repository: 'Acme/app', workflow: '.github/workflows/ci.yml', ref: 'feature', environment: 'dev' }), principal)).resolves.toMatchObject({ state: 'DISPATCHED' });
    await expect(executor.execute(action('request_rollback', { repository: 'Acme/app', ref: 'main', rollback_to: 'prod-2026.08.27' }), principal)).resolves.toMatchObject({ state: 'WAITING_GITHUB_APPROVAL', workflow: '.github/workflows/rollback.yml' });
    expect(calls.map((call) => call.url)).toEqual([
      'https://github.example/repos/Acme/app/actions/workflows/.github%2Fworkflows%2Fci.yml/dispatches',
      'https://github.example/repos/Acme/app/actions/workflows/.github%2Fworkflows%2Frollback.yml/dispatches',
    ]);
  });
});
