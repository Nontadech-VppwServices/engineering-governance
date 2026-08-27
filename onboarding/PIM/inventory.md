# Phase 2 Onboarding Inventory — PIM

Project ID: `PIM`
Project: Product Information Management
Repository: `VespiarioThailand/product-information`
Jira project key: `PIM`
Status: Pilot onboarding complete with explicit unresolved ownership/DEV deployment mapping.

## Verified authoritative sources

| Information | Authority | Source |
|---|---|---|
| Project identity | engineering-governance | `ssot/projects/PIM.yaml` |
| Work items and status | Jira | project `PIM` |
| Source code and implementation config | project repository | `VespiarioThailand/product-information` |
| Project AI context pointer | project repository | `.ai/project.yaml` |
| Database schema | project repository | `prisma/schema.prisma` |
| UAT CI/CD | project repository | `.github/workflows/uat.yml` |
| Production CI/CD | project repository | `.github/workflows/prod.yml` |
| CI/CD implementation guidance | project repository | `.github/instructions/ci-cd.instructions.md` |
| Project ADRs | project repository | `docs/adr/` |
| Project BDRs | project repository | `docs/bdr/` |

## Verified implementation facts

### Application/runtime

- TypeScript application.
- Next.js application with React.
- Container runtime uses Node.js 22 Alpine.
- Application and workers run as part of the same deployable runtime.
- Docker multi-stage build is used.

### Data

- PostgreSQL is the database engine.
- Prisma schema at `prisma/schema.prisma` is authoritative for application database schema.
- CI E2E uses PostgreSQL with pgvector support.

### Application capabilities observed

- AWS SDK integrations include S3, SQS, and DynamoDB clients.
- Authentication stack includes Passport/SAML and JWT-related libraries.
- OCR stack includes esearch-ocr and ONNX Runtime.
- Help/Q&A functionality includes Ollama-based chat/embedding capability with keyword fallback.
- Background workers include export, import, email, file, and print workers.

### Testing and quality gates

Verified repository scripts/workflows include:

- build
- lint
- Vitest tests
- worker unit tests
- Playwright E2E tests
- dependency security audit

UAT and Production workflows block deployment when required quality/security gates fail.

## Deployment

### UAT — verified

Flow:

```text
push to uat
  -> GitHub Actions
  -> security audit / worker tests / E2E
  -> Docker build
  -> Amazon ECR
  -> Amazon ECS
```

Verified properties:

- branch: `uat`
- AWS region: `ap-southeast-7`
- platform: ECS/Fargate architecture
- registry: ECR
- secrets: AWS Secrets Manager

### Production — verified

Flow:

```text
main + prod-* tag
  -> GitHub Actions
  -> security audit / worker tests / E2E
  -> Docker build
  -> Amazon ECR
  -> Amazon ECS
```

Production deployment is tag-gated using `prod-*`.

### DEV — unresolved

The `dev` branch exists, but onboarding did not verify a corresponding DEV deployment workflow/runtime. Do not infer one until an authoritative deployment source is found.

## Jira mapping

Verified Jira project:

- key: `PIM`
- name: Product Information Management

This establishes the initial mapping:

```text
Jira PIM
  <-> engineering-governance project PIM
  <-> VespiarioThailand/product-information
```

## Project-local governance

The repository contains:

```text
.ai/project.yaml
docs/ai-governance/onboarding-inventory.md
docs/adr/README.md
docs/bdr/README.md
```

The project-local `.ai/project.yaml` identifies the project and points agents to the relevant local authoritative sources. It must not override organization governance.

## Architecture Decision candidates

The following are implementation facts that may warrant ADRs after human review. They are NOT automatically accepted decisions:

1. AWS ECS Fargate as the PIM application runtime.
2. GitHub Actions -> ECR -> ECS as deployment architecture.
3. UAT auto-deployment from branch `uat`.
4. Production deployment using `prod-*` tags.
5. Next.js and background workers co-located in one container/runtime.
6. Prisma + PostgreSQL as application persistence architecture.
7. Security audit + worker tests + E2E as required deployment gates.
8. AWS Secrets Manager as runtime secret authority.

## Unresolved facts

- Technical owner.
- Business owner.
- DEV deployment mapping.

These values must remain unresolved until verified from an authoritative source.

## Phase 2 exit criteria

- [x] Central project ID established.
- [x] Git repository verified.
- [x] Jira project verified.
- [x] Runtime inventory completed.
- [x] Database source identified.
- [x] UAT deployment mapping verified.
- [x] Production deployment mapping verified.
- [x] Project-local AI context created.
- [x] ADR/BDR locations established.
- [x] Architecture candidates recorded without auto-acceptance.
- [x] Unknown facts explicitly recorded.

PIM is ready to be used as the Phase 3 Effective Context Resolver pilot.
