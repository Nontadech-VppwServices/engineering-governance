# RPA Reporting Policy

## Purpose

Defines the organization-wide operational reporting contract for RPA/automation projects.

## Architecture rule

RPA projects report execution results to a central RPA Reporting Service. Individual bots should not own LINE integration, report schedules, aggregate query logic, or LINE credentials.

```text
Bot -> Reporting API -> Reporting Store -> Aggregator -> LINE Messaging API
```

The architecture authority is `decisions/adr/global/ADR-GLOBAL-002-central-rpa-reporting.md`.

## Standard run-event contract

Bots must emit events compatible with `schemas/rpa-run-event.schema.json`.

Minimum lifecycle:

1. emit `started` when a controlled run begins;
2. emit `completed`, `failed`, `cancelled`, or `skipped` when the run ends;
3. reuse the same `run_id` for the lifecycle of one run;
4. retry reporting safely without creating duplicate runs/events.

A bot business transaction must not be rolled back merely because reporting delivery failed. Reporting failure must be queued/retried and surfaced operationally.

## Required common metrics

Where meaningful, bots should report:

- `items_received`
- `items_processed`
- `items_succeeded`
- `items_failed`
- `items_skipped`
- `retry_count`
- execution duration (derived from timestamps)

Project-specific metrics may be added in a namespaced metadata object, but should not replace the common fields.

## Error normalization

Failed runs should provide a stable `error_code` and a sanitized `error_summary`.

Do not use raw exception messages as a durable reporting taxonomy. Common categories should converge over time, for example:

- `AUTHENTICATION_FAILED`
- `SOURCE_UNAVAILABLE`
- `TARGET_UNAVAILABLE`
- `VALIDATION_FAILED`
- `UI_SELECTOR_CHANGED`
- `TIMEOUT`
- `FILE_CONTRACT_ERROR`
- `DUPLICATE_PREVENTED`
- `UNKNOWN`

Raw stack traces remain in controlled application logs/evidence storage, not LINE messages.

## Report schedules

Timezone: `Asia/Bangkok`.

The Reporting Service generates:

- **Daily** — previous calendar day
- **Weekly** — previous Monday through Sunday
- **Monthly** — previous calendar month

Delivery clock times and recipients/groups are centralized configuration. Bots must not hard-code reporting destinations or schedules.

## LINE integration

Use LINE Messaging API through an approved LINE Official Account.

Do not use LINE Notify; it is no longer an available service.

LINE channel credentials must exist only in an approved secret store for the central reporting service.

## Scheduled report content

Minimum organization summary:

- period and timezone;
- total executions;
- success / failed / skipped / cancelled counts;
- success rate;
- total processed / succeeded / failed items;
- total retries;
- average execution duration;
- per-bot breakdown;
- top normalized failures;
- link/reference to detailed evidence/dashboard when available.

## Alerting

Critical failure alerts may be sent immediately through the central reporting service. Alert deduplication and throttling are required to prevent repeated failure loops from flooding LINE.

Suggested alert key:

```text
bot_id + environment + error_code + alert_window
```

## Security and privacy

Never place these values in LINE messages or run-event metadata:

- passwords;
- access/refresh tokens;
- cookies/session state;
- secret-manager values;
- customer-sensitive payloads;
- unrestricted invoice/order/customer records;
- raw screenshots containing sensitive data;
- full stack traces.

Instead include a safe evidence reference or internal correlation ID.

## Reliability

The reporting system must support:

- event idempotency;
- retry/backoff;
- duplicate-event detection;
- report idempotency;
- send-attempt tracking;
- failure/dead-letter handling;
- health monitoring;
- retained historical data sufficient for monthly reporting and operational analysis.

## AI SDLC rule

When creating a new RPA project, the New Project Agent must include the reporting client/adapter required to emit the standard run event.

When modifying an existing RPA project, AI must not introduce direct LINE integration if the central reporting service is available. It should integrate the common reporting contract instead.
