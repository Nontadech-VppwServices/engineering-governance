# Business Context and Requirement Policy

## Purpose

Defines how business requirements are represented for humans and AI without creating competing sources of truth.

## Authority model

- Jira is authoritative for implementation work items, current status, assignee, priority, acceptance progress, and workflow state.
- Accepted BDRs are authoritative for approved business decisions.
- Approved product specifications may be authoritative for stable product requirements when the project registry points to them.
- Repository business-context documents are AI/human context unless explicitly designated as an approved product specification.
- Generated Jira summaries or synchronized Markdown snapshots are never authoritative over Jira.

## What each project repository should contain

Each active application or automation project should maintain stable business context under `docs/business/`.

Recommended minimum:

```text
docs/business/
├── README.md
├── glossary.md
├── domain-rules.md
└── flows/
```

The repository business context should describe information that remains useful across many Jira tickets, such as:

- business purpose and scope;
- actors/personas and system roles;
- domain terminology;
- stable business rules and invariants;
- critical business workflows;
- external-system responsibilities;
- constraints that code must never violate;
- links to authoritative Jira epics, product specifications, BDRs, and ADRs.

## What should NOT be copied into repository Markdown

Do not manually duplicate every Jira issue, status, assignee, sprint, priority, or frequently changing acceptance state into Git.

Reasons:

- duplicate truth becomes stale;
- Git and Jira may disagree;
- AI may act on outdated status;
- maintaining two workflow systems creates unnecessary operational work.

## Jira-derived requirement snapshots

A generated Markdown snapshot may be used when offline/repository-local AI context is useful.

Snapshots must:

- be generated automatically, not maintained manually;
- identify the source Jira project/issues;
- contain `generated_at` / `last_synced_at` metadata;
- explicitly state `authoritative: false`;
- preserve Jira issue keys for traceability;
- be refreshed before AI uses time-sensitive information;
- never override live Jira state.

Recommended location:

```text
docs/business/generated/jira-context.md
```

## AI resolution order

When resolving business context, AI should use:

1. accepted BDR;
2. approved product specification registered as authoritative;
3. live Jira issue/epic data for implementation requirements and status;
4. stable repository business context;
5. generated Jira snapshot;
6. AI memory.

If sources conflict, AI must report the conflict and follow `ssot/precedence.yaml`.

## Traceability

Where relevant, repository business rules should link to their source decisions/work:

```text
Business Rule → BDR/Product Spec → Jira Epic/Issue → ADR (if architectural) → PR/Commit
```

## Recommended AI SDLC behavior

Before coding a Jira task, the Context Resolver should provide both:

- stable project business context from the repository; and
- live Jira context for the specific issue.

This gives the model domain understanding without turning Git into a second Jira database.
