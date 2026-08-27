import { describe, expect, it } from 'vitest';
import { normalizeJiraWebhook } from '../src/jira-webhook.js';

describe('normalizeJiraWebhook', () => {
  it('routes an RPA assignment and reads the configured Component dropdown', () => {
    const event = normalizeJiraWebhook(
      {
        webhookEvent: 'jira:issue_updated',
        timestamp: 1787800000000,
        issue: {
          id: '18445',
          key: 'RPA-28',
          fields: {
            project: { key: 'RPA' },
            issuetype: { name: 'Task' },
            assignee: { accountId: 'ai-user' },
            customfield_component: { value: 'AP_PO_INVOICE' },
          },
        },
        changelog: { items: [{ field: 'assignee', from: null, to: 'ai-user' }] },
      },
      {
        targetAssigneeAccountIds: ['ai-user'],
        allowedProjectKeys: ['RPA'],
        componentFieldId: 'customfield_component',
      },
      { webhookIdentifier: 'jira-event-001' },
    );

    expect(event).toMatchObject({
      event_id: 'jira-event-001',
      issue_key: 'RPA-28',
      event_type: 'issue_assigned',
      component: 'AP_PO_INVOICE',
      work_type: null,
    });
  });

  it('infers bug work type from Jira issue type', () => {
    const event = normalizeJiraWebhook(
      {
        webhookEvent: 'jira:issue_created',
        timestamp: 1787800000000,
        issue: {
          id: '20001',
          key: 'PIM-700',
          fields: {
            project: { key: 'PIM' },
            issuetype: { name: 'Bug' },
            assignee: { accountId: 'ai-user' },
          },
        },
      },
      { targetAssigneeAccountIds: ['ai-user'] },
      { webhookIdentifier: 'jira-event-002' },
    );

    expect(event?.work_type).toBe('bug');
    expect(event?.event_type).toBe('issue_created');
  });

  it('ignores assignment to a non-target user', () => {
    const event = normalizeJiraWebhook(
      {
        webhookEvent: 'jira:issue_updated',
        timestamp: 1787800000000,
        issue: {
          key: 'RPA-28',
          fields: {
            project: { key: 'RPA' },
            assignee: { accountId: 'someone-else' },
          },
        },
        changelog: { items: [{ field: 'assignee' }] },
      },
      { targetAssigneeAccountIds: ['ai-user'] },
    );

    expect(event).toBeNull();
  });

  it('ignores ordinary issue updates to prevent duplicate AI jobs', () => {
    const event = normalizeJiraWebhook(
      {
        webhookEvent: 'jira:issue_updated',
        timestamp: 1787800000000,
        issue: {
          key: 'PIM-700',
          fields: {
            project: { key: 'PIM' },
            assignee: { accountId: 'ai-user' },
          },
        },
        changelog: { items: [{ field: 'description' }] },
      },
      { targetAssigneeAccountIds: ['ai-user'] },
    );

    expect(event).toBeNull();
  });
});
