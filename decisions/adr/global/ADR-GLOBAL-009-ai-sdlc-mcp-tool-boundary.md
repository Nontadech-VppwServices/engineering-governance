---
id: ADR-GLOBAL-009
title: AI SDLC MCP tool boundary for Hermes execution
status: accepted
scope: global
domain: engineering
date: 2026-08-27
owners:
  - engineering
related_adr:
  - ADR-GLOBAL-004
  - ADR-GLOBAL-005
  - ADR-GLOBAL-008
---

# Context

ADR-GLOBAL-008 establishes Hermes as the governed AI execution plane while the deterministic AI SDLC Control Plane and Trusted Agent Runner retain lifecycle, authorization, Git, quality-gate and production boundaries.

Hermes still needs a consistent way to consume approved engineering capabilities such as Effective Context, Jira facts, repository search/read, test execution and controlled Git/Jira requests. Implementing those integrations separately as Hermes-native tools would duplicate provider-specific logic and couple Hermes to Jira/GitHub/runtime details.

# Decision

Adopt an **AI SDLC MCP Tool Boundary** as the preferred integration surface exposed to Hermes.

```text
Jira / GitHub events
        ↓
AI SDLC Control Plane
  ├── intake / idempotency
  ├── durable job state
  ├── Effective Context / routing
  ├── approvals / authorization
  └── audit / production boundaries
        ↓ governed execution scope
Trusted Agent Runner
        ↓
Hermes Execution Plane
        ↓ MCP
AI SDLC MCP Tool Boundary
  ├── Effective Context read
  ├── Jira issue read / scoped comment request
  ├── repository search / read
  ├── approved quality-gate execution
  └── controlled Git/PR requests
        ↓
Control Plane / Trusted Runner adapters
        ↓
Jira / GitHub / tests / workspace
```

The MCP server is a capability facade, not a new source of truth. Tool calls are evaluated against an immutable job-scoped execution scope supplied by the trusted runtime.

## Job-scoped server rule

Each MCP server instance/session used for engineering execution must be scoped to one AI SDLC execution context containing at minimum:

- AI SDLC job ID;
- Jira issue key;
- execution phase (`analyze`, `plan`, `implement`);
- allowed repository set;
- approved working branch per repository when applicable;
- Effective Context snapshot/reference;
- permission decisions from the Control Plane.

Tool callers must not be able to select an arbitrary different job or repository outside that scope.

## Approved tool classes

Read tools:

- `get_effective_context`;
- `get_jira_issue`;
- `search_repository`;
- `read_repository_file`.

Controlled action tools:

- `run_quality_gate` — executes only a named, policy-approved gate; no arbitrary shell command;
- `ensure_working_branch` — only the pre-approved branch/repository;
- `commit_verified_changes` — only after independent trusted quality verification;
- `push_working_branch` — only the pre-approved working branch;
- `create_pull_request` — only when Effective Context/Control Plane permits PR creation;
- `add_jira_comment` — only the scoped Jira issue and sanitized content.

Controlled action tools represent requests to deterministic/trusted components. They do not transfer Git/Jira credentials or authority to Hermes.

## Forbidden tools

The MCP surface must never expose:

- `merge_pull_request`;
- direct production deployment;
- production credential/secret retrieval;
- arbitrary shell execution on control-plane infrastructure;
- arbitrary repository routing changes;
- ADR/BDR acceptance;
- human approval mutation.

## Hermes configuration

Hermes should use its native MCP client to discover the AI SDLC MCP server and filter the server to the governed tool set. Hermes may use skills/memory to decide **which permitted tool to call**, but server-side authorization decides whether the call is allowed.

## Provider independence

The MCP boundary is intentionally independent from Hermes. Another MCP-capable agent may consume the same governed surface in the future without duplicating Jira/GitHub integrations or changing authority rules.

# Consequences

- Hermes becomes simpler: reasoning, skills, memory and tool selection stay in Hermes while provider integrations are centralized.
- Jira/GitHub credentials stay outside model prompts and Hermes skills.
- Security policy is enforced server-side rather than relying on prompt compliance.
- Repository/tool routing is reusable across Hermes, Codex/Claude-compatible MCP clients or future agents.
- The Trusted Agent Runner remains necessary for isolated workspace and independent quality/Git verification; MCP reduces integration complexity rather than replacing deterministic control.

# References

- `policies/hermes-execution-plane.md`
- `policies/ai-sdlc-mcp.md`
- `ssot/mcp/ai-sdlc-tools.yaml`
- `schemas/ai-sdlc-mcp-scope.schema.json`
- `reference/ai-sdlc-mcp/`
