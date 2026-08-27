# Phase 4 AI SDLC Orchestration Policy

## Scope

Controls Jira → AI → Git branch/code/test → pull request → Jira synchronization.

## Intake

An intake event must have a stable event ID and Jira issue key. Duplicate events must be deduplicated before starting another execution for the same logical event.

The orchestrator must load live Jira issue context and Effective Context before code modification.

## Repository routing

- Jira project `RPA`: Component routing from `ssot/jira-routing/RPA.yaml` is mandatory.
- Multi-repository application projects: repository discovery is evidence-driven through the Effective Context Resolver.
- Unresolved routing, `routing_conflict`, `unmapped_component`, `unresolved_authority`, or blocking policy violation stops code modification.

## Job persistence

Internal job state must be durable and independent from queue delivery state.

Required state history fields:

- state;
- entered_at;
- actor/type;
- reason when applicable.

## Work execution

The agent receives a versioned execution contract containing Jira context, Effective Context, repository, target branch and work type.

The agent must not receive production credentials through the execution contract.

## Branch naming

Default:

```text
ai/<jira-key-lowercase>-<short-slug>
```

Branch names must be deterministic, safe for Git refs, and traceable to Jira.

## Quality gates

Required quality gates come from Effective Context and organization policy.

AWS website/application minimum:

- API tests: required;
- E2E tests: required.

RPA minimum is automation appropriate and may include:

- type/static checks;
- unit/parser/transformation tests;
- workflow smoke/regression tests;
- idempotency/retry checks where state-changing automation is involved;
- Docker/build verification where applicable.

A required failed/missing gate blocks pull-request creation unless an accepted exception explicitly allows otherwise.

## Pull requests

One Jira issue may create multiple PRs when more than one repository is impacted.

Each PR must include:

- Jira issue key;
- AI SDLC job ID;
- work summary;
- tests executed and result;
- governance/conflict notes where relevant.

AI does not merge PRs.

## Jira synchronization

Jira native statuses are mapped by project configuration. Core orchestration uses canonical AI SDLC states only.

At minimum Jira should receive comments/events for:

- routing resolved;
- blocked/waiting information;
- PR created;
- tests failed;
- all PRs merged / completion.

## Completion

`WAITING_REVIEW` → `DONE` requires all required PRs to be merged.

A closed-unmerged PR does not complete the job.

## Production

Production deployment remains CI/CD responsibility after human/policy-controlled merge. The Phase 4 orchestrator cannot directly deploy production.

## Idempotency

The following operations must be idempotent or safely retryable:

- intake enqueue;
- state transition persistence;
- branch ensure/create;
- Jira status/comment synchronization;
- PR lookup/create;
- PR-merge completion callback.
