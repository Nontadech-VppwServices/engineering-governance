# Effective Context Resolution Policy

## Purpose

Defines how the AI SDLC resolves authoritative engineering/business context before an AI agent plans or modifies code.

## Principle

Effective Context is a **computed view**, not a new source of truth.

Every material field should either:

- point to an authoritative source;
- identify that it is derived/computed; or
- remain explicitly unresolved.

## Required inputs

A context request must identify at least one of:

- Jira issue key;
- canonical project ID.

Optional inputs include target branch, explicit repository hints, requested work type, and RPA Component.

## Resolution stages

1. `identity` — resolve project/Jira identity.
2. `registry` — load `ssot/projects/{PROJECT}.yaml`.
3. `routing` — resolve impacted repository candidates using `policies/jira-repository-routing.md`.
4. `governance` — load applicable organization policies and accepted global/domain/project ADR/BDR records.
5. `business_context` — load stable `docs/business/` context and authoritative product specification pointers.
6. `repository_truth` — resolve target branch and repository-owned implementation/configuration facts.
7. `compliance` — attach test/deployment/business-context compliance and drift findings.
8. `precedence` — apply `ssot/precedence.yaml`.
9. `conflicts` — materialize conflicts/unresolved conditions.
10. `output` — emit `schemas/effective-context.schema.json`.

## Repository routing

### RPA Jira project

For Jira project `RPA`:

- Component is required for normal maintenance/bug/module work;
- route using `ssot/jira-routing/RPA.yaml`;
- validate issue evidence against the selected component;
- do not silently switch to another repository when metadata conflicts;
- return `routing_conflict` when the issue clearly points elsewhere.

### Application/multi-repository Jira projects

Users are not required to choose frontend/backend repository.

The resolver may inspect:

- issue summary/description/acceptance criteria;
- API paths and URLs;
- error messages/stack traces supplied in Jira;
- project/domain registry;
- architecture/business context;
- repository code search;
- dependency/API relationships;
- tests/configuration.

One issue may resolve to multiple impacted repositories.

## Routing confidence

- deterministic explicit/Component mapping: `1.00`;
- strong code/API/evidence match: `>= 0.85`;
- candidate needing more inspection: `0.60-0.84`;
- `< 0.60`: block code modification with `waiting_information`.

A confidence number does not override governance conflicts or policy violations.

## Blocking conditions

The resolver sets `decision.can_modify_code=false` for at least:

- `routing_conflict`;
- `unmapped_component`;
- `unresolved_authority`;
- incompatible accepted decisions;
- security/organization `policy_violation`;
- unresolved repository/target branch;
- routing confidence below the required threshold.

`architecture_drift` and `configuration_drift` must be reported. Whether they block modification depends on risk/policy; they must always block direct production actions.

## Business information

Order for business interpretation:

1. accepted BDR;
2. approved product specification registered as authoritative;
3. live Jira issue/epic context for current implementation requirement/state;
4. stable `docs/business/` repository context;
5. generated Jira snapshot;
6. AI memory.

Generated snapshots and AI memory are never authoritative.

## Architecture information

Order:

1. accepted global ADR;
2. accepted domain ADR;
3. accepted project ADR;
4. approved exception overlay;
5. current repository implementation;
6. generated documentation/memory.

Mismatch between accepted architecture and repository implementation is `architecture_drift`.

## Security and redaction

Effective Context must not contain:

- passwords;
- private keys;
- access/refresh tokens;
- cookies/session material;
- unrestricted production environment dumps;
- customer-sensitive raw payloads unless explicitly approved and minimized.

Resolvers should return references/evidence metadata instead of secret content.

## Freshness

The response must include:

- `generated_at`;
- source retrieval timestamps when available;
- source authority/type;
- cache status when cached data is used.

Live Jira work status must not be replaced by a stale generated snapshot.

## Agent usage

Before coding, agents must consume the resolver result and honor:

- `decision.can_plan`;
- `decision.can_modify_code`;
- `decision.can_create_pr`;
- `decision.can_deploy_production` (organization default: false for AI);
- `conflicts[]`;
- `unresolved[]`;
- `routing.repositories[]`.

Agents may enrich analysis but may not bypass or rewrite the resolver's authoritative-source precedence.
