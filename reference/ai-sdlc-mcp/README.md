# AI SDLC MCP Tool Boundary

This package is the governed MCP capability facade between the Hermes Execution Plane and deterministic/trusted AI SDLC services.

## Why it exists

Hermes should reason, choose procedures and use tools without owning provider-specific Jira/GitHub integrations or credentials. The MCP boundary centralizes those integrations and enforces Control Plane scope on every tool call.

```text
Control Plane / Effective Context
        ↓ immutable execution scope
Trusted Agent Runner
        ↓
Hermes
        ↓ native MCP client
AI SDLC MCP Server
        ↓
trusted adapters → Jira / GitHub / repository / quality gates
```

## MCP SDK

The reference uses the MCP TypeScript SDK v2 package `@modelcontextprotocol/server`.

## Tool surface

Read:

- `get_effective_context`
- `get_jira_issue`
- `search_repository`
- `read_repository_file`

Controlled actions:

- `run_quality_gate`
- `ensure_working_branch`
- `commit_verified_changes`
- `push_working_branch`
- `create_pull_request`
- `add_jira_comment`

There is deliberately no merge, production-deploy or production-secret tool.

## Security model

`createAiSdlcMcpServer(scope, ports)` creates a server around one immutable execution scope. The model cannot select a different job scope.

The server verifies:

- repository belongs to the Effective Context allowlist;
- write operation occurs only during `implement`;
- code modification/PR permission is granted by the Control Plane;
- branch is the exact pre-approved working branch;
- trusted quality verification passed before commit/push/PR creation;
- repository paths cannot escape the repository root;
- Jira comments are scoped/sanitized.

Provider credentials remain behind `AiSdlcMcpPorts` implementations. Hermes never receives GitHub/Jira/production provider credentials.

## Hermes deployment

Hermes has a native MCP client. The `hermes-coder` profile should connect only to the job-scoped AI SDLC MCP endpoint/process and should filter tools to the names registered in `ssot/mcp/ai-sdlc-tools.yaml`.

The production transport may be a runner-managed stdio server or a job-scoped authenticated HTTP MCP endpoint. Runtime activation must prove that one Hermes execution cannot use another job's scope.

## Validation

```bash
npm install
npm run typecheck
npm test
```
