import { describe, expect, it } from 'vitest';
import { normalizeWorkType } from '../src/jira.js';

describe('Jira work type normalization', () => {
  it('maps a Jira Task issue type to task', () => {
    expect(normalizeWorkType(null, 'Task')).toBe('task');
  });

  it('maps a Task custom field to task', () => {
    expect(normalizeWorkType('Task', 'Story')).toBe('task');
  });

  it('rejects work types other than task', () => {
    expect(normalizeWorkType('bug', 'Bug')).toBeNull();
  });
});
