---
id: ADR-GLOBAL-003
title: Jira issue to GitHub repository routing
status: accepted
scope: global
domain: engineering
project: null
date: 2026-08-27
owners:
  - engineering
supersedes: []
superseded_by: null
related_bdr: []
related_jira: []
---

# Context

A Jira project is not necessarily equivalent to a single Git repository. Application Jira projects may cover both frontend and backend repositories, while the shared Jira project `RPA` covers multiple independent automation repositories.

A reliable AI SDLC therefore needs an explicit routing step before planning or modifying code.

# Decision

Use two routing modes.

## Application / multi-repository mode: AI repository discovery

For application projects that may contain frontend and backend repositories, Jira users are not required to select the repository or frontend/backend component.

The Repository Resolver must determine the impacted repository or repositories by combining:

- Jira summary, description and acceptance criteria;
- error messages, URLs, API routes and stack traces when available;
- central project/domain registry;
- project business context and architecture context;
- repository code search;
- dependency/API relationships;
- tests and implementation evidence.

The resolver must support one Jira issue affecting more than one repository.

The output must include candidate/impacted repositories, role, reason and confidence. AI must not start code modification until repository routing is sufficiently resolved.

## RPA mode: mandatory Jira Component

For Jira project `RPA`, the Jira Component field is mandatory for normal maintenance/bug/module work. The selected Component maps deterministically to one primary repository through `ssot/jira-routing/RPA.yaml`.

The Repository Resolver must still validate that the issue description is consistent with the selected Component. If the issue content clearly conflicts with the mapping, return `routing_conflict` and do not silently modify another repository.

Multiple Component values may map to the same repository when one repository implements multiple business flows.

# Routing states

Recommended states:

- `resolved` — deterministic or high-confidence repository resolution;
- `analyzing_candidates` — more repository inspection is required;
- `multi_repo` — more than one repository is impacted;
- `routing_conflict` — Jira metadata conflicts with repository evidence;
- `unmapped_component` — selected RPA Component has no registered route;
- `waiting_information` — resolution cannot safely proceed.

# Confidence guidance for AI discovery

- explicit/deterministic routing: `1.00`;
- strong code/API/evidence match: `>= 0.85`;
- plausible candidate requiring more inspection: `0.60-0.84`;
- below `0.60`: do not modify code; request/resolve more information.

Confidence is evidence metadata, not permission to override accepted governance.

# Consequences

- Jira users do not need to know whether an application bug is frontend or backend.
- RPA tickets remain easy and deterministic for end users through a controlled dropdown.
- One issue may legitimately produce changes/PRs in multiple repositories.
- Repository routing becomes a first-class Context Resolver responsibility.

# Validation / Guardrails

- `Jira Project -> Repository` must not be assumed as one-to-one.
- RPA maintenance tickets require a registered Component route.
- AI must report why a repository was selected.
- AI must verify RPA Component vs issue evidence before coding.
- Multi-repository impact must be represented as an array, not a single repository field.
- Unknown/unmapped routing must stop before code modification.

# References

- `policies/jira-repository-routing.md`
- `ssot/jira-routing/RPA.yaml`
- `schemas/jira-routing.schema.json`
