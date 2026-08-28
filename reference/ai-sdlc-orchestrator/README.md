# AI SDLC Orchestrator — Phase 4 Reference

This package implements the controlled Jira → AI → Git → PR workflow defined by `ADR-GLOBAL-005`.

## Runtime architecture

```text
Jira REST polling / normalized intake event
  ↓
Assignee + project filter
  ↓
Intake validation + idempotency
  ↓
QueuePort
  ├─ InMemoryQueue (tests)
  └─ BullMQQueue (production pattern)
  ↓
JobStore
  ├─ InMemoryJobStore (tests)
  └─ PostgresJobStore (production pattern)
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
  ↓
GitHub REST pull request polling
  ↓
DONE after all required PRs are human/policy merged
```

## Jira intake

Phase 4 polls Jira REST on a configurable interval (default 15 minutes), filters eligible issues by project and AI assignee, and enqueues deterministic intake events.

`JIRA_POLL_INTERVAL_MS` controls the interval. Polling events use the Jira issue key and update timestamp as their idempotency key.

Polling intentionally starts work only when:

- an issue is created while assigned to a configured AI SDLC assignee; or
- the assignee field changes to a configured AI SDLC assignee.

Ordinary issue edits are ignored to avoid duplicate AI jobs.

Required polling configuration:

```ts
JIRA_POLL_INTERVAL_MS=900000
JIRA_AI_ASSIGNEE_ACCOUNT_IDS=<JIRA_ACCOUNT_ID>
JIRA_ALLOWED_PROJECT_KEYS=PIM,RPA,TMS,VESPISTI
```

For Jira project `RPA`, the selected Component is passed to the Context Resolver and remains subject to the deterministic Component → repository mapping in `ssot/jira-routing/RPA.yaml`.

Application projects do not require users to select frontend/backend repositories. Repository resolution remains evidence-based and may return multiple repositories.

## Jira workflow synchronization

The internal AI SDLC job state is authoritative for orchestration. Jira remains authoritative for Jira workflow state.

Do **not** hard-code Jira transition IDs. Runtime synchronization:

1. reads the issue and Jira project key;
2. chooses a project-specific destination status name;
3. queries currently available transitions;
4. selects a transition whose destination status matches the configured name;
5. falls back to Jira comment-only synchronization when the transition is not currently available.

Verified/partial project mappings are registered in:

```text
ssot/jira-workflows/phase4-status-mapping.yaml
```

This prevents workflow differences between PIM/RPA/TMS/VESPISTI from causing valid AI jobs to fail.

## Important boundaries

- Context Resolver decides whether code modification is allowed.
- Agent Runner performs repository-specific analysis/coding/testing through a controlled workspace.
- Orchestrator never merges PRs.
- Orchestrator never directly deploys production.
- Production credentials are never included in Agent requests or persisted job payloads.
- One Jira issue may create multiple PRs.
- RPA repository routing remains deterministic through Jira Component governance.
- Duplicate polling observations are controlled by deterministic intake-event/job idempotency.

## Canonical states

```text
RECEIVED
→ RESOLVING_CONTEXT
→ ANALYZING
→ PLANNING
→ WAITING_PLAN_APPROVAL (New Module only)
→ CODING
→ TESTING
→ CREATING_PR
→ WAITING_REVIEW
→ DONE
```

Blocking paths may enter `WAITING_INFORMATION`, `FAILED`, or `CANCELLED`.

## Work-type behavior

- **Bug**: resolve repository → analyze → code → test → PR → wait for review/merge.
- **New Module**: resolve repository → plan → `WAITING_PLAN_APPROVAL` → code/test/PR only after human approval.
- **Analysis**: analyze without code or PR.
- **New Project** remains Phase 5 and is intentionally not implemented by this orchestrator.

## Production dependencies

The reference adapters expect these capabilities to be supplied at runtime:

- Redis for BullMQ;
- PostgreSQL for durable job state/idempotency;
- Phase 3 Context Resolver endpoint;
- Jira REST credentials/OAuth supplied from a secret store;
- GitHub App/installation token supplied from a secret store;
- controlled Agent Runner endpoint;
- Jira REST and GitHub REST credentials.

Secrets must not be committed to this repository, Jira comments, Effective Context, or AI job payloads.

## HTTP endpoints

```text
GET  /healthz
GET  /v1/jobs/{jobId}
POST /v1/jobs/{jobId}/retry
POST /v1/jobs/{jobId}/cancel
```

## Local validation

```bash
npm install
npm run typecheck
npm test
```

CI validation is defined in `.github/workflows/phase4-orchestrator-validation.yml`.
