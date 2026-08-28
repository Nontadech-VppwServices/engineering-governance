# AI SDLC MCP Policy

## Purpose

Define the governed MCP capability surface used by the Hermes Execution Plane and future MCP-capable engineering agents.

## Authority

MCP is an interface layer only. It is never authoritative for Jira work state, Git source, Effective Context, ADR/BDR, approval, quality verdicts or deployment state.

## Scope binding

Every scoped call carries a per-call HMAC-signed **job token** minted by `governance-mcp` in `prepare_workspace` and derived from Effective Context. It encodes the job, Jira issue, execution phase, allowed repositories, approved branches and permission decisions.

The model must not choose or override the execution scope. It carries the token; it cannot mint one or widen the one it holds, because editing the payload invalidates the signature. `validateScope` re-runs on every verification and hard-fails if `can_merge`, `can_deploy_production` or `can_access_production_credentials` is anything but `false`.

`JOB_TOKEN_SIGNING_SECRET` is separate from every other secret and independently rotatable. ADR-GLOBAL-010 records why this replaced per-instance scope binding and what that weakened.

## Tool surface

The authoritative allowlist is `ssot/mcp/ai-sdlc-tools.yaml`. It is enforced in three places that must agree — the SSOT file, the `tools.include` list in `hermes/config.yaml`, and the tools registered in `reference/governance-mcp/src/server.ts` — and CI fails on any drift between them.

Read tools must enforce the scoped Jira issue and repository allowlist. Controlled action tools are requests to the deterministic boundary; they do not grant Hermes direct provider credentials.

Adding a tool is a governance change, not an implementation detail. It requires review before it appears in the allowlist.

### Quality gates

`run_quality_gate` accepts a governed gate key, never an arbitrary shell command. The gate key resolves server-side to project-authoritative commands/configuration.

`commit_and_push` and `create_pull_request` must fail unless the boundary has *itself recorded* a passing verdict for every required gate. A result object supplied by the caller, or an assertion in model output that tests passed, is not evidence and must never satisfy this check. Required gates are derived from the project archetype.

### Git

Git write tools may only target:

- a repository in the execution allowlist;
- the exact working branch approved in the scope;
- the current scoped Jira/job execution.

MCP must not expose merge capability.

### Jira

Jira comments may only target the scoped Jira issue. Comments must be sanitized and traceable to the AI SDLC job.

Jira workflow state remains synchronized by the deterministic Control Plane; Hermes does not own Jira status authority.

## Execution phases

### analyze

Allowed:

- all read tools;
- governed read-only quality/inspection tools when configured.

Denied:

- Git writes, refused by execution phase server-side;
- PR creation;
- Jira mutation other than an explicitly enabled diagnostic comment request.

### plan

Same mutation restrictions as `analyze`.

### implement

Read tools and controlled action tools may be available according to Effective Context and Control Plane permissions. Server-side checks remain mandatory for every call.

## Credentials

Hermes must not receive Jira/GitHub provider credentials or production secrets. `governance-mcp` owns the minimum provider credentials required for approved tools.

The Git credential must not reach the workspace either: it is supplied at call time through `GIT_ASKPASS` and must never be written into a remote URL, `.git/config`, or any other file Hermes can read.

A transport/service credential used only to authenticate Hermes to the MCP boundary must be scoped, rotatable and must not grant direct Jira/GitHub/production access.

## Tool filtering

Hermes configuration must include only the tool names registered in `ssot/mcp/ai-sdlc-tools.yaml`. New tools require governance review before they are enabled in the production Hermes profile.

Deployment and rollback are never callable tools. They are reachable only as human-confirmed action types through `draft_action` / `confirm_action`, dispatching a protected workflow registered in `ssot/projects/`, and production still stops at GitHub Environment approval.

## Forbidden capabilities

Never expose through the engineering MCP server:

- merge pull request;
- production deploy/rollback;
- production secret retrieval;
- unrestricted shell/terminal on Control Plane hosts;
- arbitrary Git branch/repository selection;
- governance/ADR/BDR acceptance;
- human approval mutation;
- direct database mutation outside a narrowly governed tool contract.

## Audit

Each tool call must be attributable to:

- execution/job identity;
- tool name;
- repository/Jira scope where applicable;
- timestamp;
- allow/deny result;
- sanitized result/evidence reference.

Secret values and raw provider credentials must never be written to audit events.
