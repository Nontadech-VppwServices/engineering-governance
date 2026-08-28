import { describe, expect, it } from 'vitest';
import { isTerminalState, transitionJob } from '../src/state-machine.js';
import type { AiSdlcJob } from '../src/types.js';

function job(state: AiSdlcJob['state'] = 'RECEIVED'): AiSdlcJob {
  return {
    schema_version: 1,
    job_id: 'job-1',
    intake_event_id: 'evt-1',
    jira_issue_key: 'RPA-100',
    work_type: 'task',
    state,
    created_at: '2026-08-28T00:00:00.000Z',
    updated_at: '2026-08-28T00:00:00.000Z',
    repositories: [],
    prs: [],
    history: [],
  };
}

describe('job state machine', () => {
  it('allows a governed transition and records history', () => {
    const next = transitionJob(job(), 'RESOLVING_CONTEXT', 'system');
    expect(next.state).toBe('RESOLVING_CONTEXT');
    expect(next.history).toHaveLength(1);
    expect(next.history[0]?.actor).toBe('system');
  });

  it('rejects an illegal transition', () => {
    expect(() => transitionJob(job(), 'CREATING_PR', 'ai')).toThrow(/Invalid AI SDLC state transition/);
  });

  it('cannot leave a terminal state', () => {
    expect(() => transitionJob(job('DONE'), 'CODING', 'ai')).toThrow(/Invalid/);
  });

  it('records a blocking reason only where it applies', () => {
    expect(transitionJob(job('RESOLVING_CONTEXT'), 'WAITING_INFORMATION', 'ai', 'need component').blocking_reason)
      .toBe('need component');
    expect(transitionJob(job('RESOLVING_CONTEXT'), 'ANALYZING', 'ai', 'ignored').blocking_reason).toBeNull();
  });

  it('identifies terminal states', () => {
    expect(isTerminalState('DONE')).toBe(true);
    expect(isTerminalState('CODING')).toBe(false);
  });
});
