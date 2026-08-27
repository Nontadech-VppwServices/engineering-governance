# Phase 5 Project Automation Reference

Reference service for governed New Module and New Project planning.

- idempotent plan creation by `request_id`
- Effective Context gate for New Module
- accepted golden-archetype selection for New Project
- named human approval gate
- deterministic staging-only project scaffolds
- Phase 4 handoff for approved module work
- PostgreSQL persistence and authenticated HTTP API

The service never creates a remote repository, pushes, merges, or deploys production.

## API

All `/v1` routes require `Authorization: Bearer $PHASE5_API_TOKEN`.

- `POST /v1/plans`
- `GET /v1/plans/{planId}`
- `POST /v1/plans/{planId}/approve` with `X-Actor-Id` and `X-Actor-Type: human`
- `POST /v1/plans/{planId}/execute`
- `GET /healthz`

Use the repository-root Compose stack for runtime instructions.
