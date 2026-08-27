import { describe, expect, it } from 'vitest';
import { resolveEffectiveContext } from '../src/resolve.js';
import type { ResolverInput } from '../src/types.js';

const baseInput: Omit<ResolverInput, 'requestId' | 'project'> = {
  governance: {
    policies: ['policies/testing.md', 'policies/context-resolution.md'],
    adrs: ['ADR-GLOBAL-003', 'ADR-GLOBAL-004'],
    bdrs: [],
  },
  business: {
    contextStatus: 'scaffolded_pending_human_review',
    contextPaths: ['docs/business/README.md'],
  },
  sources: [
    {
      id: 'engineering-governance',
      type: 'governance_repository',
      authority: 'organization_policy',
      retrievedAt: '2026-08-27T10:30:00+07:00',
    },
  ],
};

describe('resolveEffectiveContext', () => {
  it('routes an RPA AP PO Invoice issue deterministically', () => {
    const context = resolveEffectiveContext({
      ...baseInput,
      requestId: 'req-rpa-1',
      project: {
        id: 'RPA_AP_PO_INVOICE',
        name: 'RPA AP PO Invoice',
        jiraProjectKey: 'RPA',
        testingCompliance: 'gap',
      },
      jira: {
        issueKey: 'RPA-100',
        projectKey: 'RPA',
        component: 'AP_PO_INVOICE',
        retrievedAt: '2026-08-27T10:31:00+07:00',
      },
      rpaRouting: {
        projectKey: 'RPA',
        components: {
          AP_PO_INVOICE: {
            repository: 'VespiarioThailand/rpa-ap-po-invoice',
            repositoryRole: 'primary',
            status: 'active',
          },
        },
      },
      repositoryFacts: [
        {
          repository: 'VespiarioThailand/rpa-ap-po-invoice',
          targetBranch: 'main',
          facts: { runtime: 'typescript', automation: 'playwright' },
        },
      ],
    });

    expect(context.routing.status).toBe('resolved');
    expect(context.routing.repositories[0]?.repository).toBe('VespiarioThailand/rpa-ap-po-invoice');
    expect(context.routing.repositories[0]?.confidence).toBe(1);
    expect(context.decision.can_modify_code).toBe(true);
    expect(context.decision.can_deploy_production).toBe(false);
  });

  it('blocks an RPA issue when Component is missing', () => {
    const context = resolveEffectiveContext({
      ...baseInput,
      requestId: 'req-rpa-2',
      project: {
        id: 'RPA',
        name: 'RPA',
        jiraProjectKey: 'RPA',
      },
      jira: {
        issueKey: 'RPA-101',
        projectKey: 'RPA',
        component: null,
        retrievedAt: '2026-08-27T10:31:00+07:00',
      },
      rpaRouting: {
        projectKey: 'RPA',
        components: {},
      },
    });

    expect(context.routing.status).toBe('unmapped_component');
    expect(context.conflicts.some((item) => item.type === 'unmapped_component' && item.blocking)).toBe(true);
    expect(context.decision.can_modify_code).toBe(false);
  });

  it('supports an application issue impacting frontend and backend', () => {
    const context = resolveEffectiveContext({
      ...baseInput,
      requestId: 'req-app-1',
      project: {
        id: 'VESPISTIID',
        name: 'Vespisti ID',
        domain: 'vespistiid',
        jiraProjectKey: 'VESPISTIID',
      },
      jira: {
        issueKey: 'VESPISTIID-200',
        projectKey: 'VESPISTIID',
        summary: 'Login succeeds but profile data is missing',
        retrievedAt: '2026-08-27T10:31:00+07:00',
      },
      discoveredRepositories: [
        {
          repository: 'VespiarioThailand/vespistiid-backend',
          role: 'backend',
          confidence: 0.97,
          reason: 'Profile API implementation and failing response are in backend.',
          evidence: ['/api/profile', 'repository_code_search'],
        },
        {
          repository: 'VespiarioThailand/vespistiid-platform',
          role: 'frontend',
          confidence: 0.9,
          reason: 'Frontend consumes the profile API and needs regression coverage.',
          evidence: ['profile client', 'e2e flow'],
        },
      ],
    });

    expect(context.routing.status).toBe('multi_repo');
    expect(context.routing.repositories).toHaveLength(2);
    expect(context.decision.can_modify_code).toBe(true);
  });

  it('keeps a high-severity configuration drift visible without silently enabling production', () => {
    const context = resolveEffectiveContext({
      ...baseInput,
      requestId: 'req-tms-1',
      project: {
        id: 'TMS_BACKEND',
        name: 'TMS Backend',
        jiraProjectKey: 'TMS',
        defaultRepository: 'VespiarioThailand/tms-backend',
        defaultBranch: 'main',
        testingCompliance: 'non_compliant',
      },
      knownConflicts: [
        {
          type: 'configuration_drift',
          severity: 'high',
          blocking: false,
          message: 'Production workflow references PIM resources.',
          sources: ['tms-backend/.github/workflows/prod.yml'],
        },
      ],
    });

    expect(context.conflicts[0]?.type).toBe('configuration_drift');
    expect(context.decision.can_modify_code).toBe(true);
    expect(context.decision.can_deploy_production).toBe(false);
  });
});
