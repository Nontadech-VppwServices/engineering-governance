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

### Phase 3 — Effective Context Resolver — Complete

Merged through human-reviewed PR #1 on 2026-08-27.

Architecture/policy:

- `decisions/adr/global/ADR-GLOBAL-004-effective-context-resolver.md`
- `policies/context-resolution.md`

Machine contracts:

- `schemas/context-resolve-request.schema.json`
- `schemas/effective-context.schema.json`
- `api/context-resolver.openapi.yaml`

Reference TypeScript service:

- `reference/context-resolver/`
- deterministic resolver core
- source ports for Jira, Project Registry, RPA routing, repository discovery/facts, and governance/business context
- `ContextResolverService` orchestration
- two-pass routing → repository inspection → final context assembly
- HTTP adapter with `/healthz`, `/v1/context/resolve`, and `/v1/projects/{projectId}/context`
- deterministic RPA Component routing
- evidence-based multi-repository application routing input
- blocking conflict evaluation
- agent permissions (`can_plan`, `can_modify_code`, `can_create_pr`, `can_deploy_production=false`)
- static/in-memory adapter for tests/local examples
- core, service, and HTTP integration tests

Examples:

- `examples/effective-context/rpa-ap-po-invoice.json`
- `examples/effective-context/application-multi-repo.json`

CI validation:

- `.github/workflows/context-resolver-validation.yml`
- JSON schema validation
- TypeScript typecheck
- resolver/service/HTTP tests

Effective Context is a computed view, never a replacement for Jira/GitHub/ADR/BDR/policy sources.

### Phase 4 — Jira → AI → Git → PR — Implementation Complete

Phase 4 implementation is complete in `main`. **Production runtime is not active yet.** Runtime activation is controlled separately by `operations/phase4-runtime-activation.md`.

Governance/contracts:

- `decisions/adr/global/ADR-GLOBAL-005-phase4-ai-sdlc-orchestration.md`
- `policies/phase4-orchestration.md`
- `schemas/jira-ai-intake-event.schema.json`
- `schemas/ai-sdlc-job.schema.json`
- `schemas/agent-execution-request.schema.json`
- `schemas/agent-execution-result.schema.json`

Reference TypeScript orchestrator:

- `reference/ai-sdlc-orchestrator/`
- native Jira Cloud webhook normalization
- trigger by configured AI SDLC assignee / assignee change
- BullMQ/Redis queue adapter
- PostgreSQL durable JobStore adapter
- Phase 3 Context Resolver HTTP adapter
- Jira REST comment/status synchronization
- project-aware Jira destination-status mapping without hard-coded transition IDs
- GitHub REST branch/PR adapter
- Agent Runner HTTP contract
- multi-repository PR creation
- Bug → code/test/PR workflow
- New Module → mandatory `WAITING_PLAN_APPROVAL`
- Analysis-only workflow without code/PR
- AWS API + E2E quality-gate enforcement from Effective Context
- GitHub `pull_request` webhook completion tracking
- `DONE` only after all required PRs are merged
- AI merge disabled
- AI production deployment disabled

Jira workflow evidence/configuration:

- `ssot/jira-workflows/phase4-status-mapping.yaml`
- live Jira verified/partially verified for `PIM`, `RPA`, `TMS`, and `VESPISTI`
- unavailable Jira transitions fall back to comment-only synchronization instead of failing the AI job

CI validation:

- `.github/workflows/phase4-orchestrator-validation.yml`
- Phase 4 JSON schema validation
- TypeScript typecheck
- orchestration, routing, quality-gate, Jira webhook and Jira REST tests

Runtime activation checklist:

- `operations/phase4-runtime-activation.md`

### Phase 5 — Module / New Project Automation — Complete

Governance/contracts:

- `decisions/adr/global/ADR-GLOBAL-006-phase5-project-automation.md`
- `policies/phase5-project-automation.md`
- `schemas/project-automation-request.schema.json`
- `schemas/project-automation-plan.schema.json`

Reference TypeScript service:

- `reference/project-automation/`
- idempotent durable plan creation
- Effective Context gate for New Module
- Phase 4 execution handoff after plan approval
- accepted golden-archetype selection for New Project
- named human approval gate
- deterministic staging-only AWS Next.js/TypeScript and on-prem Playwright/TypeScript RPA scaffolds
- Docker, environment, CI, tests, health, and project-local governance baselines
- PostgreSQL persistence and authenticated HTTP API

The service does not create remote repositories, push/merge, accept decisions, or deploy production.

### Phase 6 — Hermes Skills / Memory / Continuous Improvement — Complete

Governance/contracts:

- `decisions/adr/global/ADR-GLOBAL-007-hermes-learning-governance.md`
- `policies/hermes-learning.md`
- `schemas/hermes-memory-record.schema.json`
- `schemas/hermes-learning-observation.schema.json`
- `schemas/hermes-improvement-proposal.schema.json`

Runtime/reference implementation:

- `reference/hermes-governance/`
- `hermes/skills/engineering-governance/SKILL.md`
- non-authoritative memory with provenance, lifecycle, expiry, and secret rejection
- observation → proposal → evaluation → human approval → publication loop
- two distinct human reviewers for high-risk skills
- generated-skill publication isolated from governed built-in skills
- immutable audit events and PostgreSQL persistence
- official Hermes container integration with persistent `/opt/data`

Docker/runtime:

- `compose.yaml`
- `.env.example` plus a local ignored `.env`
- `operations/phase5-6-docker-runtime.md`
- PostgreSQL, Phase 5, and Phase 6 start with `docker compose up -d --build`
- Hermes starts explicitly through the `hermes` Compose profile after interactive provider setup

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
Phase 3    Effective Context Resolver                  COMPLETE
   ↓
Phase 4    Jira → AI → Git → PR workflow              IMPLEMENTATION COMPLETE
   ↓
Phase 5    Module / New Project automation             COMPLETE
   ↓
Phase 6    Hermes Skills / Memory / continuous improvement  COMPLETE
```

Parallel operational workstream:

```text
Phase 4 Runtime Activation
   ├── Context Resolver deployment
   ├── Redis / BullMQ
   ├── PostgreSQL JobStore
   ├── Jira webhook + AI assignee
   ├── GitHub App + webhook
   ├── Agent Runner endpoint
   ├── secrets / monitoring
   └── non-production smoke test
```

Parallel product workstream:

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

Activate the Phase 4 runtime through `operations/phase4-runtime-activation.md` when infrastructure/credentials are ready, then configure the Hermes provider and messaging gateway through `operations/phase5-6-docker-runtime.md`. Production activation still requires real secret-manager values, infrastructure ownership, monitoring, and non-production smoke evidence.
