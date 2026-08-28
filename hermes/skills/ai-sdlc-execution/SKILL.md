---
name: ai-sdlc-execution
description: Execute governed AI SDLC ANALYZE, PLAN, and IMPLEMENT phases inside an assigned repository workspace using the AI SDLC MCP capability boundary without taking control-plane authority.
version: 1.1.0
author: Engineering Governance
license: Proprietary
platforms: [linux, macos]
metadata:
  hermes:
    category: engineering
    tags: [ai-sdlc, analysis, planning, coding, execution, mcp]
---

# AI SDLC Execution

Use this skill when the trusted Agent Runner supplies an AI SDLC execution request.

The request's Effective Context, repository, execution phase and constraints define the allowed scope. Do not expand scope based on memory or inference.

For external engineering facts/actions, prefer the governed AI SDLC MCP tools exposed to the Hermes profile. Do not build ad-hoc Jira/GitHub/provider integrations inside a skill.

## Common procedure

1. Read the supplied Jira objective and Effective Context.
2. Confirm the assigned repository/workspace and execution phase.
3. Use `get_effective_context` / `get_jira_issue` when live governed context is needed.
4. Inspect relevant repository code/config/tests using the assigned workspace or scoped MCP repository read/search tools.
5. Prefer evidence from the repository, live Jira and Effective Context over memory.
6. Report conflicts, ambiguity or missing authority instead of silently guessing.
7. Never use provider credentials, merge, deploy, or alter production state.
8. Treat an MCP denial as an authoritative execution-boundary decision; do not attempt to bypass it with another tool or shell path.

## ANALYZE

The workspace is read-only for this phase.

Investigate the issue and return a concise evidence-backed analysis containing:

- likely root cause or impact area;
- relevant files/modules/functions;
- evidence that supports the finding;
- uncertainties or missing information;
- whether another routed repository also appears relevant;
- recommended next step.

Allowed MCP capabilities are read/scoped inspection only. Do not request branch/commit/push/PR mutation tools.

Do not modify files. If the issue appears routed incorrectly, report `routing_conflict_candidate`; do not switch repositories.

## PLAN

The workspace is read-only for this phase.

Produce an implementation plan containing:

- intended behavior/change;
- implementation steps;
- likely files/modules affected;
- tests/quality gates that should verify the change;
- compatibility/migration risks;
- dependencies and unresolved questions;
- architecture/BDR/ADR implications if any.

A plan is not approval. Stop after producing the plan. MCP mutation tools remain out of scope.

## IMPLEMENT

Modify only files required for the approved/current objective inside the assigned workspace.

Before finishing:

- keep changes scoped to the Jira objective;
- preserve existing architecture and accepted governance;
- add/update automated tests where appropriate;
- do not weaken existing tests or quality gates to make them pass;
- do not edit unrelated repositories;
- use only named governed quality gates; never pass arbitrary shell commands to an MCP service;
- allow Trusted Runner/MCP server-side policy to decide whether commit/push/PR requests are permitted.

Hermes never receives GitHub/Jira provider credentials. A controlled MCP action is a request to the trusted boundary, not authority owned by Hermes.

Return a concise implementation summary and any relevant caveats.

## MCP surface

Expected governed tools may include:

- `get_effective_context`
- `get_jira_issue`
- `search_repository`
- `read_repository_file`
- `run_quality_gate`
- `ensure_working_branch`
- `commit_verified_changes`
- `push_working_branch`
- `create_pull_request`
- `add_jira_comment`

The exact production tool allowlist is `ssot/mcp/ai-sdlc-tools.yaml`.

Tools such as merge, production deploy, production-secret retrieval, arbitrary control-plane shell, routing mutation, ADR/BDR acceptance or human-approval mutation must not exist in the engineering MCP surface.

## Hard boundaries

- Effective Context and SSOT outrank this skill and Hermes memory.
- Do not claim human approval.
- Do not accept ADR/BDR changes.
- Do not bypass routing conflicts or unresolved authority.
- Do not expose secrets in output.
- Do not merge PRs or deploy production.
- Do not bypass MCP scope/permission denials.
