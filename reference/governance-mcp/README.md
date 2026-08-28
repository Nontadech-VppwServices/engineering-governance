# governance-mcp

The single deterministic service in the runtime. It is the MCP tool boundary
Hermes calls for every engineering and automation capability, and the only
component that holds provider credentials.

It replaces eight services that previously spoke REST to each other:
`ai-sdlc-orchestrator`, `context-resolver`, `workflow-control`,
`project-automation`, `hermes-governance`, `agent-runner`, `rpa-reporting` and
`ai-sdlc-mcp`.

## Why this exists at all

Hermes owns reasoning, orchestration, scheduling and formatting. This service
owns only what an LLM must not decide:

- **Credential custody** — Jira, GitHub and LINE tokens live here and nowhere
  else. Hermes authenticates with `GOVERNANCE_MCP_TOKEN`, which grants no direct
  provider access of its own.
- **Human approval** — `draft_action` / `confirm_action` with TTL, idempotency,
  role checks and a 1:1-confirmation rule. An `actor_type` of `human` can never
  be recorded for an AI or service actor.
- **Quality verification** — `commit_and_push` and `create_pull_request` are
  refused unless every required gate has a *recorded passing verdict*. The agent
  saying tests passed is not evidence.
- **Git authority** — only this service commits and pushes, only to the
  pre-approved working branch. Merge is never exposed as a tool.
- **Delivery guarantees** — a transactional outbox with retry, backoff and
  dead-lettering. Hermes decides when a report runs; this decides that it
  actually arrives.
- **Idempotency and redaction** — dedup keys and secret scrubbing applied before
  anything is persisted or returned.

## Execution scope

`ADR-GLOBAL-009` bound one MCP *server instance* to one job. This server is
long-lived and shared, so the binding moved to a **per-call signed job token**
(`ADR-GLOBAL-010`): `prepare_workspace` derives a scope from Effective Context,
mints an HMAC-signed token, and every scoped tool verifies it. Hermes carries the
token but can neither mint one nor widen the one it holds — editing the payload
invalidates the signature.

The scope validator hard-fails if `can_merge`, `can_deploy_production` or
`can_access_production_credentials` is anything but `false`.

## Tools

Read: `get_effective_context`, `list_ready_jira_issues`, `get_jira_issue`,
`search_repository`, `read_repository_file`, `get_job`, `get_plan`,
`get_action`, `get_pull_request_status`, `query_rpa_metrics`

Controlled action: `prepare_workspace`, `run_quality_gate`, `commit_and_push`,
`create_pull_request`, `add_jira_comment`, `sync_jira_state`, `create_job`,
`record_job_state`, `issue_principal`, `draft_action`, `confirm_action`,
`create_plan`, `record_observation`, `propose_skill_change`,
`ingest_rpa_event`, `send_line_message`

Never exposed: `merge_pull_request`, production deploy/rollback as a direct
tool, production secret retrieval, arbitrary shell, routing mutation, ADR/BDR
acceptance, human-approval mutation. Deployment and rollback are reachable only
as a *human-confirmed action* that dispatches a protected workflow registered in
`ssot/projects/`, and production still stops at GitHub Environment approval.

The production allowlist is `ssot/mcp/ai-sdlc-tools.yaml`.

## Quality gates

A gate key resolves server-side to a fixed command; arbitrary shell is never
accepted. Required gates come from the project archetype
(`aws-nextjs-typescript` requires `api` and `e2e`).

## Run

```
npm ci && npm run typecheck && npm test && npm run build
```

Health: `GET /healthz` — returns 503 `degraded` when the outbox worker stalls.
MCP: every other path, authenticated with `Authorization: Bearer $GOVERNANCE_MCP_TOKEN`.
