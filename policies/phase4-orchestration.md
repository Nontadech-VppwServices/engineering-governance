# Phase 4 AI SDLC Orchestration Policy

## Scope

Controls Jira → AI → Git branch/code/test → pull request → Jira synchronization.

## Intake

An intake event must have a stable event ID and Jira issue key. Duplicate events must be deduplicated before starting another execution for the same logical event.

The orchestrator must load live Jira issue context and Effective Context before code modification.

Native Jira webhook intake should trigger an AI SDLC job only when:

- an issue is created while assigned to a configured AI SDLC assignee; or
- the assignee changes to a configured AI SDLC assignee.

Ordinary Jira edits must not create a new AI job unless an explicit future policy enables that trigger.

Jira project allow-lists and AI SDLC assignee account IDs are runtime configuration, not model inference.

## Repository routing

- Jira project `RPA`: Component routing from `ssot/jira-routing/RPA.yaml` is mandatory.
- Multi-repository application projects: repository discovery is evidence-driven through the Effective Context Resolver.
- Unresolved routing, `routing_conflict`, `unmapped_component`, `unresolved_authority`, or blocking policy violation stops code modification.

For application projects, Jira users do not need to identify frontend/backend repositories. One issue may route to more than one repository.

## Job persistence

Internal job state must be durable and independent from queue delivery state.

Required state history fields:

- state;
- entered_at;
- actor/type;
- reason when applicable.

Queue state is delivery state only and is never the authoritative AI SDLC job state.

## Work execution

The agent receives a versioned execution contract containing Jira context, Effective Context, repository, target branch and work type.

The agent must not receive production credentials through the execution contract.

Work-type behavior:

- Bug: may proceed through analysis, coding, tests and PR when Effective Context permits it.
- New Module: must stop at `WAITING_PLAN_APPROVAL` before coding.
- Analysis: must not create code changes or PRs.
- New Project: belongs to Phase 5 and is not executed by the Phase 4 orchestrator.

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

Core orchestration uses canonical AI SDLC states only. Jira workflow state remains a Jira concern.

Jira transition IDs must not be stored as cross-project constants. Runtime synchronization must:

1. load the current Jira issue and project key;
2. resolve the desired destination status name from project configuration;
3. query currently available Jira transitions;
4. select the transition whose destination status matches the desired name.

If the desired transition is not currently available, the default behavior is **comment-only synchronization**. A Jira workflow difference must not cause an otherwise valid AI SDLC job to fail.

Verified/partial Jira project mappings are registered in `ssot/jira-workflows/phase4-status-mapping.yaml`.

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

Production credentials must not be persisted in job records, Jira comments, Effective Context payloads, or Agent execution requests.

## Idempotency

The following operations must be idempotent or safely retryable:

- intake enqueue;
- state transition persistence;
- branch ensure/create;
- Jira status/comment synchronization;
- PR lookup/create;
- PR-merge completion callback.
