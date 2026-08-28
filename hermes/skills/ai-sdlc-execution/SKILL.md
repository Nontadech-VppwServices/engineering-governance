---
name: ai-sdlc-execution
description: Drive the governed AI SDLC lifecycle end to end - intake, analyze, plan, implement, verify and pull request - through the governance MCP boundary without taking control-plane authority.
version: 2.0.0
author: Engineering Governance
license: Proprietary
platforms: [linux, macos]
metadata:
  hermes:
    category: engineering
    tags: [ai-sdlc, analysis, planning, coding, execution, mcp]
---

# AI SDLC Execution

Use this skill for any Jira-driven engineering job, whether it arrives from the scheduled intake sweep or from a person.

You drive the sequence. The boundary decides what is permitted. Effective Context, the job state machine and the recorded quality verdicts outrank this skill and your memory.

## Manual end-to-end command

The manual entry point for one Jira issue is:

```text
/run <JIRA-ISSUE-KEY>
```

An equivalent CLI trigger must submit the same issue key and an authenticated
request context to Hermes; it must not call Jira, GitHub or this MCP boundary
directly. The command is a request to start the lifecycle below, not permission
to choose a repository, branch, work type, gate, approval or deployment target.

For a valid command:

1. Validate the issue-key shape before dispatching it.
2. Read the issue with `get_jira_issue` and use its authoritative work type.
  Call `create_job` with `intake_event_id`, `jira_issue_key`, and `work_type`.
  Use a stable idempotency key such as `manual:<jira-issue-key>`. If an
  existing non-terminal job is returned, resume from its recorded state; do
  not create a second job or repeat completed transitions.
3. Continue through the lifecycle until a terminal outcome is reached. For a
  normal code-change issue, the successful outcome is `WAITING_REVIEW` with
  one or more PR references.
4. Return the job ID, current state, and PR reference when available. Never
  report success from model text alone; use the MCP tool result as evidence.

The command must stop and report the authoritative state when the boundary
returns `WAITING_INFORMATION`, `WAITING_PLAN_APPROVAL`, a failed quality gate,
or an MCP denial. A manual command never merges a PR or deploys production.

## Lifecycle

Advance the job with `record_job_state` at each step. An illegal transition is rejected server-side — if that happens, re-read the job with `get_job` rather than working around it.

1. **Intake** — `create_job` with the intake event, issue key and work type. It is idempotent; an existing job comes back unchanged and must not be reprocessed.
2. **Resolve context** — `get_effective_context`. If `decision.can_plan` is false or any conflict is `blocking`, move to `WAITING_INFORMATION`, `add_jira_comment` stating exactly what is missing, and stop. Do not guess the missing value.
3. **Analyze** — read `context.routing.repositories` and call
  `prepare_workspace` with exactly `{ job_id, repository, execution_phase:
  "analyze" }` for each routed repository. Never omit `repository` or
  `execution_phase`, and never invent either value. Then investigate and move
  to `ANALYZING`.
4. **Plan** — move to `PLANNING` and produce the plan. For `new_module` and `new_project`, `create_plan` and stop at `WAITING_PLAN_APPROVAL`. A plan is not an approval.
5. **Implement** — only after approval where approval is required. Call
  `prepare_workspace` with exactly `{ job_id, repository,
  execution_phase: "implement" }`, using only the repository returned by
  Effective Context. Then edit files in the returned workspace path and move
  to `CODING`.
6. **Verify** — move to `TESTING` and run every gate in `required_gates` with `run_quality_gate`. Fix real failures and re-run. Never weaken a test or a gate to make it pass.
7. **Deliver** — `commit_and_push`, then `create_pull_request`, moving through `CREATING_PR` to `WAITING_REVIEW`. Comment the PR link back with `add_jira_comment`.

Merge is not part of this lifecycle. A merged PR is observed, never caused.

## Workspace and phases

`prepare_workspace` returns the workspace path, the approved working branch, the required gates, and the `job_token` every other scoped tool needs. The token encodes the phase and the repository allowlist; you carry it but cannot alter it.

- `analyze` and `plan`: the workspace is read-only. Git write tools are refused by phase, not by convention.
- `implement`: edit only files required for the current objective, inside the assigned workspace.

## ANALYZE

Return a concise, evidence-backed analysis containing:

- likely root cause or impact area;
- relevant files/modules/functions;
- the evidence that supports the finding;
- uncertainties or missing information;
- whether another routed repository also appears relevant;
- recommended next step.

If the issue appears routed incorrectly, report `routing_conflict_candidate`. Do not switch repositories.

## PLAN

Produce a plan containing:

- intended behaviour/change;
- implementation steps;
- likely files/modules affected;
- tests and quality gates that should verify the change;
- compatibility/migration risks;
- dependencies and unresolved questions;
- architecture/BDR/ADR implications if any.

Stop after producing the plan.

## IMPLEMENT

- Keep changes scoped to the Jira objective.
- Preserve existing architecture and accepted governance.
- Add or update automated tests where appropriate.
- Do not weaken existing tests or gates.
- Do not edit unrelated repositories.

`commit_and_push` and `create_pull_request` are refused until every required gate has a *recorded* passing verdict. Claiming tests passed does not satisfy that; running `run_quality_gate` does. If a gate cannot pass, say so and stop — a blocked job is a correct outcome.

## MCP surface

Read: `get_effective_context`, `get_jira_issue`, `search_repository`, `read_repository_file`, `get_job`, `get_pull_request_status`

Controlled: `create_job`, `record_job_state`, `prepare_workspace`, `run_quality_gate`, `commit_and_push`, `create_pull_request`, `add_jira_comment`, `sync_jira_state`, `create_plan`

The production allowlist is `ssot/mcp/ai-sdlc-tools.yaml`. Merge, production deploy, production-secret retrieval, arbitrary shell, routing mutation, ADR/BDR acceptance and human-approval mutation are not in the surface and must not be sought by other means.

## Hard boundaries

- Effective Context and SSOT outrank this skill and Hermes memory.
- Do not claim human approval.
- Do not accept ADR/BDR changes.
- Do not bypass routing conflicts or unresolved authority.
- Do not expose secrets in output.
- Do not merge PRs or deploy production.
- Do not bypass an MCP scope, phase or permission denial.
