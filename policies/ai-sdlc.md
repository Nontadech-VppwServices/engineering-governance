# AI SDLC Policy

## Goal

Define safe boundaries for AI participation in the software development lifecycle.

## Default permissions

AI may, when permitted by the project registry:

- read Jira work items
- read governance context
- read repositories
- create branches
- modify code in non-protected branches
- run tests, lint, type checks, and builds
- commit and push to AI-owned branches
- create pull requests
- comment status/results back to Jira
- draft ADR/BDR records

AI must not by default:

- merge pull requests
- deploy directly to production
- access production credentials
- bypass CI/CD
- bypass required reviewers
- modify accepted governance decisions directly
- silently ignore architecture drift
- treat its memory as authoritative

## Human approval gates

Human approval is required before:

- accepting ADRs or BDRs
- merging AI-generated changes during the initial rollout
- production deployment
- database migration with destructive risk
- security/authentication architecture changes
- infrastructure changes with production impact
- exceptions to global/domain decisions

## Deployment rule

Deployment execution belongs to CI/CD.

```text
AI → Branch → PR → Human/Policy Gate → Merge → GitHub Actions → Environment
```

Direct AI SSH or direct AI production deployment is prohibited unless a future explicit policy supersedes this rule.

## Work-type routing

AI SDLC work is classified into:

1. Bug Fix
2. New Module
3. New Project

New Project is further classified into:

- AWS
- On-Premise Docker

Each work type must use its own controlled workflow/skill.

## Traceability

Where applicable, every AI implementation should be traceable across:

```text
BDR / Requirement
→ ADR
→ Jira
→ Branch
→ PR
→ Commit
→ CI/CD run
→ Deployment
```

## Failure rule

When information is missing, contradictory, or not authoritative, AI must stop or downgrade to analysis/draft mode rather than fabricate a value.
