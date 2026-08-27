---
id: ADR-GLOBAL-001
title: Default project archetypes for AWS websites and on-premise RPA
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

The organization repeatedly creates two common classes of software:

1. web/application projects deployed to AWS; and
2. RPA/automation projects deployed to on-premise servers.

Allowing every new project to choose an unrelated stack increases maintenance cost, CI/CD variation, AI context complexity, security review effort, and operational drift.

Existing organization repositories already provide working reference implementations for both families.

# Decision

## AWS website/application default

New AWS website/application projects should use **Next.js + TypeScript** as the default application stack and should follow the organization AWS deployment/testing standards.

Expected baseline:

- TypeScript;
- Next.js;
- Node.js LTS/current organization-supported version;
- Docker packaging;
- GitHub Actions CI/CD;
- AWS deployment through approved organization infrastructure patterns;
- automated API tests;
- automated E2E tests;
- API + E2E as mandatory production gates;
- security/build/static-analysis gates as defined by organization policy;
- project-local `docs/business/`, ADR and BDR paths.

Projects may use a different framework when requirements justify it, but the deviation requires an approved project/domain ADR.

## On-premise RPA default

New on-premise RPA projects should use **Playwright + TypeScript** as the default automation stack.

Expected baseline:

- TypeScript;
- Playwright;
- Node.js LTS/current organization-supported version;
- Docker/Docker Compose where the runtime supports containerization;
- structured logs;
- idempotency/retry controls for state-changing automation;
- automated workflow smoke/regression tests;
- parser/transformation/unit tests where applicable;
- standard RPA run-event reporting contract;
- project-local `docs/business/`, ADR and BDR paths.

Python or another stack may be used where technically justified, but the deviation requires an approved project/domain ADR.

# Options Considered

## Standardize common project families

### Advantages

- reduces variation and maintenance cost;
- gives AI agents predictable project structure;
- allows reusable CI/CD and test templates;
- improves staff mobility between projects;
- enables shared observability/reporting patterns.

### Disadvantages

- not every workload is best served by the default stack;
- templates must be kept current.

## Allow stack selection per project

### Advantages

- maximum technical flexibility.

### Disadvantages

- creates architecture drift and duplicate tooling;
- increases AI SDLC complexity and operational support cost.

# Consequences

## Positive

- New Project Agent can select a deterministic golden archetype.
- Organization policies can validate new projects automatically.
- AWS applications and on-prem RPA projects can share reusable CI/testing/reporting components.

## Negative / Trade-offs

- Exceptions need explicit architectural review.
- Existing projects are not required to rewrite solely to match the standard; remediation should be risk/value driven.

# Validation / Guardrails

A newly registered project must declare an `archetype`.

Default mapping:

- `deployment=aws` + `project_type=website/application` -> `aws-nextjs-typescript`
- `deployment=on_prem` + `project_type=rpa` -> `onprem-playwright-typescript-rpa`

If the repository implementation does not match the declared/default archetype and no accepted exception ADR exists, report `architecture_drift` or `unapproved_archetype_exception`.

# References

- `policies/testing.md`
- `policies/project-standard.md`
- `policies/business-context.md`
