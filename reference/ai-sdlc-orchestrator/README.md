# AI SDLC Orchestrator — Phase 4 Reference

This package demonstrates the controlled Jira → AI → Git → PR workflow defined by `ADR-GLOBAL-005`.

## Runtime architecture

```text
Jira webhook/event
  ↓
Intake validation + idempotency
  ↓
QueuePort
  ├─ InMemoryQueue (tests)
  └─ BullMQQueue (production pattern)
  ↓
JobStore
  ↓
ContextResolverPort
  ↓
AgentRunnerPort
  ↓
Quality-gate evaluation
  ↓
GitHostPort
  ↓
Pull Request(s)
  ↓
JiraSyncPort
```

## Important boundaries

- Context Resolver decides whether code modification is allowed.
- Agent Runner performs repository-specific analysis/coding/testing through a controlled workspace.
- Orchestrator never merges PRs.
- Orchestrator never directly deploys production.
- One Jira issue may create multiple PRs.
- RPA repository routing remains deterministic through Jira Component governance.

## Canonical states

`RECEIVED → RESOLVING_CONTEXT → ANALYZING → PLANNING → CODING → TESTING → CREATING_PR → WAITING_REVIEW → DONE`

Blocking paths may enter `WAITING_INFORMATION`, `FAILED`, or `CANCELLED`.

## Production pattern

Use BullMQ/Redis for queue delivery and a durable database-backed `JobStore` for job authority/idempotency. Queue state must not be treated as the source of truth for AI SDLC job state.

## Local validation

```bash
npm install
npm run typecheck
npm test
```
