# Hermes Execution Plane Policy

## Purpose

Define the boundary between deterministic AI SDLC control and Hermes agent reasoning/execution.

## Architecture rule

Hermes is the default AI execution plane for engineering work. It performs reasoning-oriented work through a versioned execution contract, while deterministic services retain source-of-truth, authorization, lifecycle and Git/deployment control.

```text
Control Plane → Trusted Agent Runner → Hermes Execution Plane
              ← verified evidence  ← reasoning / file edits
```

For external engineering capabilities, Hermes should use the governed **AI SDLC MCP Tool Boundary** defined by ADR-GLOBAL-009 instead of owning provider-specific Jira/GitHub integrations.

```text
Hermes
  ↓ native MCP client
AI SDLC MCP Tool Boundary
  ↓ server-side job/repository/phase authorization
Control Plane / Trusted Runner adapters
  ↓
Jira / GitHub / Context / approved quality gates
```

MCP reduces integration complexity; it does not transfer authority from the Control Plane or Trusted Agent Runner to Hermes.

## Execution phases

### analyze

- Repository access is read-only from the execution contract perspective.
- Hermes inspects only the assigned repository/workspace and supplied Effective Context.
- Output should identify findings, likely root cause/impact, evidence, uncertainties and recommended next action.
- No repository change may survive the run.
- Any detected file modification is a contract violation and blocks the execution result.
- MCP usage is limited to read/scoped inspection capabilities allowed by `policies/ai-sdlc-mcp.md`.

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

The trusted Agent Runner / AI SDLC MCP server may receive the minimum provider credential necessary for controlled operations, but must not expose that credential in the Hermes run request, prompt, Effective Context, skill or workspace files.

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
