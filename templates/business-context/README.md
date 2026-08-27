# Project Business Context

> Status: onboarding scaffold. Business/domain owners must review unverified statements before this document is treated as stable project context.
>
> Live Jira ticket status, assignee, priority, sprint, and current acceptance progress are authoritative in Jira and must not be copied here as competing truth.

## Business purpose

Describe why this system exists and the business outcome it supports.

## Scope

### In scope

- TODO

### Out of scope

- TODO

## Actors and roles

| Actor / Role | Responsibility | Verification |
|---|---|---|
| TODO | TODO | unverified |

## Domain terminology

| Term | Meaning | Source |
|---|---|---|
| TODO | TODO | TODO |

## Stable business rules and invariants

Only record rules that remain valid across multiple tickets/releases. Link the authoritative source where available.

| Rule | Source | Verification |
|---|---|---|
| TODO | Jira epic / product spec / BDR | unverified |

## Critical business flows

### Flow: TODO

```text
Actor/System
  ↓
Step
  ↓
Result
```

## External systems and responsibilities

| System | Responsibility / Contract | Source |
|---|---|---|
| TODO | TODO | TODO |

## Business constraints AI must not violate

- TODO

## Authoritative references

- Jira project: TODO/unmapped
- Product specification: TODO/unmapped
- BDRs: TODO
- ADRs: `docs/adr/` when applicable

## Generated Jira context

If repository-local Jira snapshots are needed, generate them under:

```text
docs/business/generated/jira-context.md
```

Generated snapshots must state `authoritative: false`, contain Jira issue keys and sync timestamps, and be refreshed before time-sensitive use.
