# Project Governance Standard

Every active project onboarded to AI SDLC must have a central registry record under `ssot/projects/`.

## Required project metadata

- canonical project ID
- project name, domain, and project type
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

## Authority rule

The registry should store stable identities, classifications, governance state, and pointers. Do not copy information that can be authoritatively read from the repository/runtime unless there is a justified governance reason.

## AI onboarding requirement

Before an AI agent can modify a project, the project registry must explicitly define allowed and denied actions.

The agent must resolve applicable organization policies before planning or modifying code.
