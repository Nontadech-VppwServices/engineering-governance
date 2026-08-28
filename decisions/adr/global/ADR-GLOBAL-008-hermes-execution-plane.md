---
id: ADR-GLOBAL-008
title: Hermes as the governed AI execution plane
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
  - ADR-GLOBAL-007
superseded_partially_by:
  - ADR-GLOBAL-010
---

> **Partially superseded by ADR-GLOBAL-010.** The two-plane separation below
> still holds and is now actually implemented. The deterministic control plane
> and the Trusted Agent Runner no longer exist as separate services: their
> authoritative responsibilities moved into `governance-mcp`, and their
> sequencing responsibilities moved into Hermes skills.

# Context

The production runtime already separates deterministic AI SDLC control from an isolated Hermes Coder container. The trusted Agent Runner owns repository workspace preparation, Git credentials, independent quality-gate execution, commit/push and result validation, while Hermes currently performs only the file-editing portion of implementation.

Keeping analysis, planning and implementation reasoning in separate ad-hoc orchestration logic would duplicate capabilities that Hermes already provides through its agent runtime, skills, memory and subagent/tool execution. At the same time, moving queue state, approvals, authoritative routing, Git authority or production controls into Hermes would make deterministic recovery, audit and security weaker.

# Decision

Adopt a two-plane architecture.

```text
Jira / LINE / GitHub events
          ↓
┌────────────────────────────────────┐
│ AI SDLC CONTROL PLANE              │
│                                    │
│ intake + idempotency               │
│ BullMQ / durable job state         │
│ Effective Context + repository SSOT│
│ policy / approval gates            │
│ trusted Git + quality verification │
│ PR / deployment boundaries         │
└─────────────────┬──────────────────┘
                  │ governed execution contract
                  ▼
┌────────────────────────────────────┐
│ HERMES EXECUTION PLANE             │
│                                    │
│ ANALYZE                            │
│ PLAN                               │
│ IMPLEMENT                          │
│ skills / memory / subagents/tools  │
└─────────────────┬──────────────────┘
                  │ evidence / edits
                  ▼
        Trusted Agent Runner
          ↓               ↓
 independent tests     Git commit/push
          ↓
          PR
```

## Control-plane authority

The deterministic control plane remains authoritative for:

- Jira intake and workflow synchronization;
- AI SDLC job state and idempotency;
- Effective Context and governed repository routing;
- human approvals;
- authorization and secrets;
- repository/branch scope;
- independent quality-gate verdicts;
- Git commit/push and pull-request creation;
- merge/deployment boundaries and audit evidence.

These responsibilities must not be delegated to Hermes memory or reasoning.

## Hermes execution phases

The execution contract supports three phases:

1. `analyze` — read-only repository investigation and evidence-backed findings;
2. `plan` — read-only implementation/test plan generation;
3. `implement` — controlled file modification inside the assigned isolated workspace.

Hermes output is execution evidence, not an authoritative source. The control plane may persist it as an AI SDLC artifact with provenance.

## Trusted Agent Runner boundary

The Agent Runner remains a security boundary around Hermes:

- it creates the job-specific workspace;
- it supplies only repositories returned by Effective Context;
- it does not expose Git/Jira/production credentials to Hermes;
- for `analyze` and `plan`, repository changes are prohibited and detected independently;
- for `implement`, Hermes may edit files but may not commit, push, merge or deploy;
- the runner independently executes required repository quality gates;
- only the runner commits/pushes the verified implementation branch;
- merge and production deployment remain outside both Hermes and the runner.

## Chat and execution profiles

`hermes` is the consolidated human conversational interface and internal AI Execution Plane profile. It uses Workflow Control for state-changing chat requests and remains an internal execution surface for Agent Runner coding tasks.

The consolidated Hermes service is not a public Git/Jira control surface and receives no production credentials.

## Skills and memory

Hermes skills are the preferred location for reusable AI execution procedures. Generated skills remain governed by ADR-GLOBAL-007. Memory remains `authoritative=false` and cannot override Effective Context, Jira, Git, accepted ADR/BDR or policy.

# Consequences

- Hermes becomes the reusable center for AI reasoning instead of only a file editor.
- Phase 4 orchestration stays restartable, deterministic and auditable.
- Analysis and planning become real agent work rather than placeholder orchestration text.
- Git and quality enforcement remain independent from model behavior.
- Hermes can be upgraded or replaced without changing SSOT/state contracts.
- Future skills can improve Bug, Module, RPA and New Project execution without creating a new orchestration service per capability.
