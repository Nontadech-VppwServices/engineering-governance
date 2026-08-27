# Engineering Governance

Central governance repository for engineering standards, source-of-truth definitions, architecture decisions, business decisions, and AI SDLC governance.

## Purpose

This repository defines **where authoritative information lives** and the precedence rules used when multiple sources disagree.

It is designed to become the governance foundation for an AI-assisted SDLC across multiple projects.

## Core principles

1. Each information type must have a clearly defined authoritative source.
2. Do not duplicate data when the authoritative value can be read from its original source.
3. Git repositories are authoritative for source code and version-controlled implementation configuration.
4. Jira is authoritative for work items and their workflow status.
5. Accepted ADRs are authoritative for approved architecture decisions.
6. Accepted BDRs are authoritative for approved business decisions.
7. AI memory, generated summaries, embeddings, and search indexes are never authoritative sources.
8. AI may propose changes to governance, ADRs, and BDRs, but approval remains a human responsibility.
9. Production deployment must remain controlled by CI/CD and environment protection rules, not direct AI access.
10. Unknown or unmapped facts must remain explicitly unknown; AI must not fill governance gaps by inference.

## Current status

### Phase 0 — Complete

- `ssot/authority-map.yaml`
- `ssot/precedence.yaml`

### Phase 1 — Complete

Project registry, ADR/BDR templates and schemas, Git/deployment/security/AI governance policies.

### Phase 2 — Complete

Pilot: `PIM` / `VespiarioThailand/product-information` with verified Git, Jira, runtime, database, AWS ECS/Fargate and CI/CD context.

### Phase 2.1 — Organization Project Inventory — Complete

Organization inventory:

- `inventory/organization-projects.yaml`
- one registry record per governed project under `ssot/projects/`

Registered AWS projects:

- `WEBSITE_CUSTOMER_FRONTEND`
- `VESPISTIID_BACKEND`
- `VESPISTIID_PLATFORM`
- `WEBSITE_CMS`
- `ECOMMERCE_CUSTOMER_FRONTEND`
- `ECOMMERCE_CMS`
- `TMS_BACKEND`
- existing pilot `PIM`

Registered on-premise / automation projects:

- `RPA_D365`
- `RPA`
- `RPA_AP_PO_INVOICE`
- `PDF_SIGNER`
- `RPA_D365_RETAIL_ECOMMERCE_EXPORT`
- `RPA_D365_INVOICE_EXPORT`

Organization-wide quality policy:

- `policies/testing.md`
- AWS applications require automated **API + E2E tests** as mandatory production gates.
- Missing mandatory gates are governance gaps and must not be silently skipped by AI.

Business-context policy:

- `policies/business-context.md`
- Jira remains authoritative for live work items and workflow state.
- Repositories should maintain stable business/domain context under `docs/business/`.
- Jira-derived Markdown snapshots may be generated for AI context but are non-authoritative and must include source/sync metadata.

## Planned evolution

```text
Phase 0    Governance foundation                       COMPLETE
   ↓
Phase 1    Registry + ADR/BDR standards               COMPLETE
   ↓
Phase 2    PIM pilot onboarding                       COMPLETE
   ↓
Phase 2.1  Organization project inventory             COMPLETE
   ↓
Phase 2.2  Compliance + business-context onboarding
   ↓
Phase 3    Effective Context Resolver
   ↓
Phase 4    Jira → AI → Git → PR workflow
   ↓
Phase 5    Module / New Project automation
   ↓
Phase 6    Hermes Skills / Memory / continuous improvement
```

## Governance rule

When documentation, AI memory, cached data, and authoritative systems disagree, follow `ssot/precedence.yaml` and report the conflict instead of silently guessing which value is correct.

## Next step

Run Phase 2.2 against the registered projects:

1. verify API/E2E compliance for every AWS project;
2. identify actual AWS deployment platform/workflows and branch/environment mapping;
3. verify on-premise deployment mechanism and automation test gates;
4. map Jira projects where available;
5. onboard stable `docs/business/` context without duplicating live Jira state.

After those gaps are measured, build Phase 3 Effective Context Resolver against the organization inventory.
