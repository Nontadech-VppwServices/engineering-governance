import { describe, expect, it } from 'vitest';
import { resolveEffectiveContext, resolveRouting, type ProjectSnapshot } from '../src/context.js';

function project(overrides: Partial<ProjectSnapshot> = {}): ProjectSnapshot {
  return {
    id: 'RPA_AP_PO_INVOICE',
    name: 'AP PO Invoice',
    domain: 'finance',
    type: 'rpa',
    archetype: 'onprem-playwright-typescript-rpa',
    jiraProjectKey: 'RPA',
    defaultRepository: 'VespiarioThailand/rpa-ap-po-invoice',
    defaultBranch: 'main',
    testingCompliance: 'compliant',
    businessContextStatus: 'approved',
    deploymentStatus: 'verified',
    ...overrides,
  };
}

const rpaRouting = {
  projectKey: 'RPA' as const,
  components: { 'AP PO Invoice': { repository: 'VespiarioThailand/rpa-ap-po-invoice', status: 'active' } },
};

describe('repository routing', () => {
  it('routes an RPA component deterministically', () => {
    const result = resolveRouting({
      project: project(),
      jira: { issueKey: 'RPA-1', projectKey: 'RPA', component: 'AP PO Invoice', retrievedAt: 'now' },
      rpaRouting,
    });
    expect(result.mode).toBe('deterministic_component');
    expect(result.status).toBe('resolved');
    expect(result.repositories[0]?.repository).toBe('VespiarioThailand/rpa-ap-po-invoice');
  });

  it('blocks an RPA issue with no component', () => {
    const result = resolveRouting({
      project: project(),
      jira: { issueKey: 'RPA-2', projectKey: 'RPA', component: null, retrievedAt: 'now' },
      rpaRouting,
    });
    expect(result.status).toBe('unmapped_component');
    expect(result.conflicts[0]?.blocking).toBe(true);
  });

  it('blocks a deprecated RPA component route', () => {
    const result = resolveRouting({
      project: project(),
      jira: { issueKey: 'RPA-3', projectKey: 'RPA', component: 'Old Bot', retrievedAt: 'now' },
      rpaRouting: {
        projectKey: 'RPA',
        components: { 'Old Bot': { repository: 'VespiarioThailand/old', status: 'deprecated' } },
      },
    });
    expect(result.status).toBe('unmapped_component');
  });

  it('falls back to the registry default repository', () => {
    const result = resolveRouting({ project: project({ jiraProjectKey: 'PIM' }), jira: null });
    expect(result.mode).toBe('project_default');
    expect(result.status).toBe('resolved');
  });

  it('waits for information when nothing routes', () => {
    const result = resolveRouting({ project: project({ defaultRepository: null, jiraProjectKey: 'PIM' }), jira: null });
    expect(result.status).toBe('waiting_information');
  });

  it('will not act on low-confidence discovery', () => {
    const result = resolveRouting({
      project: project({ defaultRepository: null }),
      jira: null,
      discoveredRepositories: [
        { repository: 'a/b', role: 'primary', confidence: 0.6, reason: 'guess', evidence: [] },
      ],
    });
    expect(result.status).toBe('analyzing_candidates');
  });
});

describe('effective context decision', () => {
  it('permits code modification on a clean deterministic route', () => {
    const context = resolveEffectiveContext({
      requestId: 'ctx-1',
      project: project(),
      jira: { issueKey: 'RPA-1', projectKey: 'RPA', component: 'AP PO Invoice', retrievedAt: 'now' },
      rpaRouting,
    }) as any;
    expect(context.decision.can_plan).toBe(true);
    expect(context.decision.can_modify_code).toBe(true);
    expect(context.decision.can_create_pr).toBe(true);
  });

  // Production deployment is never grantable through Effective Context.
  it('never permits production deployment', () => {
    const context = resolveEffectiveContext({
      requestId: 'ctx-2',
      project: project(),
      jira: { issueKey: 'RPA-1', projectKey: 'RPA', component: 'AP PO Invoice', retrievedAt: 'now' },
      rpaRouting,
    }) as any;
    expect(context.decision.can_deploy_production).toBe(false);
  });

  it('blocks code modification when the component is unmapped', () => {
    const context = resolveEffectiveContext({
      requestId: 'ctx-3',
      project: project(),
      jira: { issueKey: 'RPA-9', projectKey: 'RPA', component: null, retrievedAt: 'now' },
      rpaRouting,
    }) as any;
    expect(context.decision.can_modify_code).toBe(false);
    expect(context.decision.reason).toMatch(/routing|conflict/i);
  });

  it('escalates an always-blocking conflict even when reported as non-blocking', () => {
    const context = resolveEffectiveContext({
      requestId: 'ctx-4',
      project: project(),
      jira: { issueKey: 'RPA-1', projectKey: 'RPA', component: 'AP PO Invoice', retrievedAt: 'now' },
      rpaRouting,
      knownConflicts: [
        { type: 'policy_violation', severity: 'high', blocking: false, message: 'policy', sources: [] },
      ],
    }) as any;
    expect(context.conflicts[0].blocking).toBe(true);
    expect(context.decision.can_plan).toBe(false);
  });

  it('emits the schema-required top-level fields', () => {
    const context = resolveEffectiveContext({ requestId: 'ctx-5', project: project(), jira: null }) as any;
    for (const key of [
      'schema_version', 'request_id', 'generated_at', 'project', 'routing', 'governance',
      'business', 'repositories', 'compliance', 'conflicts', 'unresolved', 'decision', 'sources',
    ]) {
      expect(context).toHaveProperty(key);
    }
  });
});
