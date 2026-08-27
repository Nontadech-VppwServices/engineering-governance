# Decision Resolution Policy

## Purpose

Defines how governance decisions are resolved across organization, domain, and project scopes.

## Scope hierarchy

```text
Organization / Global
        ↓
Domain
        ↓
Project
```

## Effective decision model

An effective project context is calculated from:

```text
Security / Mandatory Policies
+ Accepted Global ADRs
+ Accepted Domain ADRs
+ Accepted Project ADRs
+ Accepted BDRs relevant to the work
+ Approved Exceptions
= Effective Context
```

## Status rules

Only `accepted` records are authoritative decisions.

Supported lifecycle statuses:

- draft
- proposed
- accepted
- rejected
- superseded
- deprecated

AI-generated records must start as `draft` or `proposed` and require human approval before becoming `accepted`.

## Superseding decisions

Accepted ADRs and BDRs must not be rewritten to hide an old decision.

When a decision changes:

1. Create a new record.
2. Set the old record to `superseded`.
3. Set `superseded_by` on the old record.
4. Set `supersedes` on the new record.
5. Preserve history in Git.

## Exceptions

A project-specific choice that conflicts with a mandatory higher-level decision requires an explicit approved exception record. Silent overrides are prohibited.

An exception must include:

- parent decision being overridden
- affected project/domain
- rationale
- risk/trade-off
- owner
- approval
- review/expiry date when appropriate

## Conflict handling

If an AI agent or engineer detects disagreement between an accepted decision and current implementation, it must report `architecture_drift` rather than silently choosing a side.

If authoritative sources conflict and precedence does not resolve the conflict, execution must stop and request human resolution.
