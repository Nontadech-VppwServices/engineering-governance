# Phase 6 Hermes Governance Reference

This service governs Hermes memory and self-improving skills without treating them as sources of truth.

- non-authoritative memory with provenance, lifecycle, expiry, and secret-content rejection
- scoped active-memory retrieval with an authority warning
- execution observations
- skill proposal → evaluation → human approval → publication lifecycle
- two-person approval for high-risk skill changes
- immutable audit events
- PostgreSQL persistence and an authenticated HTTP API

All `/v1` routes require `Authorization: Bearer $PHASE6_API_TOKEN`. Human review routes additionally require `X-Actor-Id` and `X-Actor-Type: human`.

Routes:

- `POST/GET /v1/memories`
- `POST /v1/memories/{id}/revoke`
- `POST /v1/observations`
- `POST /v1/proposals`
- `GET /v1/proposals/{id}`
- `POST /v1/proposals/{id}/evaluate`
- `POST /v1/proposals/{id}/approve`
- `POST /v1/proposals/{id}/reject`
- `POST /v1/proposals/{id}/publish`
- `GET /healthz`

Published candidates are written below `HERMES_GENERATED_SKILLS_DIR`, which is shared with the Hermes runtime by the root Compose stack.
