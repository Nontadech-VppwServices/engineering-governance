# Engineering Governance

Central governance repository for engineering standards, source-of-truth definitions, architecture decisions, business decisions, and AI SDLC governance.

## Purpose

This repository defines **where authoritative information lives** and the precedence rules used when multiple sources disagree. It is the governance foundation for an AI-assisted SDLC across multiple projects.

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

Governance authority and conflict-resolution foundation:

- `ssot/authority-map.yaml`
- `ssot/precedence.yaml`

### Phase 1 — Complete

Project registry, ADR/BDR templates and schemas, Git/deployment/security/AI governance policies.

### Phase 2 — Complete

Pilot: `PIM` / `VespiarioThailand/product-information` with verified Git, Jira, runtime, database, AWS ECS/Fargate and CI/CD context.

### Phase 2.1 — Organization Project Inventory — Complete

- `inventory/organization-projects.yaml`
- one registry record per governed project under `ssot/projects/`
- AWS and on-prem/RPA deployment classes registered
- organization-wide `policies/testing.md`
- organization-wide `policies/business-context.md`

### Phase 2.2 — Compliance + Business-Context Onboarding — Complete

Audit evidence:

- `compliance/phase-2.2.md`
- reusable project business-context template: `templates/business-context/README.md`
- project-local `docs/business/README.md` scaffolds created across all registered application/automation repositories

AWS minimum testing result:

- compliant: `PIM`, `VESPISTIID_PLATFORM`
- non-compliant / remediation required: `WEBSITE_CUSTOMER_FRONTEND`, `VESPISTIID_BACKEND`, `WEBSITE_CMS`, `ECOMMERCE_CUSTOMER_FRONTEND`, `ECOMMERCE_CMS`, `TMS_BACKEND`

On-prem/RPA result:

- existing automated tests but controlled production gate still unresolved: `RPA_D365`, `RPA_D365_RETAIL_ECOMMERCE_EXPORT`, `RPA_D365_INVOICE_EXPORT`
- automated test/gate gaps: `RPA`, `RPA_AP_PO_INVOICE`, `PDF_SIGNER`

Verified Jira mappings:

- `PIM` → Jira `PIM` — Product Information Management
- `TMS_BACKEND` → Jira `TMS` — Transport Management System

A Jira project `RPA` exists, but individual RPA repositories remain unmapped until repository/issue-level evidence confirms each relationship.

Important configuration drift discovered:

- `TMS_BACKEND` production workflow references Product Information deployment resource names and PIM environment URL; the registry records this as high-severity deployment configuration drift pending verification/correction.

Business-context onboarding rule:

- Jira remains authoritative for live ticket status, assignee, priority, sprint and current acceptance progress.
- `docs/business/` stores stable domain knowledge, terminology, rules, actors and flows.
- AI-created scaffolds remain `pending_human_review`; AI must not invent business rules.

## Organization default project archetypes

Accepted architecture decision:

- `decisions/adr/global/ADR-GLOBAL-001-default-project-archetypes.md`

Defaults for new projects:

- AWS website/application → **Next.js + TypeScript** using `templates/archetypes/aws-nextjs-typescript.yaml`
- on-premise RPA → **Playwright + TypeScript** using `templates/archetypes/onprem-playwright-typescript-rpa.yaml`

A project that needs a different primary stack must use an accepted ADR to document the exception. AI/New Project automation must not silently deviate from the applicable default archetype.

## Central RPA reporting standard

Accepted architecture decision:

- `decisions/adr/global/ADR-GLOBAL-002-central-rpa-reporting.md`

Supporting governance:

- `policies/rpa-reporting.md`
- `schemas/rpa-run-event.schema.json`
- `templates/rpa-report-summary.md`

RPA bots emit normalized run events to a central reporting service. The central service stores history, creates daily/weekly/monthly summaries in `Asia/Bangkok`, and delivers reports through the **LINE Messaging API / LINE Official Account**. Bots must not own LINE credentials or independent scheduled-report logic.

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
Phase 2.2  Compliance + business-context onboarding   COMPLETE
   ↓
Phase 3    Effective Context Resolver
   ↓
Phase 4    Jira → AI → Git → PR workflow
   ↓
Phase 5    Module / New Project automation
   ↓
Phase 6    Hermes Skills / Memory / continuous improvement
```

Parallel implementation workstream:

```text
RPA Reporting Service
   ├── event ingestion API
   ├── durable reporting store
   ├── daily/weekly/monthly aggregator
   ├── LINE Messaging adapter
   └── dashboard/evidence links (future)
```

## Governance rule

When documentation, AI memory, cached data, and authoritative systems disagree, follow `ssot/precedence.yaml` and report the conflict instead of silently guessing which value is correct.

## Next step

Build Phase 3 — Effective Context Resolver. It should resolve project registry data, organization policies, applicable ADR/BDR records, project-local `.ai` metadata, `docs/business/` context, live Jira issue context, repository truth pointers, compliance gaps, project archetype, reporting requirements, and unresolved/conflict flags into one effective project context for AI agents.
