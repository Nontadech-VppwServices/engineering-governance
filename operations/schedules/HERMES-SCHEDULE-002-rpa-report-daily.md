---
id: HERMES-SCHEDULE-002
title: RPA daily report
status: draft
owner: engineering
created_at: 2026-08-28
review_by: 2026-11-28
---

# Purpose

Deliver the RPA daily run summary to the LINE reporting channel. Hermes renders
the report; the deterministic outbox delivers it.

# Schedule

- Expression or interval: `0 9 * * *`
- Timezone: `Asia/Bangkok`
- Start/end or expiry: none; revoke through `/cron`
- Trigger class: recurring

# Approved Execution

- Skill ID and immutable version: `rpa-reporting` 1.0.0
- Effective Context reference: not required; reporting reads aggregate run data only
- Permitted deterministic tools: `query_rpa_metrics`, `send_line_message`
- Idempotency-key strategy: `report:daily:<from>` — the outbox deduplicates on
  this key, so a re-fired or retried run cannot deliver a duplicate
- External target/destination: `LINE_HOME_CHANNEL`, which must appear in
  `LINE_DELIVERY_TARGET_IDS`

# Risk and Approval

- Classification: **mutating** (sends an external message)
- Data classification: internal operational metrics; no customer data, no raw payloads
- Approval evidence and approver: _pending — record before enabling_
- Scope limits: period is the 24 hours ending 09:00 today. Read-only against reporting data; cannot
  reach Jira, GitHub, or any repository.
- Pause/revoke procedure: `/cron` in a private admin session

# Reliability

- Retry/backoff and dead-letter behavior: delivery retries with exponential
  backoff to `DEAD_LETTER` after `REPORT_MAX_ATTEMPTS`; a failed run is not
  auto-retried, and the next occurrence uses a different idempotency key
- Health signal and escalation target: `governance-mcp` `/healthz` reports
  `outbox: stalled` and returns 503 when the worker stops ticking
- Rollback/fallback: revoke the schedule; queued messages still drain

# Hermes-First Exception

Not applicable. Hermes owns timing and rendering; the boundary owns aggregation
and delivery guarantees.
