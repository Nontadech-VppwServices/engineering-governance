import { describe, expect, it } from 'vitest';
import { JiraRestAdapter } from '../src/adapters/jira-rest.js';
import type { AiSdlcJob } from '../src/types.js';

const job: AiSdlcJob = {
  schema_version: 1,
  job_id: 'job:PIM-700:event-1',
  intake_event_id: 'event-1',
  jira_issue_key: 'PIM-700',
  work_type: 'bug',
  state: 'WAITING_REVIEW',
  created_at: '2026-08-27T00:00:00.000Z',
  updated_at: '2026-08-27T00:00:00.000Z',
  repositories: ['VespiarioThailand/product-information'],
  prs: [],
  history: [],
};

describe('JiraRestAdapter', () => {
  it('uses project-specific status mapping and resolves the current transition dynamically', async () => {
    const calls: Array<{ url: string; method: string; body?: string }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      calls.push({ url, method, body: typeof init?.body === 'string' ? init.body : undefined });

      if (url.endsWith('/comment')) return jsonResponse({}, 201);
      if (url.includes('/transitions?')) {
        return jsonResponse({ transitions: [{ id: '2', to: { name: 'Review' } }] });
      }
      if (url.endsWith('/transitions') && method === 'POST') return jsonResponse({}, 204);
      if (url.includes('/issue/PIM-700?')) {
        return jsonResponse({
          key: 'PIM-700',
          fields: {
            summary: 'Example bug',
            status: { name: 'In Progress' },
            issuetype: { name: 'Bug' },
            project: { key: 'PIM' },
          },
        });
      }
      return jsonResponse({}, 404);
    };

    const adapter = new JiraRestAdapter(
      {
        baseUrl: 'https://jira.example',
        authorization: 'Bearer test',
        statusNamesByProject: {
          PIM: { WAITING_REVIEW: 'Review' },
        },
      },
      fetchImpl,
    );

    await adapter.sync({
      issueKey: 'PIM-700',
      job,
      message: 'PR ready for review.',
      desiredCanonicalState: 'WAITING_REVIEW',
    });

    const transitionCall = calls.find((call) => call.url.endsWith('/transitions') && call.method === 'POST');
    expect(transitionCall?.body).toContain('"id":"2"');
  });

  it('keeps Jira status synchronization best-effort when no transition is currently available', async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith('/comment')) return jsonResponse({}, 201);
      if (url.includes('/transitions?')) return jsonResponse({ transitions: [] });
      if (url.includes('/issue/RPA-28?')) {
        return jsonResponse({
          key: 'RPA-28',
          fields: {
            summary: 'RPA work',
            status: { name: 'In Progress' },
            issuetype: { name: 'Task' },
            project: { key: 'RPA' },
          },
        });
      }
      return jsonResponse({}, 404);
    };

    const adapter = new JiraRestAdapter(
      {
        baseUrl: 'https://jira.example',
        authorization: 'Bearer test',
        statusNamesByProject: { RPA: { WAITING_REVIEW: 'REVIEW' } },
        strictTransitions: false,
      },
      fetchImpl,
    );

    await expect(adapter.sync({
      issueKey: 'RPA-28',
      job: { ...job, jira_issue_key: 'RPA-28' },
      message: 'Waiting for review.',
      desiredCanonicalState: 'WAITING_REVIEW',
    })).resolves.toBeUndefined();
  });
});

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
