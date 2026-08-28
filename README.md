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
11. Hermes is the required execution entry point for any approved capability it can safely and reliably perform; alternatives require a documented bounded exception that preserves required control-plane boundaries.

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
- `schemas/effective-context.schema.json` (the Effective Context contract; the standalone HTTP API was removed by ADR-GLOBAL-010 and is now the `get_effective_context` tool)

Reference TypeScript service:

- `reference/governance-mcp/` (`get_effective_context`)
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

- `.github/workflows/governance-validation.yml`
- JSON schema validation
- TypeScript typecheck
- resolver/service/HTTP tests

Effective Context is a computed view, never a replacement for Jira/GitHub/ADR/BDR/policy sources.

### Phase 4 — Jira → AI → Git → PR — Runtime Complete

Phase 4 has an executable runtime, Docker image, PostgreSQL migrations and a governed tool surface. Since Phase 4.3 the lifecycle is driven by the `ai-sdlc-execution` skill over `governance-mcp` rather than by a queue-backed orchestrator service. Connecting real Jira/GitHub credentials remains an operator activation step.

Governance/contracts:

- `decisions/adr/global/ADR-GLOBAL-005-phase4-ai-sdlc-orchestration.md`
- `policies/phase4-orchestration.md`
- `schemas/jira-ai-intake-event.schema.json`
- `schemas/ai-sdlc-job.schema.json`
- `schemas/agent-execution-request.schema.json`
- `schemas/agent-execution-result.schema.json`

Reference TypeScript orchestrator:

- `reference/governance-mcp/` (job lifecycle tools)
- scheduled Jira intake filtered by configured AI SDLC assignee and project allowlist
- idempotent job creation on the intake event ID
- PostgreSQL durable job store with server-validated state transitions
- Effective Context resolution from governance SSOT
- Jira REST comment/status synchronization
- project-aware Jira destination-status mapping without hard-coded transition IDs
- GitHub REST branch/PR adapter
- multi-repository PR creation
- New Module → Phase 5 approval → signed/idempotent Phase 4 handoff
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

- `.github/workflows/platform-runtime-validation.yml`
- Phase 4 JSON schema validation
- TypeScript typecheck/tests/build

Runtime activation checklist:

- `operations/phase4-runtime-activation.md`

### Phase 4.1 — Hermes Execution Plane Alignment — Complete

Accepted architecture:

- `decisions/adr/global/ADR-GLOBAL-008-hermes-execution-plane.md`
- `policies/hermes-execution-plane.md`
- `hermes/skills/ai-sdlc-execution/SKILL.md`

The runtime explicitly separates deterministic control from model reasoning:

```text
Hermes Execution Plane
  ├── ANALYZE   read-only
  ├── PLAN      read-only
  └── IMPLEMENT controlled file edits
             ↓ MCP
governance-mcp
  ├── Jira intake / idempotency
  ├── durable job state, server-validated transitions
  ├── Effective Context / routing
  ├── approval / authorization
  ├── quality gates + recorded verdicts
  ├── Git commit/push
  └── PR / deployment boundaries
             ↓
Pull Request
```

Hermes is the default **AI reasoning/execution plane**, but never the authoritative control plane or source of truth.

### Phase 4.2 — AI SDLC MCP Tool Boundary — Complete

Accepted architecture and policy:

- `decisions/adr/global/ADR-GLOBAL-009-ai-sdlc-mcp-tool-boundary.md`
- `policies/ai-sdlc-mcp.md`
- `policies/hermes-execution-plane.md`
- `ssot/mcp/ai-sdlc-tools.yaml`
- `schemas/ai-sdlc-mcp-scope.schema.json`

Reference implementation:

- `reference/governance-mcp/`
- MCP TypeScript SDK v2 server factory
- immutable job-scoped execution scope
- Effective Context/Jira read tools
- scoped repository search/read tools
- named quality-gate tool with no arbitrary shell command
- controlled branch/commit/push/PR requests backed by trusted ports
- trusted quality verdict required before commit/push/PR
- scoped sanitized Jira comment tool
- repository/path/phase/branch guards
- hard no-merge/no-production/no-production-secret authority
- regression tests and `.github/workflows/platform-runtime-validation.yml`

The standard Hermes integration path is now:

```text
Jira / GitHub / LINE
     ↓
Hermes Execution Plane
     ↓ native MCP client, signed job token
governance-mcp tool boundary
     ↓ server-side scope / phase / permission authorization
Context / Jira / repository / quality gates / controlled Git requests
     ↓
Pull Request
     ↓
Human + GitHub Actions
     ↓
DEV / UAT / PROD
```

MCP is a capability facade that reduces provider/tool integration complexity. It does not replace the job store, Effective Context, the recorded quality verdict, or the human production boundary — ADR-GLOBAL-010 moved those into `governance-mcp` rather than removing them.

### Phase 5 — Module / New Project Automation — Complete

Governance/contracts:

- `decisions/adr/global/ADR-GLOBAL-006-phase5-project-automation.md`
- `policies/phase5-project-automation.md`
- `schemas/project-automation-request.schema.json`
- `schemas/project-automation-plan.schema.json`

Reference TypeScript service:

- `reference/governance-mcp/` (`create_plan`)
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

- `reference/governance-mcp/` (`record_observation`, `propose_skill_change`)
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
- `operations/production-runtime.md`
- generated skills are mounted read-only

### Phase 4.3 — Hermes-First Consolidation — Complete

Accepted architecture decision:

- `decisions/adr/global/ADR-GLOBAL-010-hermes-first-consolidation.md`

The runtime is **four long-running services**: `caddy`, `postgres`, `hermes` and
`governance-mcp`. Eight hand-written services were consolidated into one
deterministic boundary; Redis, BullMQ and all inter-service HTTP authentication
were removed.

```text
LINE ──► caddy ──► hermes  (execution plane)
                    │  reasoning, orchestration, scheduling, formatting
                    │  skills + memory + cron
                    │
                    │  MCP — carries no provider credential
                    ▼
              governance-mcp  (deterministic boundary)
                    │  credential custody, human approval, quality verdicts,
                    │  Git authority, delivery guarantees
                    ▼
                 postgres
```

**Hermes owns** the order in which steps run, analysis, planning and
implementation, scheduling through native cron, report rendering, PR and Jira
prose, and project scaffolding written from the registered archetype.

**`governance-mcp` owns** everything an incorrect model output must not be able
to cause:

- Jira, GitHub and LINE-push credentials — Hermes holds none of them, and the
  Git credential never reaches the workspace
- human approval: draft/confirm with TTL, idempotency, role checks and the
  1:1-confirmation rule
- quality-gate execution and the *recorded* verdict that gates commit, push and
  PR — an agent asserting that tests passed is not evidence
- Git commit and push, only to the pre-approved working branch; merge is never
  exposed as a tool
- job state transitions, validated against the state machine
- Effective Context resolution, routing and conflict decisions
- a transactional outbox with retry, backoff and dead-lettering
- idempotency keys, dedup windows and secret redaction

Execution scope is a per-call HMAC-signed job token minted in
`prepare_workspace` from Effective Context. Hermes carries it but cannot mint
one or widen the one it holds.

Supporting governance:

- `reference/governance-mcp/`
- `ssot/mcp/ai-sdlc-tools.yaml` — the tool allowlist, enforced against
  `hermes/config.yaml` and the server source by CI
- `hermes/cron/jobs.json` — seeded schedules for Jira intake and the daily,
  weekly and monthly RPA reports
- `.github/workflows/platform-runtime-validation.yml`

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

RPA bots emit normalized run events through `ingest_rpa_event`, which stores history and deduplicates on `event_id`. A Hermes scheduled task renders the daily, weekly and monthly summaries in `Asia/Bangkok` and delivers them through the deterministic outbox to the **LINE Messaging API / LINE Official Account**. Bots must not own LINE credentials or independent scheduled-report logic.

## Planned evolution

```text
Phase 0    Governance foundation                            COMPLETE
   ↓
Phase 1    Registry + ADR/BDR standards                    COMPLETE
   ↓
Phase 2    PIM pilot onboarding                            COMPLETE
   ↓
Phase 2.1  Organization project inventory                  COMPLETE
   ↓
Phase 2.2  Compliance + business-context onboarding        COMPLETE
   ↓
Phase 2.3  Jira repository routing                         COMPLETE
   ↓
Phase 3    Effective Context Resolver                       COMPLETE
   ↓
Phase 4    Jira → AI → Git → PR workflow                   RUNTIME COMPLETE
   ↓
Phase 4.1  Hermes Execution Plane alignment                COMPLETE
   ↓
Phase 4.2  AI SDLC MCP Tool Boundary                       COMPLETE
   ↓
Phase 5    Module / New Project automation                  COMPLETE
   ↓
Phase 6    Hermes Skills / Memory / continuous improvement COMPLETE
```

Production runtime:

```text
Docker Compose / internal runtime — four services
   ├── caddy            HTTPS ingress, LINE webhook only
   ├── postgres         jobs, actions, plans, learning, events, outbox, audit
   ├── hermes           execution plane: analyze / plan / implement,
   │                    skills, memory, cron intake and reports
   └── governance-mcp   deterministic boundary
        ├── provider credentials (Jira / GitHub / LINE push)
        ├── Effective Context + routing
        ├── human approval: draft / confirm
        ├── quality gates + recorded verdicts
        ├── Git commit / push, PR (never merge)
        └── outbox: retry / dead-letter / audit
```

Central reporting:

```text
governance-mcp                     hermes
   ├── ingest_rpa_event               ├── cron: daily / weekly / monthly
   ├── durable reporting store        ├── rpa-reporting skill renders
   ├── query_rpa_metrics       ◄──────┘   the summary
   └── send_line_message → outbox → LINE Messaging API
```

## Governance rule

When documentation, Hermes output/memory, cached data, and authoritative systems disagree, follow `ssot/precedence.yaml` and report the conflict instead of silently guessing which value is correct.

## Next step

Validate and activate the integrated runtime using non-production Jira/GitHub credentials and smoke evidence. Hermes should be configured as the default execution provider with the governed AI SDLC MCP tool boundary, while production merge/deployment and authoritative workflow decisions remain behind the deterministic Control Plane and human/policy gates.
