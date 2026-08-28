---
id: HERMES-SCHEDULE-001
title: AI SDLC Jira intake
status: draft
owner: engineering
created_at: 2026-08-28
review_by: 2026-11-28
---

# Purpose

Detect Jira issues assigned to the AI SDLC assignee and start a governed job for
each. This replaces the deterministic polling worker: the Jira filtering and the
project/assignee allowlist remain server-side in `list_ready_jira_issues`, while
Hermes decides what to do with each result.

# Schedule

- Expression or interval: `*/15 * * * *`
- Timezone: `Asia/Bangkok`
- Start/end or expiry: none; revoke through `/cron`
- Trigger class: recurring

# Approved Execution

- Skill ID and immutable version: `engineering-governance` 2.0.0, `ai-sdlc-execution` 2.0.0
- Effective Context reference: resolved per issue via `get_effective_context`
- Permitted deterministic tools: `list_ready_jira_issues`, `create_job`,
  `get_effective_context`, `record_job_state`, `add_jira_comment`,
  `prepare_workspace`, `search_repository`, `read_repository_file`
- Idempotency-key strategy: `create_job` is idempotent on the Jira-supplied
  `intake_event_id` (`jira-poll:<key>:<updated>`), so a re-fired sweep cannot
  double-process an issue
- External target/destination: Jira comments on the scoped issue only

# Risk and Approval

- Classification: **mutating** (creates jobs, writes Jira comments)
- Data classification: internal engineering
- Approval evidence and approver: _pending — record before enabling_
- Scope limits: projects in `JIRA_ALLOWED_PROJECT_KEYS`, issues assigned to
  `JIRA_AI_ASSIGNEE_ACCOUNT_IDS`. Cannot approve a plan, merge, or deploy.
- Pause/revoke procedure: `/cron` in a private admin session

# Reliability

- Retry/backoff and dead-letter behavior: no automatic retry of a run; the next
  sweep re-examines the same window. Jira writes are idempotent per job.
- Health signal and escalation target: `governance-mcp` `/healthz`; job state
  visible through `get_job`
- Rollback/fallback: revoke the schedule; in-flight jobs remain in their
  recorded state and can be resumed or cancelled by a human

# Hermes-First Exception

Not applicable. Hermes performs this work; the boundary retains filtering,
idempotency and Jira credentials.
