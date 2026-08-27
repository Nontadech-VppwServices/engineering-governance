# Phase 4 Runtime Activation Checklist

Phase 4 implementation can be complete before the production AI SDLC runtime is activated. This checklist controls activation against live Jira/GitHub projects.

## Status model

- **Implementation COMPLETE**: governance, contracts, reference orchestration, Hermes Execution Plane alignment, MCP capability boundary, adapters and CI tests are complete.
- **Runtime NOT ACTIVE**: the orchestrator/Hermes/MCP runtime is not yet deployed/configured against live Jira/GitHub infrastructure.
- **Runtime ACTIVE**: all required infrastructure, credentials, webhooks, Hermes/MCP controls and smoke tests below have been approved and verified.

Do not describe Phase 4 as production-operational until Runtime ACTIVE criteria are met.

## Infrastructure

- [ ] Deploy the Phase 3 Context Resolver behind an internal authenticated endpoint.
- [ ] Provision Redis for BullMQ.
- [ ] Provision PostgreSQL for durable AI SDLC job state.
- [ ] Apply `reference/ai-sdlc-orchestrator/sql/001_ai_sdlc_jobs.sql`.
- [ ] Deploy the Phase 4 orchestrator/worker with controlled network access.
- [ ] Deploy/configure the Trusted Agent Runner.
- [ ] Deploy/configure the Hermes Coder/Execution Plane profile.
- [ ] Deploy or runner-manage the AI SDLC MCP server from `reference/ai-sdlc-mcp/`.
- [ ] Configure centralized application logs and retention.
- [ ] Configure health/availability monitoring for orchestrator, worker, Redis, PostgreSQL, Context Resolver, Agent Runner, Hermes and MCP boundary.

## Jira

- [ ] Create/identify the dedicated AI SDLC Jira assignee account.
- [ ] Record its Jira account ID in the runtime secret/config system.
- [ ] Configure Jira webhook delivery to `POST /webhooks/jira`.
- [ ] Configure the AI SDLC webhook shared secret.
- [ ] Configure allowed Jira project keys.
- [ ] Configure the `AI Work Type` custom field ID if used.
- [ ] Configure the RPA Component custom field ID or verify use of Jira native Components.
- [ ] Verify RPA dropdown values match `ssot/jira-routing/RPA.yaml`.
- [ ] Load project status destinations from `ssot/jira-workflows/phase4-status-mapping.yaml`.
- [ ] Verify unresolved TMS/VESPISTI status mappings before relying on automatic status movement.

## GitHub

- [ ] Use a company GitHub App / installation token rather than a personal token.
- [ ] Grant only repository permissions required for controlled branch/contents/PR operations.
- [ ] Keep the GitHub provider credential behind the Trusted Agent Runner / MCP adapter boundary; do not expose it to Hermes prompts, skills or workspaces.
- [ ] Do not grant production deployment credentials to Hermes, the Agent Runner or the MCP engineering surface.
- [ ] Configure GitHub `pull_request` webhook delivery to `POST /webhooks/github`.
- [ ] Configure and verify `X-Hub-Signature-256` webhook signing secret.
- [ ] Verify protected production branches/environments still require human/policy-controlled merge/deployment.

## Hermes Execution Plane

- [ ] Use the governed `ai-sdlc-execution` skill.
- [ ] Configure Hermes native MCP support for the AI SDLC MCP server.
- [ ] Restrict Hermes MCP tool discovery to names in `ssot/mcp/ai-sdlc-tools.yaml`.
- [ ] Ensure Hermes has no Jira/GitHub provider credential and no production credential.
- [ ] Verify Analyze and Plan remain read-only.
- [ ] Verify Implement can change only the assigned workspace/repository.
- [ ] Verify Hermes cannot bypass an MCP deny result by changing repository/job/branch scope.

## AI SDLC MCP boundary

- [ ] Bind each Hermes engineering execution to one immutable MCP execution scope defined by `schemas/ai-sdlc-mcp-scope.schema.json`.
- [ ] Prove one execution cannot access another job's Jira issue, repositories or working branches.
- [ ] Verify `search_repository` / `read_repository_file` reject repositories outside Effective Context routing.
- [ ] Verify repository path traversal is rejected.
- [ ] Verify `run_quality_gate` accepts only named governed gate keys, never arbitrary shell commands.
- [ ] Verify Git write requests are denied during Analyze/Plan.
- [ ] Verify commit/push/PR requests use only the pre-approved working branch.
- [ ] Verify trusted quality verdict is required before commit/push/PR action.
- [ ] Verify `create_pull_request` also requires Control Plane `can_create_pr=true`.
- [ ] Verify Jira comment tool can target only the scoped Jira issue and rejects secret-like content.
- [ ] Verify the MCP server exposes no merge, production deploy, production secret, arbitrary control-plane shell, routing mutation, ADR/BDR acceptance or human-approval tools.
- [ ] Record/audit tool name, scope, allow/deny decision and sanitized evidence reference.

## Agent Runner

- [ ] Expose the versioned `AgentExecutionRequest` / `AgentExecutionResult` contract.
- [ ] Run each job in an isolated controlled workspace.
- [ ] Prevent access to production credentials.
- [ ] Allow only repositories returned by Effective Context.
- [ ] Broker the job-scoped MCP execution session/transport for Hermes.
- [ ] Ensure commits are pushed only to the AI-owned working branch after trusted verification.
- [ ] Return complete quality-gate and MCP evidence to the orchestrator.

## Quality gates

AWS website/application:

- [ ] API tests execute and are reported.
- [ ] E2E tests execute and are reported.
- [ ] Required failures block commit/PR creation.

RPA:

- [ ] Type/static checks execute where applicable.
- [ ] Workflow/regression tests execute where applicable.
- [ ] Idempotency/retry behavior is verified for state-changing automations.
- [ ] Docker/build/smoke verification executes where applicable.

## Smoke-test sequence

Use a dedicated non-production Jira card and non-production repository path first.

1. Assign the Jira issue to the configured AI SDLC assignee.
2. Verify exactly one intake event is persisted/enqueued.
3. Verify Effective Context resolves the expected repository/repositories.
4. For RPA, verify Component → repository routing exactly matches SSOT.
5. Verify the Agent Runner creates/brokers a job-scoped MCP execution scope.
6. Ask Hermes to inspect an allowed repository and verify MCP access succeeds.
7. Ask/test an out-of-scope repository call and verify MCP rejects it.
8. Verify AI branch naming contains the Jira key.
9. Verify Hermes cannot merge, deploy production or retrieve production credentials.
10. Verify required trusted tests execute.
11. Verify PR is created with Jira key, job ID, quality-gate evidence and Hermes/MCP audit references.
12. Verify Jira receives progress comments/status movement when available.
13. Human-merges the test PR.
14. Verify GitHub webhook updates the job to DONE only after every required PR is merged.
15. Verify Jira completion synchronization.

## Activation approval

Runtime activation is a human operational decision. Record:

```text
Activated by:
Activated at:
Environment:
Jira projects enabled:
GitHub organizations enabled:
Hermes profile/version:
AI SDLC MCP version/commit:
Agent Runner version/commit:
Context Resolver version/commit:
Orchestrator version/commit:
Smoke-test Jira key:
```

Production deployment remains outside AI authority after activation.
