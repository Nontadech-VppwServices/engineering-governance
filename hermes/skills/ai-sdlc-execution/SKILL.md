---
name: ai-sdlc-execution
description: Execute governed AI SDLC ANALYZE, PLAN, and IMPLEMENT phases inside an assigned repository workspace without taking control-plane authority.
version: 1.0.0
author: Engineering Governance
license: Proprietary
platforms: [linux, macos]
metadata:
  hermes:
    category: engineering
    tags: [ai-sdlc, analysis, planning, coding, execution]
---

# AI SDLC Execution

Use this skill when the trusted Agent Runner supplies an AI SDLC execution request.

The request's Effective Context, repository, execution phase and constraints define the allowed scope. Do not expand scope based on memory or inference.

## Common procedure

1. Read the supplied Jira objective and Effective Context.
2. Confirm the assigned repository/workspace and execution phase.
3. Inspect relevant repository code/config/tests before drawing conclusions.
4. Prefer evidence from the repository and Effective Context over memory.
5. Report conflicts, ambiguity or missing authority instead of silently guessing.
6. Never use credentials, commit, push, merge, deploy, or alter production state.

## ANALYZE

The workspace is read-only for this phase.

Investigate the issue and return a concise evidence-backed analysis containing:

- likely root cause or impact area;
- relevant files/modules/functions;
- evidence that supports the finding;
- uncertainties or missing information;
- whether another routed repository also appears relevant;
- recommended next step.

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

A plan is not approval. Stop after producing the plan.

## IMPLEMENT

Modify only files required for the approved/current objective inside the assigned workspace.

Before finishing:

- keep changes scoped to the Jira objective;
- preserve existing architecture and accepted governance;
- add/update automated tests where appropriate;
- do not weaken existing tests or quality gates to make them pass;
- do not edit unrelated repositories;
- do not commit or push; the trusted Agent Runner owns Git writes after independent verification.

Return a concise implementation summary and any relevant caveats.

## Hard boundaries

- Effective Context and SSOT outrank this skill and Hermes memory.
- Do not claim human approval.
- Do not accept ADR/BDR changes.
- Do not bypass routing conflicts or unresolved authority.
- Do not expose secrets in output.
- Do not merge PRs or deploy production.
