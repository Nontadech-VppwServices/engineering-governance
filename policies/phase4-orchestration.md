# Phase 4 AI SDLC Orchestration Policy

## Scope

Controls Jira → governed AI execution → Git branch/test → pull request → Jira synchronization.

ADR-GLOBAL-010 consolidates the execution boundary: Hermes drives the AI SDLC lifecycle through the `ai-sdlc-execution` skill, and `governance-mcp` holds the deterministic authority. There is no separate orchestrator service.

## Intake

An intake event must have a stable event ID and Jira issue key. Duplicate events must be deduplicated before starting another execution for the same logical event.

Recurring Jira intake enters through the approved Hermes scheduled task under `policies/hermes-scheduling-governance.md`. The `list_ready_jira_issues` tool retains the Jira filtering and project/assignee allowlist server-side; `create_job` is idempotent on the intake event ID. There is no polling loop and no queue.

The orchestrator must load live Jira issue context and Effective Context before invoking material AI execution.

Native Jira webhook intake should trigger an AI SDLC job only when:

- an issue is created while assigned to a configured AI SDLC assignee; or
- the assignee changes to a configured AI SDLC assignee.

Ordinary Jira edits must not create a new AI job unless an explicit future policy enables that trigger.

Jira project allow-lists and AI SDLC assignee account IDs are runtime configuration, not model inference.

## Repository routing

- Jira project `RPA`: Component routing from `ssot/jira-routing/RPA.yaml` is mandatory.
- Multi-repository application projects: repository discovery is evidence-driven through the Effective Context Resolver.
- Unresolved routing, `routing_conflict`, `unmapped_component`, `unresolved_authority`, or blocking policy violation stops AI execution that could lead to code modification.
- Hermes may report evidence that routing appears incorrect, but must not silently switch repository scope.

For application projects, Jira users do not need to identify frontend/backend repositories. One issue may route to more than one repository.

## Job persistence

Internal job state must be durable and validated server-side. Every transition goes through `record_job_state`, which rejects an illegal transition; Hermes chooses the sequence but cannot invent a state.

Required state history fields:

- state;
- entered_at;
- actor/type;
- reason when applicable.

Queue state is delivery state only and is never the authoritative AI SDLC job state. Hermes session state or memory is also never the authoritative job state.

## Work execution

`prepare_workspace` derives the execution scope from Effective Context — repository allowlist, approved working branch, execution phase and permissions — and returns it as a signed job token. The scope is never supplied by the caller.

Supported Hermes execution phases:

- `analyze`: read-only repository investigation and evidence-backed findings;
- `plan`: read-only implementation/test planning;
- `implement`: controlled file modification inside the assigned isolated workspace.

For `analyze` and `plan`, the trusted runner must independently verify that no repository file changed. Any modification blocks the phase.

For `implement`, Hermes may edit workspace files but must not receive Git write credentials and must not commit, push, merge or deploy. The trusted runner independently observes changed files, executes required quality gates, verifies ancestry, then performs commit/push only after checks pass.

Hermes run output and memory are non-authoritative artifacts. They cannot grant approval, alter routing, override Effective Context or bypass a control-plane decision.

Work-type behavior:

- Bug: Effective Context → Hermes Analyze → Hermes Implement → trusted tests/Git → PR.
- New Module: Effective Context → Hermes Analyze → Hermes Plan → `WAITING_PLAN_APPROVAL` → Hermes Implement only after human approval.
- Analysis: Hermes Analyze → artifact → DONE without code changes or PR.
- New Project: belongs to Phase 5 and is not executed as a Phase 4 code-modification job.

The execution plane must not receive production credentials through the contract, prompt, workspace or memory.

## Branch naming

Default:

```text
ai/<jira-key-lowercase>-<short-slug>
```

Branch names must be deterministic, safe for Git refs, and traceable to Jira.

## Quality gates

Required quality gates come from Effective Context and organization policy and are independently evaluated by the trusted execution boundary rather than accepted solely from model claims.

AWS website/application minimum:

- API tests: required;
- E2E tests: required.

RPA minimum is automation appropriate and may include:

- type/static checks;
- unit/parser/transformation tests;
- workflow smoke/regression tests;
- idempotency/retry checks where state-changing automation is involved;
- Docker/build verification where applicable.

A required failed/missing gate blocks pull-request creation unless an accepted exception explicitly allows otherwise. Hermes cannot weaken, skip or reinterpret a required gate as passed.

## Pull requests

One Jira issue may create multiple PRs when more than one repository is impacted.

Each PR must include:

- Jira issue key;
- AI SDLC job ID;
- work summary;
- tests executed and result;
- governance/conflict notes where relevant;
- Hermes run reference when available.

AI does not merge PRs.

## Jira synchronization

Core orchestration uses canonical AI SDLC states only. Jira workflow state remains a Jira concern.

Jira transition IDs must not be stored as cross-project constants. Runtime synchronization must:

1. load the current Jira issue and project key;
2. resolve the desired destination status name from project configuration;
3. query currently available Jira transitions;
4. select the transition whose destination status matches the desired name.

If the desired transition is not currently available, the default behavior is **comment-only synchronization**. A Jira workflow difference must not cause an otherwise valid AI SDLC job to fail.

Verified/partial Jira project mappings are registered in `ssot/jira-workflows/phase4-status-mapping.yaml`.

At minimum Jira should receive comments/events for:

- routing resolved;
- Hermes analysis/planning progress where relevant;
- blocked/waiting information;
- PR created;
- tests failed;
- all PRs merged / completion.

## Completion

`WAITING_REVIEW` → `DONE` requires all required PRs to be merged.

A closed-unmerged PR does not complete the job.

## Production

Production deployment remains CI/CD responsibility after human/policy-controlled merge. Neither Hermes nor `governance-mcp` can deploy production directly; a human-confirmed request may only dispatch a protected workflow, which then stops at GitHub Environment approval.

Production credentials must not be persisted in job records, Jira comments, Effective Context payloads, Agent execution requests, Hermes prompts, workspace files or Hermes memory.

## Idempotency

The following operations must be idempotent or safely retryable:

- intake enqueue;
- state transition persistence;
- Hermes execution dispatch/reference tracking;
- branch ensure/create;
- Jira status/comment synchronization;
- PR lookup/create;
- PR-merge completion callback.

## References

- `decisions/adr/global/ADR-GLOBAL-005-phase4-ai-sdlc-orchestration.md`
- `decisions/adr/global/ADR-GLOBAL-008-hermes-execution-plane.md`
- `policies/hermes-execution-plane.md`
- `hermes/skills/ai-sdlc-execution/SKILL.md`
