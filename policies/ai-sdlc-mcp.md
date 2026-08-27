# AI SDLC MCP Policy

## Purpose

Define the governed MCP capability surface used by the Hermes Execution Plane and future MCP-capable engineering agents.

## Authority

MCP is an interface layer only. It is never authoritative for Jira work state, Git source, Effective Context, ADR/BDR, approval, quality verdicts or deployment state.

## Scope binding

Every engineering MCP server instance/session must be bound to an immutable execution scope created by the trusted runtime. The scope contains the job, Jira issue, execution phase, allowed repositories, approved branches and permission decisions.

The model must not choose or override the execution scope.

## Read tools

The standard read surface is:

- `get_effective_context`
- `get_jira_issue`
- `search_repository`
- `read_repository_file`

Read tools must enforce the scoped Jira issue and repository allowlist.

## Controlled action tools

The standard controlled action surface is:

- `run_quality_gate`
- `ensure_working_branch`
- `commit_verified_changes`
- `push_working_branch`
- `create_pull_request`
- `add_jira_comment`

These are requests to deterministic/trusted services. They do not grant Hermes direct provider credentials.

### Quality gates

`run_quality_gate` accepts a governed gate key, never an arbitrary shell command. The gate key resolves server-side to project-authoritative commands/configuration.

`commit_verified_changes` and `create_pull_request` must fail unless the trusted runtime records the required quality gates as passed or an accepted exception explicitly permits otherwise.

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

- Git writes;
- PR creation;
- Jira mutation other than an explicitly enabled diagnostic comment request.

### plan

Same mutation restrictions as `analyze`.

### implement

Read tools and controlled action tools may be available according to Effective Context and Control Plane permissions. Server-side checks remain mandatory for every call.

## Credentials

Hermes must not receive Jira/GitHub provider credentials or production secrets. The MCP server/Trusted Runner owns the minimum provider credentials required for approved tools.

A transport/service credential used only to authenticate Hermes to the MCP boundary must be scoped, rotatable and must not grant direct Jira/GitHub/production access.

## Tool filtering

Hermes configuration must include only the tool names registered in `ssot/mcp/ai-sdlc-tools.yaml`. New tools require governance review before they are enabled in the production Hermes profile.

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
