---
id: ADR-GLOBAL-002
title: Centralized RPA reporting with LINE Messaging API
status: accepted
scope: global
domain: automation
project: null
date: 2026-08-27
owners:
  - engineering
supersedes: []
superseded_by: null
related_bdr: []
related_jira: []
---

# Context

Multiple on-premise RPA projects need operational reporting. Sending LINE messages independently from every bot would duplicate credentials, message formatting, aggregation logic, scheduling, retry handling, and message-delivery code.

Historical daily, weekly and monthly reporting also requires a durable common run history rather than parsing local text logs at report time.

LINE Notify is no longer an available integration path. Organization notifications must use the LINE Messaging API through an approved LINE Official Account.

# Decision

Use a **central RPA Reporting Service**.

Individual bots must emit normalized run events to the reporting service. Bots must not implement their own daily/weekly/monthly LINE reporting logic unless an approved exception exists.

Architecture:

```text
RPA Bots
   │
   ├── run started
   ├── progress/metrics (optional)
   └── run completed/failed
          │
          ▼
RPA Reporting API
          │
          ▼
Durable Reporting Store
          │
          ├── Daily Aggregator
          ├── Weekly Aggregator
          └── Monthly Aggregator
                  │
                  ▼
          LINE Messaging Adapter
                  │
                  ▼
          LINE Official Account
                  │
                  ▼
          User / Group Chat
```

Default implementation language for the reporting service should be TypeScript/Node.js so it can share schemas/tooling with the primary RPA stack. A durable relational store such as PostgreSQL is the default reporting datastore unless another approved architecture is chosen.

# Reporting periods

Organization reporting timezone: `Asia/Bangkok`.

- daily: previous calendar day;
- weekly: previous Monday through Sunday;
- monthly: previous calendar month.

Exact delivery clock times are deployment configuration and must be configured centrally rather than hard-coded into bots.

# Minimum report content

Reports should include, as applicable:

- reporting period;
- total runs;
- successful runs;
- failed runs;
- skipped/cancelled runs;
- success rate;
- items processed;
- items failed;
- retry count;
- total/average execution duration;
- per-bot summary;
- top normalized error codes/reasons;
- link/reference to detailed evidence or dashboard when available.

Do not send credentials, access tokens, cookies, customer-sensitive payloads, raw stack traces, or unrestricted log dumps to LINE.

# Immediate alerts

Critical run failures may additionally produce near-real-time alerts through the same reporting service. Immediate alerts do not replace scheduled daily/weekly/monthly reports.

# Options Considered

## Each bot sends LINE directly

### Advantages

- simple for the first bot.

### Disadvantages

- duplicated secrets and code;
- inconsistent messages;
- difficult historical aggregation;
- hard to manage quotas/retries centrally;
- higher security and maintenance cost.

## Central reporting service

### Advantages

- one LINE integration;
- normalized metrics across bots;
- centralized schedules and retry policy;
- durable history for daily/weekly/monthly reports;
- easier dashboarding and future channels.

### Disadvantages

- introduces a shared service/datastore that must be operated reliably.

# Consequences

All new RPA projects must implement the organization RPA run-event contract. Existing RPA projects should be migrated incrementally.

LINE is an output adapter, not the source of reporting truth. The durable reporting datastore is the reporting source; LINE messages are generated views.

# Validation / Guardrails

- bots use the versioned run-event schema;
- reporting API authenticates bot/service identities;
- LINE channel access token is stored only in an approved secret store for the reporting service;
- report generation is idempotent per `report_type + period + destination`;
- send attempts and delivery result metadata are recorded;
- repeated bot events must be deduplicated by stable event/run identifiers;
- reporting failure must not alter the underlying RPA business transaction result.

# References

- `policies/rpa-reporting.md`
- `schemas/rpa-run-event.schema.json`
- `ADR-GLOBAL-001`
