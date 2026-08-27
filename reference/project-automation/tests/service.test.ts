import { describe, expect, it } from 'vitest';
import { InMemoryPlanStore, InMemoryScaffoldPublisher, ProjectAutomationService, type AutomationRequest } from '../src/index.js';

const projectRequest: AutomationRequest = { schema_version: 1, request_id: 'req-1', jira_issue_key: 'NEW-1', kind: 'new_project', requested_at: '2026-08-27T00:00:00.000Z', requested_by: 'user:1', project: { id: 'NEW_APP', name: 'New App', domain: 'commerce', project_type: 'fullstack_application', deployment_type: 'aws', repository: 'new-app' } };

describe('ProjectAutomationService', () => {
  it('selects the governed archetype and requires human approval', async () => {
    const service = new ProjectAutomationService(new InMemoryPlanStore(), new InMemoryScaffoldPublisher());
    const plan = await service.createPlan(projectRequest);
    expect(plan.archetype).toBe('aws-nextjs-typescript');
    expect(plan.state).toBe('WAITING_PLAN_APPROVAL');
    await expect(service.execute(plan.plan_id)).rejects.toMatchObject({ code: 'APPROVAL_REQUIRED' });
    await expect(service.approve(plan.plan_id, 'agent', 'ai')).rejects.toMatchObject({ code: 'HUMAN_APPROVAL_REQUIRED' });
  });

  it('generates a deterministic Docker/test/governance baseline after approval', async () => {
    const publisher = new InMemoryScaffoldPublisher();
    const service = new ProjectAutomationService(new InMemoryPlanStore(), publisher);
    const waiting = await service.createPlan(projectRequest);
    await service.approve(waiting.plan_id, 'engineer@example.com', 'human');
    const completed = await service.execute(waiting.plan_id);
    expect(completed.state).toBe('COMPLETED');
    const files = publisher.published.get('new-app')!;
    expect(Object.keys(files)).toEqual(expect.arrayContaining(['Dockerfile', '.env.example', '.ai/project.yaml', 'app/layout.tsx', 'playwright.config.ts', 'tests/api/health.test.ts', 'tests/e2e/home.spec.ts']));
    expect(files['.gitignore']).toContain('.env');
  });

  it('generates an RPA baseline with a normalized event and retry test', async () => {
    const publisher = new InMemoryScaffoldPublisher();
    const service = new ProjectAutomationService(new InMemoryPlanStore(), publisher);
    const request: AutomationRequest = { ...projectRequest, request_id: 'rpa-1', project: { id: 'RPA_NEW', name: 'New RPA', domain: 'operations', project_type: 'rpa', deployment_type: 'on_prem', repository: 'rpa-new' } };
    const plan = await service.createPlan(request); await service.approve(plan.plan_id, 'rpa-owner', 'human'); await service.execute(plan.plan_id);
    const files = publisher.published.get('rpa-new')!;
    expect(files['src/index.ts']).toContain('schema_version: 1');
    expect(files['src/index.ts']).toContain("event_type: 'started'");
    expect(files).toHaveProperty('src/retry.ts');
    expect(files).toHaveProperty('tests/workflow.test.ts');
  });

  it('returns a Phase 4 handoff for an approved module plan', async () => {
    const request: AutomationRequest = { schema_version: 1, request_id: 'module-1', jira_issue_key: 'APP-2', kind: 'new_module', requested_at: '2026-08-27T00:00:00.000Z', requested_by: 'user:1', module: { project_id: 'APP', module_name: 'billing', repository: 'org/app', target_path: 'src/billing', effective_context: { decision: { can_plan: true, can_modify_code: true }, conflicts: [] } } };
    const service = new ProjectAutomationService(new InMemoryPlanStore(), new InMemoryScaffoldPublisher());
    const plan = await service.createPlan(request);
    await service.approve(plan.plan_id, 'owner', 'human');
    const completed = await service.execute(plan.plan_id);
    expect(completed.output?.type).toBe('phase4_handoff');
    expect(completed.output?.handoff).toMatchObject({ work_type: 'new_module', requires_fresh_effective_context: true });
  });
});
