---
id: ADR-GLOBAL-006
title: Controlled module and new-project automation
status: accepted
scope: global
domain: engineering
date: 2026-08-27
owners:
  - engineering
related_adr:
  - ADR-GLOBAL-001
  - ADR-GLOBAL-004
  - ADR-GLOBAL-005
---

# Context

Phase 4 can stop a New Module job at a plan-approval gate, but the organization also needs a deterministic way to select a golden archetype and create a governed baseline for a New Project. Generating code without a reviewable plan would allow an AI agent to silently select a stack, repository identity, or deployment target.

# Decision

Phase 5 uses a durable plan state machine:

```text
request → validation/context gate → WAITING_PLAN_APPROVAL
        → human approval → APPROVED → deterministic execution → COMPLETED
```

- New Module requests reuse the Phase 4 agent execution path after human plan approval and a fresh Effective Context check.
- New Project requests select only an active archetype accepted by `ADR-GLOBAL-001`.
- AWS applications use `aws-nextjs-typescript`.
- On-premise RPA uses `onprem-playwright-typescript-rpa`.
- Any other primary stack requires an accepted ADR/exception; AI cannot infer an exception.
- Generation writes only to a configured staging root. Repository creation, push, PR merge, and production deployment remain separate controlled actions.
- Every plan retains request, approval, state-history, and generated-output evidence.

# Consequences

- Plans are restartable and auditable.
- Human approval is explicit and attributable.
- Golden scaffolds are deterministic and can be tested without external Git/Jira access.
- Generated output is staged for review and is not automatically authoritative or deployed.

