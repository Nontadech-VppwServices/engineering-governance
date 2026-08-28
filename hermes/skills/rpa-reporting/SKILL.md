---
name: rpa-reporting
description: Produce governed RPA run reports and alerts from authoritative reporting data, and deliver them through the deterministic outbox.
version: 1.0.0
author: Engineering Governance
license: Proprietary
platforms: [linux, macos]
metadata:
  hermes:
    category: operations
    tags: [rpa, reporting, scheduling, line]
---

# RPA Reporting

Use this skill for scheduled daily, weekly and monthly RPA reports, and for any
ad-hoc question about RPA run outcomes.

## Authority

`query_rpa_metrics` is the only source for run counts. Never estimate, never
carry a number over from memory or from a previous report, and never fill a gap
with a plausible figure. If the tool returns zeros, the correct report says no
runs were recorded.

Timezone is `Asia/Bangkok`. Pass `from` and `to` as ISO 8601 with the `+07:00`
offset; a bare timestamp will be read as UTC and silently shift the period.

## Procedure

1. Compute the period boundaries for the requested report kind.
2. Call `query_rpa_metrics` with `from` and `to`.
3. Render the format below from the returned `counts` and `success_rate`.
4. Deliver with `send_line_message`, using an `idempotency_key` of
   `report:<kind>:<from>`. The outbox deduplicates on that key, so a retried or
   re-fired run cannot deliver the same report twice.
5. Report what you sent, including the key.

Delivery is never done by composing a message some other way. `send_line_message`
returns once the message is durably queued; the outbox owns retry, backoff and
dead-lettering. `enqueued: false` means the key already existed — that is a
successful no-op, not a failure to retry.

## Format

```
RPA <kind> report
Period: <from> - <to>
Completed: <n>
Failed: <n>
Skipped: <n>
Cancelled: <n>
Success rate: <n>%
```

Add a short line naming any bot with repeated failures when the data shows one.
Do not add commentary, speculation about causes, or recommendations unless the
evidence in the returned data supports it.

## Periods

- daily: the 24 hours ending 09:00 today
- weekly: the 7 days ending 09:00 today
- monthly: the previous calendar month, 00:00 on the 1st to 00:00 on the 1st

## Alerts

Production run failures raise their own deduplicated alert inside
`ingest_rpa_event`. Do not send a duplicate alert for a failure that a report
already covers.

## Hard boundaries

- Do not invent, round, or reconcile numbers the tool did not return.
- Do not send to a target outside the configured delivery allowlist; a
  `target_not_allowed` result is a governance decision, not a transient error.
- Do not include raw payloads, credentials, screenshots or customer-identifying
  data in a report.
- Do not treat a report as an approval, an incident record, or authority to act.
