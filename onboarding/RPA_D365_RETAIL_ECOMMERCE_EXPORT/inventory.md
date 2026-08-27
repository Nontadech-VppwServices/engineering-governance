# Phase 2 Inventory — RPA D365 Retail Ecommerce Export

Date: 2026-08-27
Project ID: `RPA_D365_RETAIL_ECOMMERCE_EXPORT`
Repository: `Nontadech-VppwServices/rpa-d365-retail-ecommerce-export`

## Verified facts

### Repository

- GitHub repository exists and is accessible.
- Default branch: `main`.
- Application is private (`package.json`).

### Technology

- Language: TypeScript.
- Runtime: Node.js `>=20` from `package.json#engines.node`.
- Browser automation: Playwright `1.61.1`.
- Scheduler: `node-cron`.
- Test runner: Vitest.
- Logging: Pino.
- Validation: Zod.

### Execution model

Two execution modes are defined:

1. Scheduled runtime via `rpa-export-scheduler`.
2. Manual one-off runtime via `rpa-export`.

Docker and Docker Compose are defined in the repository.

### Quality gates

Repository scripts define:

- `npm run build`
- `npm run lint`
- `npm run typecheck`
- `npm test`

These should become minimum AI PR verification gates unless a future accepted decision changes them.

### Business/runtime contracts

The repository currently treats these documents as critical AI-facing sources:

- `docs/ai/business-login-requirements.md`
- `docs/ai/architecture-and-requirement-traceability.md`
- `docs/ai/error-logging-and-evidence.md`

The master filter file is expected at:

`SHARE_DRIVE_ROOT/Export_Filter_Master.xlsx`

Output is written beneath:

`SHARE_DRIVE_ROOT/YYYY-MM-DD`

### D365 security constraints

Verified repository requirements include:

- Do not bypass tenant authentication controls.
- Never log username/password/token/cookie.
- Stop the run when login or required company context verification fails.

## Unresolved facts

The following were not proven during onboarding and must remain unresolved until an authoritative source is identified:

1. Jira project key.
2. Technical owner.
3. Business owner.
4. Actual deployment location: AWS vs on-prem.
5. DEV/UAT/PROD branch mapping.
6. CI/CD workflow used for deployment, if any.
7. Production host/runtime identity.

## Existing documentation vs ADR

The project already has architecture/requirement documentation, but it is not yet an ADR history.

Do **not** automatically convert implementation facts into Accepted ADRs.

Examples:

- `Playwright is currently used` = verified implementation fact.
- `Playwright is the approved organization standard for D365 RPA` = architecture decision requiring an ADR and human approval.

## ADR candidates for human review

The following are candidates only, not accepted decisions:

### Candidate 1 — Playwright as D365 browser automation engine

Question: Should Playwright be the approved architecture choice for this project/domain rather than merely the current implementation?

### Candidate 2 — Docker Compose as runtime packaging model

Question: Is Docker Compose the intended production runtime standard or only a local/operational implementation?

### Candidate 3 — File-based master filter as business input contract

Question: Is `Export_Filter_Master.xlsx` a deliberate long-term integration contract, or should it later be replaced by an API/database/config service?

### Candidate 4 — Scheduled cron execution model

Question: Is application-level `node-cron` the approved scheduling architecture, or should scheduling live in infrastructure/CI/orchestration?

## Phase 2 exit assessment

Completed:

- Repository identified.
- Project ID created.
- Repository facts inventoried.
- Runtime and quality gates identified.
- Existing project truth documents identified.
- Unknown values explicitly marked instead of guessed.
- ADR candidates identified without self-approving them.

Pending before Phase 3 can provide a fully authoritative Effective Context:

- Map Jira project.
- Verify ownership.
- Verify deployment/environment model.
