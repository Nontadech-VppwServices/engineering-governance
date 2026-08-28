---
id: ADR-GLOBAL-011
title: Direct Hermes provider MCP connectivity
status: proposed
scope: global
domain: engineering
date: 2026-08-28
owners:
  - engineering
amends:
  - ADR-GLOBAL-009
  - ADR-GLOBAL-010
---

# Context

Hermes already uses its native MCP client, but the deployed configuration names `governance-mcp` as the only provider boundary. This adds an unnecessary compatibility hop when an approved provider-facing MCP connector is available and makes the intended integration model unclear.

The target model is for Hermes to connect directly through approved MCP connectors for Jira/Atlassian, Git and LINE. Direct connectivity must not mean direct REST calls, arbitrary shell access, unrestricted credentials, or bypassing job scope and approval rules.

# Decision

Make direct provider-facing Hermes MCP the primary integration path:

```text
Hermes native MCP client
        |
        +--> Jira/Atlassian MCP connector
        +--> Git MCP connector
        +--> LINE MCP connector
        |
        +--> scoped job token / Effective Context / audit
```

Each connector must:

- expose only tools listed in `ssot/mcp/ai-sdlc-tools.yaml`;
- enforce the current job, issue, repository, branch, phase and permission scope server-side;
- use isolated runtime secret handling for the minimum provider credential;
- redact credentials from prompts, tool results, workspaces and audit events;
- enforce idempotency, approval and trusted quality verdicts for mutations;
- record an allow/deny decision and sanitized evidence reference for every call.

`governance-mcp` remains a compatibility boundary while direct connectors are introduced. It must not be treated as an additional mandatory hop once a direct connector is active. No provider connector may expose merge, production deployment, production-secret retrieval, governance acceptance, human-approval mutation or arbitrary control-plane shell execution.

# Migration

1. Register direct connectors and their scoped transport credentials without changing the SSOT tool contract.
2. Run Jira, Git and LINE reads in shadow mode and compare audit evidence with the compatibility path.
3. Enable mutations one capability at a time after negative scope, approval, idempotency and credential-redaction tests pass.
4. Switch `HERMES_PROVIDER_MCP_URL` and token references to the direct connector endpoint.
5. Retain a rollback value pointing to `governance-mcp` until operational evidence and audit retention requirements are met.
6. Remove compatibility provider credentials only after all scheduled jobs and active executions have drained.

# Consequences

Hermes gets a simpler, direct MCP integration model and provider-specific connectors can evolve independently. The connector layer now owns more operational boundaries, so each connector requires health monitoring, credential rotation, audit retention and contract tests. The direct path does not relax the two-plane separation: the model selects permitted tools, while the provider MCP boundary authorizes and executes them.

# References

- `policies/hermes-execution-plane.md`
- `policies/ai-sdlc-mcp.md`
- `policies/hermes-scheduling-governance.md`
- `ssot/mcp/ai-sdlc-tools.yaml`
- `hermes/config.yaml`
