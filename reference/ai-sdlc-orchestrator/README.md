# AI SDLC Orchestrator — Phase 4 Reference

This package implements the controlled Jira → AI → Git → PR workflow defined by `ADR-GLOBAL-005`, refined by `ADR-GLOBAL-008` so Hermes is the central AI reasoning/execution plane while deterministic services retain control authority.

## Runtime architecture

```text
Jira REST polling / normalized intake event
  ↓
Intake + idempotency
  ↓
BullMQ / durable JobStore
  ↓
Effective Context Resolver
  ↓
Governed repository route(s)
  ↓
Trusted AgentRunnerPort
  ↓
Hermes Execution Plane
  ├─ ANALYZE   read-only
  ├─ PLAN      read-only
  └─ IMPLEMENT controlled file edits
  ↓
Trusted Agent Runner
  ├─ changed-file enforcement
  ├─ independent quality gates
  └─ Git commit/push
  ↓
Pull Request(s)
  ↓
Human/policy review + merge
  ↓
GitHub REST pull request polling
  ↓
DONE after all required PRs are human/policy merged
```

The Orchestrator is the deterministic **Control Plane**. Hermes is the **Execution Plane**. Hermes does not own job state, routing, approval, Git authority, quality-gate verdicts, PR merge or production deployment.

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

### ANALYZE

The Orchestrator invokes the Agent Runner once per governed repository using `execution_phase=analyze`. The runner gives Hermes read-only repository access. Hermes findings are stored as non-authoritative analysis artifacts with its run ID. If files change, the runner blocks the result and the Orchestrator also performs a defensive changed-file check.

### PLAN

New Module planning uses `execution_phase=plan`. Hermes returns an implementation/test plan from repository evidence without modifying files. The plan is persisted as an AI artifact, then the job enters `WAITING_PLAN_APPROVAL`. Hermes output never counts as human approval.

### IMPLEMENT

After policy/approval permits modification, `execution_phase=implement` allows Hermes to edit only the assigned workspace. Hermes cannot commit or push. The trusted Agent Runner independently executes required tests, verifies the branch and performs Git commit/push only after the checks pass.

## Jira workflow synchronization

The internal AI SDLC state is authoritative for orchestration; Jira remains authoritative for Jira workflow state. Do not hard-code Jira transition IDs. Runtime synchronization resolves project-specific destination status names and current available transitions, with comment-only fallback when a transition is not currently available.

Verified/partial mappings live in:

```text
ssot/jira-workflows/phase4-status-mapping.yaml
```

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
→ ANALYZING       (Hermes)
→ PLANNING        (Hermes, when required)
→ WAITING_PLAN_APPROVAL
→ CODING          (Hermes implementation)
→ TESTING         (trusted runner evidence)
→ CREATING_PR
→ WAITING_REVIEW
→ DONE
```

Blocking paths may enter `WAITING_INFORMATION`, `FAILED`, or `CANCELLED`.

## Work-type behavior

- **Bug**: Context → Hermes Analyze → Hermes Implement → trusted tests/Git → PR.
- **New Module**: Context → Hermes Analyze → Hermes Plan → human approval → Hermes Implement → trusted tests/Git → PR.
- **Analysis**: Context → Hermes Analyze → artifact → DONE, without branch/PR.
- **New Project**: routed through Phase 5 project automation and its approval controls.

## Traceability

Agent results may include:

- Redis for BullMQ;
- PostgreSQL for durable job state/idempotency;
- Phase 3 Context Resolver endpoint;
- Jira REST credentials/OAuth supplied from a secret store;
- GitHub App/installation token supplied from a secret store;
- controlled Agent Runner endpoint;
- Jira REST and GitHub REST credentials.

This evidence is useful for audit/debugging but remains non-authoritative model output except for runner-observed Git/test facts.

## Runtime dependencies

```text
GET  /healthz
GET  /v1/jobs/{jobId}
POST /v1/jobs/{jobId}/retry
POST /v1/jobs/{jobId}/cancel
```

## Local validation

```bash
npm ci
npm run typecheck
npm test
npm run build
```
