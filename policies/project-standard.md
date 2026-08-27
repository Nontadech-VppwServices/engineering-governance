# Project Governance Standard

Every active project onboarded to AI SDLC must have a central registry record under `ssot/projects/`.

## Required project metadata

- canonical project ID
- project name and domain
- technical ownership
- Jira project key
- Git repository
- default branch
- deployment type
- environment mapping
- project ADR/BDR locations
- AI permissions

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

## Authority rule

The registry should store stable identities and pointers. Do not copy information that can be authoritatively read from the repository/runtime unless there is a justified governance reason.

## AI onboarding requirement

Before an AI agent can modify a project, the project registry must explicitly define allowed and denied actions.
