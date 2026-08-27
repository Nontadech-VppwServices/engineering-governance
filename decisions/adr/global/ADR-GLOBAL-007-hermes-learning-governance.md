---
id: ADR-GLOBAL-007
title: Hermes skills, memory, and continuous-improvement governance
status: accepted
scope: global
domain: engineering
date: 2026-08-27
owners:
  - engineering
related_adr:
  - ADR-GLOBAL-004
  - ADR-GLOBAL-005
  - ADR-GLOBAL-006
---

# Context

Hermes can retain cross-session memory and create procedural skills from experience. Those capabilities improve reuse, but unreviewed memory or self-modifying instructions can also preserve stale facts, secrets, prompt injection, or behavior that conflicts with authoritative governance.

# Decision

Adopt Hermes behind a governed learning loop:

```text
execution evidence → observation → skill proposal → evaluation
                   → human approval → publish candidate skill
                   → monitored use → further observation
```

- Memory is contextual cache and always carries `authoritative=false`, provenance, scope, classification, lifecycle state, and optional expiry.
- Secret-like content is rejected before persistence. Production secrets are never memory.
- Memory retrieval returns source references and a warning to re-check authoritative sources before material action.
- Skill changes begin as proposals. They cannot publish until all recorded evaluations pass and the required number of distinct human reviewers approve.
- High-risk skill proposals require two human approvals; lower-risk proposals require one.
- Published generated skills live in a separate runtime directory. Changes to governed built-in skills still use Git/PR review.
- Every lifecycle mutation is retained as an audit event.
- AI cannot mark its own memory or generated summary authoritative, accept governance, merge code, or deploy production.

Hermes runs in its official container with `/opt/data` persisted. The governance repository is mounted read-only; generated skill output is the only writable integration surface shared with the Phase 6 service.

# Consequences

- Learning remains useful without becoming a shadow source of truth.
- Continuous improvement has measurable evaluation and approval gates.
- Runtime state survives container replacement.
- Operators can upgrade Hermes independently from governance data and services.

