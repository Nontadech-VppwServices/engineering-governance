# Isolated Agent Runner

The Agent Runner is the trusted capability boundary between the deterministic AI SDLC Control Plane and the Hermes Execution Plane.

## Execution phases

The same versioned execution contract supports:

```text
analyze   → read-only Hermes repository investigation
plan      → read-only Hermes implementation/test planning
implement → Hermes file editing followed by trusted verification
```

For `analyze` and `plan`, the runner clones the governed base branch, invokes the internal Hermes Coder/Execution Plane profile and independently verifies that no repository files changed. Any detected change blocks the result.

For `implement`, the runner:

1. clones the AI working branch into a job-specific workspace;
2. asks Hermes to edit only that workspace;
3. independently detects changed files;
4. independently runs repository quality scripts;
5. verifies base-branch ancestry;
6. commits and pushes only after required runner-side checks pass.

Hermes never receives the runner's GitHub credential and never commits, pushes, merges or deploys. The runner also rejects any request that grants merge, production-deploy or production-credential authority.

## Hermes evidence

The runner uses Hermes Runs API and records the returned `run_id` plus sanitized terminal `output` as execution evidence. Analysis/plan output is persisted by the Control Plane as non-authoritative AI SDLC artifacts.

Hermes output can explain findings or plans, but it cannot grant approval, change routing, override Effective Context or replace independent quality-gate results.

See:

- `decisions/adr/global/ADR-GLOBAL-008-hermes-execution-plane.md`
- `policies/hermes-execution-plane.md`
- `hermes/skills/ai-sdlc-execution/SKILL.md`
