import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createProjectAutomationHttpServer, InMemoryPlanStore, InMemoryScaffoldPublisher, ProjectAutomationService } from '../src/index.js';

const servers: ReturnType<typeof createProjectAutomationHttpServer>[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve())))); });

describe('Phase 5 HTTP API', () => {
  it('authenticates requests and preserves the human approval boundary', async () => {
    const server = createProjectAutomationHttpServer(new ProjectAutomationService(new InMemoryPlanStore(), new InMemoryScaffoldPublisher()), 'test-token-at-least-16');
    servers.push(server); await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve)); const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    expect((await fetch(`${url}/v1/plans`, { method: 'POST' })).status).toBe(401);
    const request = { schema_version: 1, request_id: 'http-1', jira_issue_key: 'NEW-10', kind: 'new_project', requested_at: '2026-08-27T00:00:00.000Z', requested_by: 'user:1', project: { id: 'HTTP_APP', name: 'HTTP App', domain: 'test', project_type: 'website', deployment_type: 'aws', repository: 'http-app' } };
    const created = await fetch(`${url}/v1/plans`, { method: 'POST', headers: { authorization: 'Bearer test-token-at-least-16', 'content-type': 'application/json' }, body: JSON.stringify(request) });
    expect(created.status).toBe(201); const plan = await created.json() as { plan_id: string };
    const approval = await fetch(`${url}/v1/plans/${encodeURIComponent(plan.plan_id)}/approve`, { method: 'POST', headers: { authorization: 'Bearer test-token-at-least-16', 'x-actor-id': 'not-human', 'x-actor-type': 'ai' } });
    expect(approval.status).toBe(403);
  });
});
