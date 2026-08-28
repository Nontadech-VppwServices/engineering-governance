# Production AI SDLC Runtime

Four long-running services: `caddy`, `postgres`, `governance-mcp`, `hermes`.
See `decisions/adr/global/ADR-GLOBAL-010-hermes-first-consolidation.md`.

## Activation

1. Copy `.env.example` to `.env`, replace all placeholders, and run `chmod 600 .env`.
2. Configure DNS for `PUBLIC_DOMAIN` and allow inbound TCP 80/443; Caddy obtains and renews TLS.
3. Generate `GOVERNANCE_MCP_TOKEN`, `JOB_TOKEN_SIGNING_SECRET` and `PRINCIPAL_SIGNING_SECRET` independently. They rotate separately; do not reuse one value for two of them.
4. Assign eligible Jira issues to an account listed in `JIRA_AI_ASSIGNEE_ACCOUNT_IDS`, within a project listed in `JIRA_ALLOWED_PROJECT_KEYS`.
5. Configure the LINE Messaging API webhook at `https://PUBLIC_DOMAIN/line/webhook`; keep `LINE_ALLOW_ALL_USERS=false`.
6. Verify GitHub branch protection, required checks, auto-merge and protected Environment reviewers before enabling deployment actions.
7. Start with `docker compose up -d --build` and confirm `docker compose ps` reports four long-running services healthy; `hermes-data-init` must report successful completion.
8. Confirm Hermes discovered the boundary: `docker compose logs hermes | grep -i mcp` should list the governance server and its tools.

## Model provider

`hermes/config.yaml` points at a local Ollama endpoint through
`host.docker.internal`. The compose file sets `extra_hosts` so this resolves on
a plain Linux daemon as well as Docker Desktop. To use a hosted provider
instead, set the corresponding key in `.env` and change the `model` block.

## Schedules

Jira intake and the daily, weekly and monthly RPA reports are Hermes cron jobs.
They are seeded from `hermes/cron/jobs.json` **only when absent**, so an
operator's pause or revoke survives a restart. Inspect and manage them with
`/cron` in a private admin session.

Changing a seeded schedule in Git does not change a running deployment. Apply
the change through `/cron`, or delete `/opt/data/cron/jobs.json` in the
`hermes-data` volume to re-seed from the file — which discards every runtime
change including revocations.

## Skills

Three skills are mounted read-only from the repository:
`engineering-governance`, `ai-sdlc-execution`, `rpa-reporting`. Approved
generated skills arrive through the `generated-skills` volume.

After a reviewed Phase 6 skill is published, an admin sends `/reload-skills` to
Hermes in a private session. Editing a mounted skill file in the repository
requires `docker compose restart hermes`.

## Smoke checks

- `GET https://PUBLIC_DOMAIN/healthz` returns 200.
- Unsigned LINE webhook requests return 401.
- Hermes logs contain `LINE: webhook listening` and `line connected`.
- `docker compose exec hermes env | grep -E 'JIRA_|GITHUB_TOKEN'` returns nothing. Hermes must hold no provider credential.
- `governance-mcp` `/healthz` reports `outbox: ready`; a stalled outbox worker returns 503.
- A duplicate RPA `event_id` returns `duplicate=true` and creates no second record.
- A LINE group action creates a draft but cannot confirm until the requester uses a 1:1 chat.
- A commit or PR request before `run_quality_gate` has recorded a passing verdict is refused with `QUALITY_GATES_NOT_VERIFIED`.

## Guardrails

Hermes has no provider or production credentials; `GOVERNANCE_MCP_TOKEN` only
authenticates it to the boundary. The Git credential is supplied through
`GIT_ASKPASS` and never written into a workspace.

LINE can request auto-merge or CI deployment, but GitHub protections remain
authoritative and production deployment stays pending until a GitHub Environment
reviewer approves it. Merge is not an available tool.

Rotate tokens through `.env`, recreate only affected services, and never commit
`.env`. Rotating `JOB_TOKEN_SIGNING_SECRET` invalidates in-flight job tokens;
affected jobs must re-run `prepare_workspace`.
