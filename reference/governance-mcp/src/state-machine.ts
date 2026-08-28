import { GovernanceError, type AiSdlcJob, type JobState, type StateHistoryEntry } from './types.js';

// Ported unchanged from ai-sdlc-orchestrator. Job state remains deterministic
// and server-validated even though Hermes now drives the sequence of calls.
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
    throw new GovernanceError(
      `Invalid AI SDLC state transition: ${job.state} -> ${next}`,
      409,
      'INVALID_STATE_TRANSITION',
    );
  }
  return {
    ...job,
    state: next,
    updated_at: now,
    blocking_reason:
      next === 'WAITING_INFORMATION' || next === 'FAILED' ? reason ?? job.blocking_reason ?? null : null,
    history: [...job.history, { state: next, entered_at: now, actor, reason: reason ?? null }],
  };
}

export function isTerminalState(state: JobState): boolean {
  return state === 'DONE' || state === 'FAILED' || state === 'CANCELLED';
}
