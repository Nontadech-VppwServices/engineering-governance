import { describe, expect, it } from 'vitest';
import { issueToIntake } from '../src/polling.js';

const config = {
  intervalMs: 900000,
  jiraProjects: ['PIM'],
  jiraAssignees: ['account-1'],
  componentFieldId: 'customfield_component',
  workTypeFieldId: 'customfield_work_type',
};

describe('issueToIntake', () => {
  it('creates a deterministic event for an eligible updated issue', () => {
    const event = issueToIntake({
      key: 'PIM-42',
      fields: {
        summary: 'Fix checkout',
        updated: '2026-08-27T08:00:00.000Z',
        project: { key: 'PIM' },
        assignee: { accountId: 'account-1' },
        issuetype: { name: 'Bug' },
        customfield_component: { value: 'checkout' },
        customfield_work_type: { value: 'bug' },
      },
    }, config);

    expect(event).toMatchObject({
      event_id: 'jira-poll:PIM-42:2026-08-27T08:00:00.000Z',
      issue_key: 'PIM-42',
      event_type: 'issue_updated',
      work_type: 'bug',
      component: 'checkout',
    });
  });

  it('ignores issues outside the configured project or assignee', () => {
    expect(issueToIntake({ key: 'RPA-1', fields: { summary: 'x', updated: '2026-08-27T08:00:00.000Z', project: { key: 'RPA' }, assignee: { accountId: 'account-2' } } }, config)).toBeNull();
  });
});