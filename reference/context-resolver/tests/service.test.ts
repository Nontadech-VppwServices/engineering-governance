import { describe, expect, it } from 'vitest';
import { ContextResolverService } from '../src/service.js';
import { createStaticContextSources } from '../src/adapters/static.js';

const retrievedAt = '2026-08-27T05:00:00.000Z';

describe('ContextResolverService', () => {
  it('resolves RPA Component before repository inspection', async () => {
    const service = new ContextResolverService(
      createStaticContextSources({
        jiraIssues: {
          'RPA-100': {
            issueKey: 'RPA-100',
            projectKey: 'RPA',
            summary: 'AP PO invoice cannot post',
            component: 'AP_PO_INVOICE',
            retrievedAt,
          },
        },
        projects: {
          RPA_AP_PO_INVOICE: {
            id: 'RPA_AP_PO_INVOICE',
            name: 'RPA AP PO Invoice',
            jiraProjectKey: 'RPA',
            testingCompliance: 'gap',
            businessContextStatus: 'scaffolded_pending_human_review',
            deploymentStatus: 'verified',
          },
        },
        projectByJiraKey: { RPA: 'RPA_AP_PO_INVOICE' },
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
        repositoryFacts: {
          'VespiarioThailand/rpa-ap-po-invoice': {
            repository: 'VespiarioThailand/rpa-ap-po-invoice',
            targetBranch: 'main',
            facts: { runtime: 'typescript', automation: 'playwright' },
            projectContextPaths: ['docs/business/README.md'],
          },
        },
      }),
    );

    const context = await service.resolve({
      schema_version: 1,
      request_id: 'req-rpa-100',
      jira_issue_key: 'RPA-100',
    });

    expect(context.routing.status).toBe('resolved');
    expect(context.routing.repositories[0]?.repository).toBe(
      'VespiarioThailand/rpa-ap-po-invoice',
    );
    expect(context.repositories[0]?.facts).toEqual({
      runtime: 'typescript',
      automation: 'playwright',
    });
    expect(context.decision.can_modify_code).toBe(true);
    expect(context.decision.can_deploy_production).toBe(false);
  });

  it('keeps multi-repository application routing', async () => {
    const service = new ContextResolverService(
      createStaticContextSources({
        jiraIssues: {
          'WEB-200': {
            issueKey: 'WEB-200',
            projectKey: 'WEB',
            summary: 'Profile page fails after API request',
            retrievedAt,
          },
        },
        projects: {
          WEBSITE: {
            id: 'WEBSITE',
            name: 'Website',
            jiraProjectKey: 'WEB',
          },
        },
        projectByJiraKey: { WEB: 'WEBSITE' },
        discoveries: {
          WEBSITE: [
            {
              repository: 'VespiarioThailand/example-backend',
              role: 'backend',
              confidence: 0.97,
              reason: 'API route and error signature match.',
              evidence: ['GET /api/profile', 'error signature'],
            },
            {
              repository: 'VespiarioThailand/example-frontend',
              role: 'frontend',
              confidence: 0.9,
              reason: 'Frontend consumes the failing endpoint and needs regression coverage.',
              evidence: ['profile page API client'],
            },
          ],
        },
      }),
    );

    const context = await service.resolve({
      schema_version: 1,
      request_id: 'req-web-200',
      jira_issue_key: 'WEB-200',
    });

    expect(context.routing.status).toBe('multi_repo');
    expect(context.routing.repositories).toHaveLength(2);
    expect(context.decision.can_modify_code).toBe(true);
  });
});
