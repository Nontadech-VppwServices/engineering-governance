import type { AiSdlcJob, JobState, StateHistoryEntry } from './types.js';

const ALLOWED: Record<JobState, readonly JobState[]> = {
  RECEIVED: ['RESOLVING_CONTEXT', 'CANCELLED', 'FAILED'],
  RESOLVING_CONTEXT: ['ANALYZING', 'WAITING_INFORMATION', 'FAILED', 'CANCELLED'],
  WAITING_INFORMATION: ['RESOLVING_CONTEXT', 'CANCELLED', 'FAILED'],
  ANALYZING: ['PLANNING', 'CODING', 'DONE', 'WAITING_INFORMATION', 'FAILED', 'CANCELLED'],
  PLANNING: ['WAITING_PLAN_APPROVAL', 'CODING', 'WAITING_INFORMATION', 'FAILED', 'CANCELLED'],
  WAITING_PLAN_APPROVAL: ['CODING', 'CANCELLED', 'FAILED'],
  CODING: ['TESTING', 'WAITING_INFORMATION', 'FAILED', 'CANCELLED'],
  TESTING: ['CREATING_PR', 'WAITING_INFORMATION', 'FAILED', 'CANCELLED'],
  CREATING_PR: ['WAITING_REVIEW', 'FAILED', 'CANCELLED'],
  WAITING_REVIEW: ['DONE', 'FAILED', 'CANCELLED'],
  DONE: [],
  FAILED: [],
  CANCELLED: [],
};

export function transitionJob(
  job: AiSdlcJob,
  next: JobState,
  actor: StateHistoryEntry['actor'],
  reason?: string | null,
  now = new Date().toISOString(),
): AiSdlcJob {
  if (!ALLOWED[job.state].includes(next)) {
    throw new Error(`Invalid AI SDLC state transition: ${job.state} -> ${next}`);
  }
  return {
    ...job,
    state: next,
    updated_at: now,
    blocking_reason: next === 'WAITING_INFORMATION' || next === 'FAILED' ? reason ?? job.blocking_reason ?? null : null,
    history: [
      ...job.history,
      { state: next, entered_at: now, actor, reason: reason ?? null },
    ],
  };
}

export function isTerminalState(state: JobState): boolean {
  return state === 'DONE' || state === 'FAILED' || state === 'CANCELLED';
}
