# Hermes Execution Plane Policy

## Purpose

Define the boundary between deterministic AI SDLC control and Hermes agent reasoning/execution.

## Architecture rule

Hermes is the execution plane for engineering and automation work. It owns reasoning, orchestration sequencing, scheduling and formatting. The `governance-mcp` boundary owns what must not depend on model behaviour: provider credentials, human approval, quality verdicts, Git authority, job-state validation and delivery guarantees.

```text
Hermes
  ↓ native MCP client, no provider credential
governance-mcp
  ↓ server-side job/repository/phase authorization
Jira / GitHub / Context / approved quality gates / LINE outbox
```

MCP is the integration surface, not a transfer of authority. A tool call is a request to the boundary; the boundary decides.

## Hermes-first precedence

For any engineering or automation capability, first determine whether an approved Hermes skill and its governed tools can perform the work safely and reliably. When they can, Hermes is the required execution entry point. Do not add a service for work that is sequencing, formatting, templating or scheduling.

A capability stays deterministic only when an incorrect result would be unrecoverable, unauditable, or a security failure. That test is what keeps credential custody, approval, quality verdicts, Git writes, idempotency and delivery in `governance-mcp`.

A direct non-Hermes execution path beyond that boundary requires a documented exception recording its rationale, owner, bounded scope, and review date. An exception never grants Hermes provider credentials.

Scheduled work follows `policies/hermes-scheduling-governance.md`. Hermes cron owns timing and the execution decision; the boundary retains idempotency, retry, delivery and audit persistence.

## Execution scope

Each execution is bound to a per-call HMAC-signed job token minted by `governance-mcp` in `prepare_workspace` and derived from Effective Context. Hermes carries the token and cannot mint one or widen the one it holds. See ADR-GLOBAL-010 for the trade-off this replaced and its mitigations.

## Execution phases

### analyze

- Repository access is read-only from the execution contract perspective.
- Hermes inspects only the assigned repository/workspace and supplied Effective Context.
- Output should identify findings, likely root cause/impact, evidence, uncertainties and recommended next action.
- No repository change may survive the run.
- Any detected file modification is a contract violation and blocks the execution result.
- Tool usage is limited to read/scoped inspection capabilities allowed by `policies/ai-sdlc-mcp.md`. Git write tools are refused by execution phase, server-side.

### plan

- Repository access is read-only.
- Output should describe implementation steps, likely files/areas, tests, risks, dependencies and unresolved questions.
- The plan is an AI artifact and does not itself represent human approval.
- New Module/New Project work still requires the applicable human approval gate.
- Any detected file modification is a contract violation.
- MCP mutation tools remain denied.

### implement

- Hermes may modify files only inside the assigned isolated workspace.
- Hermes may not directly own provider credentials, merge or deploy.
- Hermes may not change repository routing or operate on a different repository.
- The trusted runner independently evaluates required quality gates after Hermes returns.
- Only verified changes may be committed/pushed by the trusted boundary.
- If controlled Git/Jira actions are exposed through MCP, the MCP server must enforce the immutable job scope, approved branch and trusted quality verdict before performing them.

## MCP tools

Hermes should discover only the governed tools registered in `ssot/mcp/ai-sdlc-tools.yaml`.

The standard capability classes are:

- Effective Context / Jira issue read;
- repository search/read;
- named policy-approved quality gates;
- controlled branch/commit/push/PR requests;
- scoped sanitized Jira comments.

No MCP server used by Hermes may expose merge, production deployment, production-secret retrieval, arbitrary control-plane shell execution, governance acceptance or human-approval mutation.

## Credentials

Hermes execution containers must not receive:

- Jira API credentials;
- GitHub provider write tokens;
- production infrastructure credentials;
- production secrets;
- unrestricted secret-store credentials.

`governance-mcp` holds the minimum provider credential necessary for controlled operations. It must never expose that credential in a tool result, prompt, Effective Context, skill, or any file inside a workspace Hermes can read — including Git remote configuration.

A scoped MCP transport credential is permitted only to authenticate Hermes to the governed tool boundary; it must not itself grant direct provider or production access.

## Effective Context

Every execution request must carry or reference current Effective Context. Hermes must not replace it with memory, generated summaries or assumptions.

If Hermes discovers evidence that conflicts with routing/governance, it reports the conflict; it does not silently switch repositories or override policy.

## Skills

The built-in `ai-sdlc-execution` skill defines the standard Analyze/Plan/Implement procedure. Reusable domain procedures may be separate governed skills.

Generated skills follow ADR-GLOBAL-007 and are never authoritative. A generated skill cannot relax constraints in this policy or `policies/ai-sdlc-mcp.md`.

## Result evidence

Execution results should preserve:

- execution phase;
- Hermes run ID when available;
- sanitized Hermes output/artifact;
- changed-file list;
- independently verified quality-gate results for implementation;
- MCP audit/evidence references when MCP tools were used;
- blocking reason when applicable.

Hermes output must be treated as untrusted model output for authorization purposes even when the run succeeds.

## Hard boundaries

Hermes may not:

- accept ADR/BDR/governance decisions;
- mark human approval as granted;
- change authoritative repository routing;
- merge pull requests;
- dispatch or perform production deployment directly;
- access production credentials;
- bypass a failed/missing quality gate;
- treat memory as SSOT;
- bypass MCP server-side scope/permission checks.
