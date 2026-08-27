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

Governance foundations:

- `ssot/authority-map.yaml` — authoritative-source map.
- `ssot/precedence.yaml` — conflict/precedence rules.

### Phase 1 — Complete

Governance standards:

- `ssot/projects/` — central project registry.
- `templates/PROJECT.yaml` — project registry template.
- `templates/ADR.md` — Architecture Decision Record template.
- `templates/BDR.md` — Business Decision Record template.
- `decisions/adr/global/` — organization-wide ADRs.
- `decisions/adr/domain/` — domain-level ADRs.
- `decisions/bdr/global/` — organization-wide BDRs.
- `decisions/bdr/domain/` — domain-level BDRs.
- `policies/decision-resolution.md` — decision hierarchy, superseding, exceptions, and drift rules.
- `policies/ai-sdlc.md` — AI permissions and human approval boundaries.
- `policies/git.md` — AI-assisted Git workflow rules.
- `policies/deployment.md` — CI/CD and production deployment rules.
- `policies/project-standard.md` — minimum requirements for onboarding projects.
- `schemas/project.schema.json` — project registry metadata schema.
- `schemas/adr.schema.json` — ADR metadata schema.
- `schemas/bdr.schema.json` — BDR metadata schema.

### Phase 2 — Complete

Pilot project: `PIM` — Product Information Management

Central artifacts:

- Registry: `ssot/projects/PIM.yaml`
- Inventory: `onboarding/PIM/inventory.md`

Project-local artifacts in `VespiarioThailand/product-information`:

- `.ai/project.yaml`
- `docs/ai-governance/onboarding-inventory.md`
- `docs/adr/README.md`
- `docs/bdr/README.md`

Verified during onboarding:

- Jira project key `PIM` and Product Information Management project identity.
- Git repository `VespiarioThailand/product-information` and default branch `main`.
- TypeScript / Next.js / Node.js container runtime.
- Prisma + PostgreSQL database contract.
- Docker multi-stage application build.
- GitHub Actions CI/CD.
- UAT: branch `uat` -> quality/security gates -> ECR -> ECS.
- Production: `prod-*` tag -> quality/security gates -> ECR -> ECS.
- AWS ECS/Fargate deployment architecture in `ap-southeast-7`.
- AWS Secrets Manager as runtime secret source.
- Security audit, worker tests, build, and Playwright E2E quality gates.

Explicitly unresolved rather than guessed:

- technical owner
- business owner
- DEV deployment mapping

No implementation fact was automatically promoted to an Accepted ADR. Architecture candidates require human review before they become authoritative decisions.

## Planned evolution

```text
Phase 0  Governance foundation                         COMPLETE
   ↓
Phase 1  Project registry + ADR/BDR standards         COMPLETE
   ↓
Phase 2  PIM pilot onboarding                         COMPLETE
   ↓
Phase 3  Effective Context Resolver
   ↓
Phase 4  Jira → AI → Git → PR workflow
   ↓
Phase 5  Module / New Project automation
   ↓
Phase 6  Hermes Skills / Memory / continuous improvement
```

## Governance rule

When documentation, AI memory, cached data, and authoritative systems disagree, follow `ssot/precedence.yaml` and report the conflict instead of silently guessing which value is correct.

## Next step

Build Phase 3 Effective Context Resolver using `PIM` as the first project. The resolver should combine the central registry, applicable policies and decisions, project-local `.ai/project.yaml`, repository truth pointers, approved exceptions, and unresolved/conflict flags into one effective context response.
