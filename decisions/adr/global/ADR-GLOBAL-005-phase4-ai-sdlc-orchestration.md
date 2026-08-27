---
id: ADR-GLOBAL-005
title: Jira to AI to Git pull-request orchestration
status: accepted
scope: global
domain: engineering
date: 2026-08-27
owners:
  - engineering
related_adr:
  - ADR-GLOBAL-003
  - ADR-GLOBAL-004
---

# Context

Phase 3 provides a deterministic Effective Context Resolver, but a production AI SDLC also needs a controlled execution workflow from Jira intake through repository work and pull-request creation.

The workflow must be restartable, idempotent, observable, multi-repository aware, and must not give AI merge or production-deployment authority.

# Decision

Implement Phase 4 as an event-driven orchestration service.

```text
Jira event/webhook
      ↓
Intake validation + idempotency
      ↓
Queue (BullMQ/Redis production pattern)
      ↓
Persistent AI SDLC Job
      ↓
Effective Context Resolver
      ↓
Repository route(s)
      ↓
Agent Execution Port
      ↓
Quality Gate Evaluation
      ↓
Git branch + commit/push through controlled workspace
      ↓
Pull Request(s)
      ↓
Jira comment/status synchronization
      ↓
WAITING_REVIEW
      ↓
GitHub PR merged event
      ↓
Jira DONE synchronization
```

## State machine

Canonical internal states:

- `RECEIVED`
- `RESOLVING_CONTEXT`
- `WAITING_INFORMATION`
- `ANALYZING`
- `PLANNING`
- `WAITING_PLAN_APPROVAL`
- `CODING`
- `TESTING`
- `CREATING_PR`
- `WAITING_REVIEW`
- `DONE`
- `FAILED`
- `CANCELLED`

Jira native status names are not authoritative for the internal state machine. Each Jira project may map these canonical states to its own workflow transitions.

## Work types

Phase 4 supports controlled execution for:

- bug fixes;
- new modules/features where architecture remains within accepted decisions;
- analysis-only runs.

New Project automation remains Phase 5.

## Multi-repository issues

One Jira issue may result in more than one repository branch and pull request. All PRs share the Jira issue traceability key and remain grouped under one AI SDLC job.

## Quality gates

Before PR creation, required project quality gates must pass.

AWS website/application projects require API + E2E minimums according to `policies/testing.md`.

RPA projects use automation-appropriate gates according to governance and project registry context.

A failed required gate blocks PR creation unless an approved exception exists.

## Human boundaries

AI may create branches, commits and PRs when Effective Context allows it.

AI must not:

- merge application PRs;
- deploy production directly;
- bypass required CI or reviewers;
- treat a Jira description as permission to override accepted governance;
- silently switch an RPA Component to another repository.

## Queue and persistence

Production queue pattern: BullMQ + Redis.

The queue is delivery infrastructure, not job authority. A durable Job Store is authoritative for AI SDLC job state and idempotency.

## Jira synchronization

Jira remains authoritative for the work item. AI SDLC writes only operational synchronization data such as:

- routing result;
- current AI workflow state;
- blocking reason;
- branch/PR references;
- test summary;
- completion result.

Project-specific Jira transition mapping is configuration, not hard-coded orchestration logic.

## GitHub merge callback

A PR-merged event may transition an AI job from `WAITING_REVIEW` to `DONE` only after every required PR for that job is merged. Closing a PR without merge must not be interpreted as successful completion.

# Consequences

- AI execution becomes restartable and auditable.
- Jira project workflow differences do not leak into core orchestration.
- Multi-repository fixes are first-class.
- Phase 4 adapters can be replaced without changing the state machine or Effective Context contract.

# References

- `policies/ai-sdlc.md`
- `policies/phase4-orchestration.md`
- `schemas/ai-sdlc-job.schema.json`
- `schemas/jira-ai-intake-event.schema.json`
- `schemas/agent-execution-request.schema.json`
- `schemas/agent-execution-result.schema.json`
