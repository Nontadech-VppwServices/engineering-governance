---
id: ADR-GLOBAL-004
title: Effective Context Resolver as the canonical AI context boundary
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

AI agents need a consistent, model-independent way to understand a Jira issue before planning or modifying code. Relevant truth is distributed across organization governance, project registry, Jira, one or more GitHub repositories, project-local business context, ADR/BDR records, compliance results, deployment metadata, and routing rules.

Allowing each agent to assemble these sources independently would duplicate precedence logic and create inconsistent decisions between Hermes, Codex, Claude, Qwen, or future agents.

# Decision

Create an **Effective Context Resolver** as the canonical boundary between authoritative engineering/business sources and AI agents.

The resolver returns a normalized Effective Context document. It does not become a new source of truth; it is a computed view with explicit source references, timestamps, authority metadata, conflicts, unresolved items, and repository-routing evidence.

## Core resolution order

For each request the resolver must:

1. resolve Jira project/issue identity when an issue key is supplied;
2. resolve the central project registry and applicable Jira routing policy;
3. determine candidate/impacted repositories;
4. load organization policies and accepted applicable ADR/BDR records;
5. load stable project-local business context and project AI metadata when available;
6. load repository-owned implementation/configuration truth for the target branch;
7. attach compliance state and known drift/gaps;
8. apply `ssot/precedence.yaml`;
9. produce conflicts/unresolved flags rather than silently guessing;
10. return the normalized Effective Context contract.

## Repository routing

Repository routing follows `ADR-GLOBAL-003`.

- Jira project `RPA` uses mandatory Component routing through `ssot/jira-routing/RPA.yaml` and then validates the issue evidence against that component.
- Application projects that can span frontend/backend repositories use AI/evidence-assisted discovery. One issue may resolve to multiple repositories.
- Routing output is an array and includes role, reason, confidence, and evidence.

## Agent boundary

Agents consume Effective Context; they should not independently reinterpret governance precedence or bypass a resolver stop condition.

A resolver result with a blocking conflict must prevent code modification until the conflict is resolved or an approved exception exists.

## Service boundary

The resolver should expose a versioned HTTP API. The first contract is:

- `POST /v1/context/resolve`
- `GET /v1/projects/{projectId}/context`

The resolver core is deterministic and model-independent. Provider-specific Jira/GitHub clients are adapters around the core and may be replaced without changing the context contract.

# Consequences

## Positive

- all AI agents receive the same governance/business/repository view;
- Jira-to-repository routing becomes reusable across agents;
- authority conflicts and architecture/configuration drift are visible before coding;
- model/provider changes do not require rewriting governance logic;
- Context Resolver can be tested deterministically with fixtures.

## Negative / Trade-offs

- a shared resolver service becomes critical infrastructure for AI SDLC;
- context freshness and adapter availability must be monitored;
- repository discovery for ambiguous application issues may require multiple code-search/read operations.

# Guardrails

- generated Effective Context is never authoritative over its sources;
- secrets and production credentials must never appear in the context payload;
- raw unrestricted logs/customer payloads must not be copied into context;
- accepted decisions and organization policies are applied before agent planning;
- unresolved routing below confidence threshold blocks code modification;
- `routing_conflict`, `policy_violation`, `architecture_drift`, and `unresolved_authority` are explicit machine-readable conflict types;
- stale cache must be identifiable by `generated_at` and source freshness metadata;
- production actions remain outside the resolver and must use CI/CD + human approval.

# References

- `ssot/precedence.yaml`
- `policies/context-resolution.md`
- `schemas/context-resolve-request.schema.json`
- `schemas/effective-context.schema.json`
- `schemas/effective-context.schema.json` (the Effective Context contract; the standalone HTTP API was removed by ADR-GLOBAL-010 and is now the `get_effective_context` tool)
- `ADR-GLOBAL-003`
