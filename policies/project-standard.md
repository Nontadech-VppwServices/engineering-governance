# Project Governance Standard

Every active project onboarded to AI SDLC must have a central registry record under `ssot/projects/`.

## Required project metadata

- canonical project ID
- project name, domain, and project type
- declared project archetype
- technical ownership
- Jira project mapping or an explicit `unmapped` state
- Git repository
- default branch
- deployment type
- environment mapping when known
- project ADR/BDR locations when onboarded
- AI permissions
- applicable test policy and compliance state
- business-context location and onboarding state

Unknown values must remain explicitly unknown/unverified; AI must not infer them merely to satisfy the registry.

## Default project archetypes

Architecture authority: `decisions/adr/global/ADR-GLOBAL-001-default-project-archetypes.md`.

### New AWS website/application

Default archetype:

```text
aws-nextjs-typescript
```

Descriptor:

```text
templates/archetypes/aws-nextjs-typescript.yaml
```

Use **Next.js + TypeScript** by default and apply the AWS API + E2E production-gate requirement from `policies/testing.md`.

### New on-premise RPA

Default archetype:

```text
onprem-playwright-typescript-rpa
```

Descriptor:

```text
templates/archetypes/onprem-playwright-typescript-rpa.yaml
```

Use **Playwright + TypeScript** by default and integrate the standard RPA run-event/reporting contract from `policies/rpa-reporting.md`.

### Archetype exception

If project requirements require a different primary framework/runtime, create an ADR describing the reason, alternatives, risks, and operational impact. The exception becomes authoritative only after the ADR is accepted.

AI must not silently choose a different stack when a default archetype applies.

## Project-local governance

Project-specific ADRs should live with the project repository, normally under:

```text
docs/adr/
```

Project-specific BDRs may live under:

```text
docs/bdr/
```

when they are tightly coupled to that project. Cross-project decisions belong in this central governance repository.

## Business context

Active application and automation projects should maintain stable business context under:

```text
docs/business/
```

Follow `policies/business-context.md`.

Do not manually mirror every Jira ticket into Git. Jira remains authoritative for live work-item state. Repository business documents should focus on stable domain knowledge, rules, terminology, workflows, and links to authoritative decisions/specifications.

## Testing

All projects follow `policies/testing.md`.

AWS application projects must have automated **API tests and E2E tests** as mandatory production quality gates. A project that does not currently satisfy the minimum must be recorded as non-compliant/unverified and remediated before the policy can be considered enforced.

On-premise/RPA projects must define automation-appropriate test gates such as workflow, parser, export, file-contract, idempotency, or smoke tests.

## RPA reporting

All new RPA projects must implement `schemas/rpa-run-event.schema.json` and emit normalized lifecycle events to the central RPA Reporting Service.

Bots must not own LINE credentials or daily/weekly/monthly reporting schedules. LINE delivery is handled centrally through the LINE Messaging API according to `policies/rpa-reporting.md`.

## Authority rule

The registry should store stable identities, classifications, governance state, and pointers. Do not copy information that can be authoritatively read from the repository/runtime unless there is a justified governance reason.

## AI onboarding requirement

Before an AI agent can modify a project, the project registry must explicitly define allowed and denied actions.

The agent must resolve applicable organization policies and the declared/default archetype before planning or modifying code.
