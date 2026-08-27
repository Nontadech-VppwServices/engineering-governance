# Hermes Execution Plane Policy

## Purpose

Define the boundary between deterministic AI SDLC control and Hermes agent reasoning/execution.

## Architecture rule

Hermes is the default AI execution plane for engineering work. It performs reasoning-oriented work through a versioned execution contract, while deterministic services retain source-of-truth, authorization, lifecycle and Git/deployment control.

```text
Control Plane → Trusted Agent Runner → Hermes Execution Plane
              ← verified evidence  ← reasoning / file edits
```

## Execution phases

### analyze

- Repository access is read-only from the execution contract perspective.
- Hermes inspects only the assigned repository/workspace and supplied Effective Context.
- Output should identify findings, likely root cause/impact, evidence, uncertainties and recommended next action.
- No repository change may survive the run.
- Any detected file modification is a contract violation and blocks the execution result.

### plan

- Repository access is read-only.
- Output should describe implementation steps, likely files/areas, tests, risks, dependencies and unresolved questions.
- The plan is an AI artifact and does not itself represent human approval.
- New Module/New Project work still requires the applicable human approval gate.
- Any detected file modification is a contract violation.

### implement

- Hermes may modify files only inside the assigned isolated workspace.
- Hermes may not commit, push, merge or deploy.
- Hermes may not change repository routing or operate on a different repository.
- The trusted runner independently evaluates required quality gates after Hermes returns.
- Only verified changes may be committed/pushed by the runner.

## Credentials

Hermes execution containers must not receive:

- Jira API credentials;
- GitHub write tokens;
- production infrastructure credentials;
- production secrets;
- unrestricted secret-store credentials.

The trusted Agent Runner may receive the minimum Git credential necessary for controlled clone/push operations, but must not expose that credential in the Hermes run request, prompt, Effective Context or workspace files.

## Effective Context

Every execution request must carry or reference current Effective Context. Hermes must not replace it with memory, generated summaries or assumptions.

If Hermes discovers evidence that conflicts with routing/governance, it reports the conflict; it does not silently switch repositories or override policy.

## Skills

The built-in `ai-sdlc-execution` skill defines the standard Analyze/Plan/Implement procedure. Reusable domain procedures may be separate governed skills.

Generated skills follow ADR-GLOBAL-007 and are never authoritative. A generated skill cannot relax constraints in this policy.

## Result evidence

Execution results should preserve:

- execution phase;
- Hermes run ID when available;
- sanitized Hermes output/artifact;
- changed-file list;
- independently verified quality-gate results for implementation;
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
- treat memory as SSOT.
