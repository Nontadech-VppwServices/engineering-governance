# Phase 2.2 — Compliance and Business-Context Onboarding

Audit date: 2026-08-27

This report records observed repository/CI state against organization governance. It is evidence, not a replacement for repository-owned implementation configuration or live Jira state.

## AWS application compliance

Organization policy: `policies/testing.md` requires automated API tests and E2E tests to run as mandatory CI/CD gates before production deployment.

| Project | Repository | API gate | E2E gate | Production dependency | Status |
|---|---|---:|---:|---|---|
| PIM | `VespiarioThailand/product-information` | yes | yes | production deploy needs E2E + worker/security gates | compliant |
| VESPISTIID_PLATFORM | `VespiarioThailand/vespistiid-platform` | yes | yes | production deploy reuses `.github/workflows/ci.yml` via `needs: quality` | compliant |
| WEBSITE_CUSTOMER_FRONTEND | `VespiarioThailand/vespa-website-customer-frontend` | no verified API gate | E2E command exists but is not a production gate | production waits only for unit-test job | non_compliant |
| VESPISTIID_BACKEND | `VespiarioThailand/vespistiid-backend` | no | no | production waits only for security audit | non_compliant |
| WEBSITE_CMS | `VespiarioThailand/vespa-website-cms` | no | no | production workflow deploys directly | non_compliant |
| ECOMMERCE_CUSTOMER_FRONTEND | `VespiarioThailand/vespa-ecommerce-customer-frontend` | no | no | production waits only for security audit | non_compliant |
| ECOMMERCE_CMS | `VespiarioThailand/vespa-ecommerce-cms` | no | no | production workflow deploys directly | non_compliant |
| TMS_BACKEND | `VespiarioThailand/tms-backend` | no | no | production waits only for security audit | non_compliant |

### AWS findings requiring action

1. `WEBSITE_CUSTOMER_FRONTEND` has Playwright E2E tooling in the repository, but the production workflow executes only `yarn test` (unit tests). API + E2E must become blocking production gates.
2. `VESPISTIID_BACKEND` production has a security audit before deployment, but no API/E2E job in the production dependency chain.
3. `WEBSITE_CMS`, `ECOMMERCE_CUSTOMER_FRONTEND`, and `ECOMMERCE_CMS` require new API/E2E suites and blocking CI integration.
4. `TMS_BACKEND` requires API/E2E gates. Its production workflow also references Product Information resource names (`product-information-system-*` and a PIM URL), which must be treated as deployment-configuration drift until verified/corrected.
5. `VESPISTIID_PLATFORM` is the best current reference implementation for organization-wide CI composition: reusable quality workflow + production `needs: quality`.
6. `PIM` is also compliant and demonstrates combined Playwright UI/API reporting plus deployment dependency on tests.

## On-premise / automation compliance

For on-premise/RPA projects, API + E2E are not universally required. `policies/testing.md` requires automated verification appropriate to the automation contract and a controlled gate before production execution/deployment.

| Project | Repository | Observed automated test capability | CI/deployment gate verified | Status |
|---|---|---|---:|---|
| RPA_D365 | `VespiarioThailand/RPA-D365` | Jest test script; Playwright automation | no | partial_gap |
| RPA | `VespiarioThailand/RPA` | Python automation; no organization test gate verified | no | gap |
| RPA_AP_PO_INVOICE | `VespiarioThailand/rpa-ap-po-invoice` | no test script observed in `package.json` | no | gap |
| PDF_SIGNER | `VespiarioThailand/PDFSigner` | Python/Docker Compose; no test gate verified | no | gap |
| RPA_D365_RETAIL_ECOMMERCE_EXPORT | `VespiarioThailand/rpa-d365-retail-ecommerce-export` | Vitest + lint + typecheck | no controlled deployment gate verified | partial_gap |
| RPA_D365_INVOICE_EXPORT | `VespiarioThailand/rpa-d365-invoice-export` | Playwright test script + typecheck | no controlled deployment gate verified | partial_gap |

### Recommended minimum RPA profile

Node/Playwright RPA projects should converge on at least:

- typecheck;
- unit/parser/transformation tests where applicable;
- controlled Playwright workflow smoke/regression tests;
- idempotency/retry tests for state-changing jobs;
- Docker image/build verification when containerized;
- a deployment/execution gate that refuses promotion when mandatory tests fail.

Python automation projects should define an equivalent pytest/unittest-based profile plus smoke/file-contract tests appropriate to the workflow.

## Jira mapping

Verified mappings:

- `PIM` → Jira project `PIM` (Product Information Management).
- `TMS_BACKEND` → Jira project `TMS` (Transport Management System).

A Jira project named `RPA` exists, but individual RPA repositories are not automatically mapped to it until repository/issue-level evidence confirms the relationship. Other project mappings remain unresolved rather than inferred.

## Business context onboarding

Policy: `policies/business-context.md`.

Each governed repository should maintain stable business/domain knowledge under `docs/business/`. Live ticket state remains in Jira. Business context onboarding is considered complete only after a human/domain owner reviews the project-local document and fills verified terminology, rules, actors, integrations, and critical flows.

A project-local scaffold may be created by AI, but AI must not invent business rules. Unverified sections must remain explicitly marked for review.

## Phase 2.2 exit criteria

Phase 2.2 inventory/audit is complete when:

- organization test policy is applied to every registered project;
- current compliance/gaps are recorded;
- known Jira mappings are recorded without guessing unknown mappings;
- every project has a `docs/business/` onboarding path or explicit onboarding gap;
- configuration drift discovered during audit is recorded;
- implementation remediation is queued for later AI SDLC work rather than silently changing production behavior during governance onboarding.
