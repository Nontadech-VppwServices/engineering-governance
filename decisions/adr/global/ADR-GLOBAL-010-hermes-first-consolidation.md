---
id: ADR-GLOBAL-010
title: Hermes-first runtime consolidation
status: accepted
scope: global
domain: engineering
date: 2026-08-28
owners:
  - engineering
supersedes_partially:
  - ADR-GLOBAL-008
amends:
  - ADR-GLOBAL-009
related_adr:
  - ADR-GLOBAL-004
  - ADR-GLOBAL-005
  - ADR-GLOBAL-006
  - ADR-GLOBAL-007
  - ADR-GLOBAL-008
  - ADR-GLOBAL-009
---

# Context

ADR-GLOBAL-008 established Hermes as the execution plane and ADR-GLOBAL-009 established MCP as the integration surface. The running system did not follow either decision.

At the time of this ADR the runtime was twelve containers and roughly 213 KB of hand-written TypeScript across eight services, and:

- `reference/ai-sdlc-mcp/` — the tool boundary ADR-GLOBAL-009 mandates — had no Dockerfile and no entry in `compose.yaml`. It was an interface with no adapters and was never deployed.
- `hermes/config.yaml` had no `mcp_servers` section, so Hermes could not call a governed tool at all.
- The `ai-sdlc-execution` skill was not mounted into the container, despite policy directing Hermes to use it.
- `reference/agent-runner/src/runner.ts` did not compile: it called six helper functions that existed in no source file.
- `project-automation/src/scaffolds.ts` was 82 lines of file content embedded as TypeScript string literals.
- `rpa-reporting/src/worker.ts` reimplemented cron by formatting `Intl.DateTimeFormat` output and comparing wall-clock strings.
- Redis and BullMQ existed to queue work that Hermes already serialises with `max_concurrent_runs`.

The deterministic control plane had grown to cover work that is not deterministic in nature — sequencing, formatting, templating, scheduling — while the parts that genuinely require determinism were spread across eight services, each with its own HTTP server, bearer token and database schema.

# Decision

Consolidate the runtime to **four long-running services**: `caddy`, `postgres`, `hermes`, and one deterministic boundary, `governance-mcp`.

```text
LINE ──► caddy ──► hermes  (execution plane)
                    │  reasoning, orchestration, scheduling, formatting
                    │  skills + memory + cron
                    │
                    │  MCP — carries no provider credential
                    ▼
              governance-mcp  (deterministic boundary)
                    │  credential custody
                    │  human approval
                    │  quality verdicts
                    │  Git authority
                    │  delivery guarantees
                    ▼
                 postgres
```

## The dividing line

A responsibility stays in code when an incorrect result would be unrecoverable, unauditable, or a security failure — and moves to Hermes otherwise.

Stays deterministic in `governance-mcp`:

- provider credentials (Jira, GitHub, LINE push) and the workspace Git credential;
- human approval: draft/confirm with TTL, idempotency, role checks, and the 1:1-confirmation rule;
- quality-gate execution and the recorded verdict that gates commit, push and PR;
- Git commit and push, only to the pre-approved working branch;
- job state transitions, validated against the state machine;
- Effective Context resolution, routing and conflict decisions;
- delivery: transactional outbox with retry, backoff and dead-lettering;
- idempotency keys, dedup windows and secret redaction.

Moves to Hermes:

- the order in which steps run, and the decision about which permitted tool to call;
- analysis, planning and implementation;
- scheduling, through native Hermes cron;
- report rendering, PR descriptions, Jira comment prose;
- project scaffolding, written into the workspace from the registered archetype.

## Consequences for ADR-GLOBAL-008

The "AI SDLC CONTROL PLANE" block in ADR-GLOBAL-008 no longer exists as a service. Its authoritative responsibilities are preserved in `governance-mcp`; its sequencing responsibilities move into Hermes skills. The Trusted Agent Runner is removed: workspace isolation is now per-job directories under a shared volume, and the independent verification it provided is now the server-side recorded-verdict rule.

The two-plane separation ADR-GLOBAL-008 established is unchanged and is now actually implemented.

## Amendment to ADR-GLOBAL-009: scope binding

ADR-GLOBAL-009 required each MCP server instance to be bound to one immutable execution scope. A single long-lived shared server cannot satisfy that as written.

Scope binding therefore moves from the *server instance* to a **per-call signed job token**. `prepare_workspace` derives the scope from Effective Context, mints an HMAC-signed token, and every scoped tool verifies the signature before acting.

**This is a real weakening of the boundary and is recorded as such.** Under the original rule, a scope could not be confused across jobs because the process itself was per-job. Under this rule, the isolation is cryptographic rather than physical, so a signing-key compromise or a token-verification defect would be a cross-job escalation where previously it would not.

Mitigations:

- the token is minted only by `governance-mcp`, never by a caller;
- the payload is signed, so editing the repository allowlist, phase or permissions invalidates it;
- `validateScope` re-runs on every verification and hard-fails if `can_merge`, `can_deploy_production` or `can_access_production_credentials` is anything but `false`;
- `JOB_TOKEN_SIGNING_SECRET` is separate from every other secret and independently rotatable;
- every tool call is recorded in `mcp_tool_audit` with its job, tool, scope and allow/deny result.

The forbidden-tool list in ADR-GLOBAL-009 is unchanged and remains absolute.

# Consequences

- Eight services become one; 213 KB of source becomes 110 KB, in readable rather than minified form.
- Twelve containers become four. Redis, BullMQ and all inter-service HTTP authentication disappear.
- Hermes holds no provider credential. `GOVERNANCE_MCP_TOKEN` authenticates it to the boundary and grants nothing else.
- Quality enforcement strengthens: commit, push and PR now require a *recorded* verdict rather than a result object the agent supplied.
- Orchestration sequencing becomes less reproducible than a durable queue. Every state transition is still validated server-side, so an incorrect sequence is rejected rather than silently executed, but a job can now stall mid-sequence in a way BullMQ would have retried. The scheduled intake sweep re-examines open jobs, which bounds but does not eliminate this.
- Scheduling reliability now depends on Hermes cron rather than on a service the team wrote. Delivery reliability does not.
- Adding a capability is a skill plus, where an external system is involved, one tool — not a new service.

# References

- `policies/hermes-execution-plane.md`
- `policies/ai-sdlc-mcp.md`
- `policies/hermes-scheduling-governance.md`
- `ssot/mcp/ai-sdlc-tools.yaml`
- `schemas/ai-sdlc-mcp-scope.schema.json`
- `reference/governance-mcp/`
