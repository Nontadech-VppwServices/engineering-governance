# AI SDLC Orchestrator — Phase 4 Reference

This package implements the controlled Jira → AI → Git → PR workflow defined by `ADR-GLOBAL-005`.

## Runtime architecture

```text
Native Jira webhook / normalized intake event
  ↓
Assignee + project filter
  ↓
Intake validation + idempotency
  ↓
QueuePort
  ├─ InMemoryQueue (tests)
  └─ BullMQQueue (production pattern)
  ↓
JobStore
  ├─ InMemoryJobStore (tests)
  └─ PostgresJobStore (production pattern)
  ↓
ContextResolverPort
  ↓
AgentRunnerPort
  ↓
Quality-gate evaluation
  ↓
GitHostPort
  ↓
Pull Request(s)
  ↓
JiraSyncPort
  ↓
GitHub pull_request webhook
  ↓
DONE after all required PRs are human/policy merged
```

## Jira intake

`POST /webhooks/jira` accepts either the normalized Phase 4 intake schema or a native Jira Cloud webhook payload.

For native Jira events the normalizer intentionally starts work only when:

- an issue is created while assigned to a configured AI SDLC assignee; or
- the assignee field changes to a configured AI SDLC assignee.

Ordinary issue edits are ignored to avoid duplicate AI jobs.

Recommended runtime configuration:

```ts
jiraWebhook: {
  targetAssigneeAccountIds: ['<JIRA_ACCOUNT_ID>'],
  allowedProjectKeys: ['PIM', 'RPA', 'TMS', 'VESPISTI'],
  componentFieldId: '<RPA_COMPONENT_CUSTOM_FIELD_ID>',
  workTypeFieldId: '<AI_WORK_TYPE_CUSTOM_FIELD_ID>'
}
```

For Jira project `RPA`, the selected Component is passed to the Context Resolver and remains subject to the deterministic Component → repository mapping in `ssot/jira-routing/RPA.yaml`.

Application projects do not require users to select frontend/backend repositories. Repository resolution remains evidence-based and may return multiple repositories.

## Jira workflow synchronization

The internal AI SDLC job state is authoritative for orchestration. Jira remains authoritative for Jira workflow state.

Do **not** hard-code Jira transition IDs. Runtime synchronization:

1. reads the issue and Jira project key;
2. chooses a project-specific destination status name;
3. queries currently available transitions;
4. selects a transition whose destination status matches the configured name;
5. falls back to Jira comment-only synchronization when the transition is not currently available.

Verified/partial project mappings are registered in:

```text
ssot/jira-workflows/phase4-status-mapping.yaml
```

This prevents workflow differences between PIM/RPA/TMS/VESPISTI from causing valid AI jobs to fail.

## Important boundaries

- Context Resolver decides whether code modification is allowed.
- Agent Runner performs repository-specific analysis/coding/testing through a controlled workspace.
- Orchestrator never merges PRs.
- Orchestrator never directly deploys production.
- Production credentials are never included in Agent requests or persisted job payloads.
- One Jira issue may create multiple PRs.
- RPA repository routing remains deterministic through Jira Component governance.
- Duplicate Jira webhook delivery is controlled by intake-event/job idempotency.

## Canonical states

```text
RECEIVED
→ RESOLVING_CONTEXT
→ ANALYZING
→ PLANNING
→ WAITING_PLAN_APPROVAL (New Module only)
→ CODING
→ TESTING
→ CREATING_PR
→ WAITING_REVIEW
→ DONE
```

Blocking paths may enter `WAITING_INFORMATION`, `FAILED`, or `CANCELLED`.

## Work-type behavior

- **Bug**: resolve repository → analyze → code → test → PR → wait for review/merge.
- **New Module**: resolve repository → plan → `WAITING_PLAN_APPROVAL` → code/test/PR only after human approval.
- **Analysis**: analyze without code or PR.
- **New Project** remains Phase 5 and is intentionally not implemented by this orchestrator.

## Production dependencies

The reference adapters expect these capabilities to be supplied at runtime:

- Redis for BullMQ;
- PostgreSQL for durable job state/idempotency;
- Phase 3 Context Resolver endpoint;
- Jira REST credentials/OAuth supplied from a secret store;
- GitHub App/installation token supplied from a secret store;
- controlled Agent Runner endpoint;
- Jira and GitHub webhook secrets.

Secrets must not be committed to this repository, Jira comments, Effective Context, or AI job payloads.

## HTTP endpoints

```text
GET  /healthz
POST /webhooks/jira
POST /webhooks/github
```

GitHub webhook requests require `X-Hub-Signature-256` verification. Jira webhook requests require the configured AI SDLC shared-secret header and may use `X-Atlassian-Webhook-Identifier` as the idempotency event identifier.

## Local validation

```bash
npm install
npm run typecheck
npm test
```

CI validation is defined in `.github/workflows/phase4-orchestrator-validation.yml`.
