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

Important configuration drift discovered:

- `TMS_BACKEND` production workflow references Product Information deployment resource names and PIM environment URL; the registry records this as high-severity deployment configuration drift pending verification/correction.

### Phase 2.3 — Jira Repository Routing — Complete

Accepted routing architecture:

- `decisions/adr/global/ADR-GLOBAL-003-jira-repository-routing.md`
- `policies/jira-repository-routing.md`
- `schemas/jira-routing.schema.json`
- `ssot/jira-routing/README.md`
- `ssot/jira-routing/RPA.yaml`

Routing rules:

- application Jira projects that may span frontend/backend/CMS/service repositories use **AI repository discovery**; end users are not required to know whether a defect is frontend or backend;
- Jira project `RPA` requires a **Component** selected from the approved dropdown keys;
- RPA Component → repository mapping is deterministic, but AI still validates the issue content against the selected component;
- one Jira issue may impact multiple repositories;
- `routing_conflict`, `unmapped_component`, and unresolved routing block code modification.

Approved RPA Jira Component keys:

- `D365_SALES_ORDER`
- `D365_CREDIT_NOTE`
- `AP_PO_INVOICE`
- `D365_RETAIL_ECOMMERCE_EXPORT`
- `D365_INVOICE_EXPORT`
- `PDF_SIGNER`
- `SHAREPOINT_EXCEL_EXTRACTOR`

### Phase 3 — Effective Context Resolver — Implementation complete, pending human merge

Accepted architecture proposal in this branch:

- `decisions/adr/global/ADR-GLOBAL-004-effective-context-resolver.md`
- `policies/context-resolution.md`

Machine contracts:

- `schemas/context-resolve-request.schema.json`
- `schemas/effective-context.schema.json`
- `api/context-resolver.openapi.yaml`

Reference TypeScript core:

- `reference/context-resolver/`
- deterministic RPA Component routing
- evidence-based multi-repository application routing input
- blocking conflict evaluation
- Effective Context assembly
- agent permissions (`can_plan`, `can_modify_code`, `can_create_pr`, `can_deploy_production=false`)
- regression tests

Examples:

- `examples/effective-context/rpa-ap-po-invoice.json`
- `examples/effective-context/application-multi-repo.json`

CI validation:

- `.github/workflows/context-resolver-validation.yml`

Effective Context is a computed view, never a replacement for Jira/GitHub/ADR/BDR/policy sources. Blocking routing/governance conflicts prevent code modification before an agent reaches Phase 4.

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
Phase 2.3  Jira repository routing                    COMPLETE
   ↓
Phase 3    Effective Context Resolver                  REVIEW / MERGE PENDING
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

## Next step after Phase 3 merge

Build Phase 4 — Jira → AI → Git → PR workflow around the Effective Context Resolver contract. Runtime adapters should load live Jira/GitHub/governance sources and feed the deterministic resolver core rather than allowing each AI agent to implement its own precedence/routing logic.
