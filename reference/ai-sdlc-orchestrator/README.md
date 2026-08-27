# AI SDLC Orchestrator — Phase 4 Reference

This package implements the controlled Jira → AI → Git → PR workflow defined by `ADR-GLOBAL-005`, refined by `ADR-GLOBAL-008` so Hermes is the central AI reasoning/execution plane while deterministic services retain control authority.

## Runtime architecture

```text
Jira / normalized intake
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
GitHub merge event → Jira/Durable Job DONE
```

The Orchestrator is the deterministic **Control Plane**. Hermes is the **Execution Plane**. Hermes does not own job state, routing, approval, Git authority, quality-gate verdicts, PR merge or production deployment.

## Jira intake

`POST /webhooks/jira` accepts either the normalized Phase 4 intake schema or a native Jira Cloud webhook payload.

For native Jira events the normalizer starts work only when:

- an issue is created while assigned to a configured AI SDLC assignee; or
- the assignee field changes to a configured AI SDLC assignee.

Ordinary issue edits are ignored to avoid duplicate AI jobs.

For Jira project `RPA`, Component is passed to the Context Resolver and remains subject to deterministic mapping in `ssot/jira-routing/RPA.yaml`. Application projects do not require users to select frontend/backend repositories; resolution remains evidence-based and may return multiple repositories.

## Hermes execution phases

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

- Context Resolver decides whether planning/code modification is permitted.
- Hermes memory/output cannot override Effective Context or SSOT.
- Agent Runner owns isolated workspaces, independent quality verification and Git write capability.
- Git/Jira/production credentials are not supplied to Hermes Coder.
- Orchestrator/Hermes/Agent Runner never merge application PRs directly.
- Production deployment remains controlled by protected CI/CD and human/policy gates.
- One Jira issue may create multiple repository branches/PRs.
- Duplicate Jira delivery is controlled by durable idempotency.

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

- `execution_phase`;
- `hermes_run_id`;
- sanitized `artifact_content`;
- independently observed `changed_files`;
- trusted `quality_gates`;
- implementation commit SHA when applicable.

This evidence is useful for audit/debugging but remains non-authoritative model output except for runner-observed Git/test facts.

## Runtime dependencies

- Redis/BullMQ;
- PostgreSQL durable job state;
- Context Resolver;
- Jira REST/webhook configuration;
- GitHub App/installation credential held outside Hermes;
- trusted Agent Runner;
- internal `hermes-coder` Runs API;
- webhook/API secrets from the runtime secret configuration.

## References

- `decisions/adr/global/ADR-GLOBAL-008-hermes-execution-plane.md`
- `policies/hermes-execution-plane.md`
- `hermes/skills/ai-sdlc-execution/SKILL.md`
- `reference/agent-runner/README.md`

## Local validation

```bash
npm ci
npm run typecheck
npm test
npm run build
```
