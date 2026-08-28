# Hermes Scheduling Governance Policy

## Purpose

Defines the Hermes-first control model for recurring and delayed engineering or automation work.

## Architecture rule

Every scheduled capability must first be evaluated as an approved Hermes skill with governed deterministic tools. Hermes is the execution entry point when it can safely and reliably perform the work. A scheduler or deterministic adapter may retain durable timing, queue, retry, idempotency, and delivery state; it must not replace Hermes reasoning or policy evaluation.

Direct scheduled execution is permitted only through a documented Hermes-first exception. The exception records why Hermes cannot perform the work, its owner, bounded scope, review date, and the preserved trust boundary.

## Lifecycle

1. Draft a schedule using `templates/hermes-scheduled-task.md`.
2. Resolve Effective Context and validate the referenced skill, version, deterministic-tool scope, target, timezone, and risk level.
3. A named human approves creation or change of a mutating schedule through Workflow Control. Approval evidence is bound to the immutable skill version and schedule definition.
4. Publish the schedule through the governed control plane.
5. Each run carries the schedule ID, correlation ID, Effective Context reference, approved skill version, and idempotency key.
6. Pause, revoke, expire, or scope-mismatch a schedule before execution. Revoked or expired schedules must be denied before any state mutation or external delivery.

## Execution controls

- Read-only jobs may run automatically only after publication.
- Mutating jobs require approval when created or changed; a new skill version, wider scope, target change, or schedule change requires a new approval.
- Hermes must use deterministic tools for persistence, queueing, retries, idempotency, and external delivery.
- Hermes output is untrusted for authorization. It cannot approve a schedule, alter its scope, or replace Effective Context.
- Provider and production credentials remain outside Hermes. Trusted adapters expose only the minimum job-scoped capability.
- Every run records sanitized inputs, tool evidence, result, failure reason, and audit/correlation references.

## Reliability and failure handling

Schedules and adapters must be idempotent and safely retryable. Retry/backoff, dead-letter handling, and health monitoring are deterministic responsibilities. A failed run must not silently widen scope, retry forever, or duplicate an external side effect. Escalate failures through the approved reporting and operational channels.

## Implementation

Schedules are Hermes cron jobs. They are seeded from `hermes/cron/jobs.json` when absent and are managed at runtime thereafter, so an operator's pause or revoke survives a restart — a redeploy must never silently re-enable a revoked schedule.

Jira intake and the daily, weekly and monthly RPA reports run under this model. Each job's prompt is self-contained because a scheduled run starts in a fresh session with no memory of previous runs.

External delivery is never performed by the schedule itself. A job calls `send_line_message`, which enqueues on the deterministic outbox with an idempotency key; a re-fired or retried run cannot deliver a duplicate.

Approval records live in `operations/schedules/`, one per schedule, drafted from `templates/hermes-scheduled-task.md`. A mutating schedule must not be enabled until its record carries a named approver.

## References

- `policies/hermes-execution-plane.md`
- `policies/phase4-orchestration.md`
- `policies/rpa-reporting.md`
- `templates/hermes-scheduled-task.md`