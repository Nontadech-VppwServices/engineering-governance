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

Hermes never receives the runner's GitHub/Jira provider credential and never owns merge or production deployment authority. The runner also rejects any request that grants merge, production-deploy or production-credential authority.

## AI SDLC MCP boundary

ADR-GLOBAL-009 adds a governed MCP capability facade for Hermes.

```text
Control Plane
   ↓ immutable job scope
Agent Runner
   ├── isolated workspace
   ├── trusted quality verdict
   └── provider credentials
          ↓
Hermes Execution Plane
          ↓ native MCP
AI SDLC MCP Server
          ↓
Agent Runner / Control Plane ports
          ↓
Context / Jira / repository / tests / controlled Git requests
```

The production Runner should create or broker a **job-scoped MCP execution session**. One Hermes execution must not be able to select another AI SDLC job, Jira issue, repository or working branch.

MCP write tools are capability requests back into the trusted boundary. Server-side checks must verify execution phase, repository allowlist, approved branch, Control Plane permissions and trusted quality verdict before any commit/push/PR action.

No MCP configuration may expose raw provider credentials, merge, production deploy, production secret retrieval or arbitrary control-plane shell access to Hermes.

## Hermes evidence

The runner uses Hermes Runs/API execution and records the returned run reference plus sanitized output as execution evidence. Analysis/plan output is persisted by the Control Plane as non-authoritative AI SDLC artifacts.

Hermes output can explain findings or plans, but it cannot grant approval, change routing, override Effective Context or replace independent quality-gate results.

MCP tool-call audit references should be retained alongside Hermes execution evidence when available.

See:

- `decisions/adr/global/ADR-GLOBAL-008-hermes-execution-plane.md`
- `decisions/adr/global/ADR-GLOBAL-009-ai-sdlc-mcp-tool-boundary.md`
- `policies/hermes-execution-plane.md`
- `policies/ai-sdlc-mcp.md`
- `ssot/mcp/ai-sdlc-tools.yaml`
- `reference/ai-sdlc-mcp/`
- `hermes/skills/ai-sdlc-execution/SKILL.md`
