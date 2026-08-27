# Project Registry

This directory contains one YAML file per governed project.

## Naming

Use the canonical project ID as the filename. The canonical `project.id` must remain stable even if repository names or Jira projects change.

## Purpose

A project registry file is a directory of stable identities, governance state, and pointers to authoritative sources — not a copy of all project documentation.

It should identify:

- canonical project ID, name, domain, and project type
- ownership or explicit unverified state
- Jira mapping or explicit `unmapped` state
- Git repository and default branch
- deployment model
- environment mapping when verified
- applicable testing policy and current compliance state
- business-context location/onboarding state
- project ADR/BDR locations when onboarded
- AI permissions

Do not duplicate values such as runtime versions when the project repository already has an authoritative source such as `.nvmrc`, `package.json`, `go.mod`, `Dockerfile`, or migration/schema files.

## Organization inventory

The cross-project grouping is maintained in:

```text
inventory/organization-projects.yaml
```

Current governed inventory includes:

### AWS applications

- `WEBSITE_CUSTOMER_FRONTEND`
- `VESPISTIID_BACKEND`
- `VESPISTIID_PLATFORM`
- `WEBSITE_CMS`
- `ECOMMERCE_CUSTOMER_FRONTEND`
- `ECOMMERCE_CMS`
- `TMS_BACKEND`
- `PIM` (existing pilot)

AWS application projects follow `policies/testing.md`; API and E2E tests are mandatory minimum production gates.

### On-premise / automation

- `RPA_D365`
- `RPA`
- `RPA_AP_PO_INVOICE`
- `PDF_SIGNER`
- `RPA_D365_RETAIL_ECOMMERCE_EXPORT`
- `RPA_D365_INVOICE_EXPORT`

On-premise automation uses project-appropriate automated quality gates as defined by `policies/testing.md`.

## Business context

Projects should onboard stable business/domain knowledge under `docs/business/` according to `policies/business-context.md`.

Jira remains authoritative for live implementation work items and workflow state; do not manually mirror Jira ticket state into Git.

## Validation

Project files should conform to `schemas/project.schema.json`.
