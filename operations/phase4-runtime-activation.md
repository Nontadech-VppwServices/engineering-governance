# Phase 4 Runtime Activation Checklist

Phase 4 implementation can be complete before the production AI SDLC runtime is activated. This checklist controls activation against live Jira/GitHub projects.

## Status model

- **Implementation COMPLETE**: governance, contracts, reference orchestration, adapters and CI tests are complete.
- **Runtime NOT ACTIVE**: the orchestrator is not yet deployed/configured against live Jira/GitHub/Agent infrastructure.
- **Runtime ACTIVE**: all required infrastructure, credentials, webhooks and smoke tests below have been approved and verified.

Do not describe Phase 4 as production-operational until Runtime ACTIVE criteria are met.

## Infrastructure

- [ ] Deploy the Phase 3 Context Resolver behind an internal authenticated endpoint.
- [ ] Provision Redis for BullMQ.
- [ ] Provision PostgreSQL for durable AI SDLC job state.
- [ ] Apply `reference/ai-sdlc-orchestrator/sql/001_ai_sdlc_jobs.sql`.
- [ ] Deploy the Phase 4 orchestrator/worker with controlled network access.
- [ ] Configure centralized application logs and retention.
- [ ] Configure health/availability monitoring for orchestrator, worker, Redis, PostgreSQL and Context Resolver.

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
- [ ] Grant only repository permissions required for branch creation, contents updates and PR creation.
- [ ] Do not grant production deployment credentials to the Agent Runner.
- [ ] Configure GitHub `pull_request` webhook delivery to `POST /webhooks/github`.
- [ ] Configure and verify `X-Hub-Signature-256` webhook signing secret.
- [ ] Verify protected production branches/environments still require human/policy-controlled merge/deployment.

## Agent Runner

- [ ] Choose the initial Agent Runner implementation/provider.
- [ ] Expose the versioned `AgentExecutionRequest` / `AgentExecutionResult` contract.
- [ ] Run each job in an isolated controlled workspace.
- [ ] Prevent access to production credentials.
- [ ] Allow only repositories returned by Effective Context.
- [ ] Ensure commits are pushed only to the AI-owned working branch.
- [ ] Return complete quality-gate evidence to the orchestrator.

## Quality gates

AWS website/application:

- [ ] API tests execute and are reported.
- [ ] E2E tests execute and are reported.
- [ ] Required failures block PR creation.

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
5. Verify AI branch naming contains the Jira key.
6. Verify Agent Runner cannot merge or deploy production.
7. Verify required tests execute.
8. Verify PR is created with Jira key, job ID and quality-gate evidence.
9. Verify Jira receives progress comments/status movement when available.
10. Human-merges the test PR.
11. Verify GitHub webhook updates the job to DONE only after every required PR is merged.
12. Verify Jira completion synchronization.

## Activation approval

Runtime activation is a human operational decision. Record:

```text
Activated by:
Activated at:
Environment:
Jira projects enabled:
GitHub organizations enabled:
Agent Runner:
Context Resolver version:
Orchestrator version/commit:
Smoke-test Jira key:
```

Production deployment remains outside AI authority after activation.
