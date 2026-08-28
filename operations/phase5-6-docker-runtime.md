# Docker Runtime

## Configuration

The root `compose.yaml` automatically reads `.env`. A local ignored `.env` is included in the workspace; `.env.example` is the version-controlled template. Replace all development passwords/tokens before any shared or production deployment. Never commit the real `.env`.

## Start the governed platform

```bash
docker compose up -d --build
docker compose ps
curl --insecure https://localhost/healthz
```

This starts four long-running services: `caddy`, `postgres`, `governance-mcp`
and `hermes`. `hermes-data-init` runs once successfully before Hermes starts.
Only HTTPS ingress is published; data is retained in named volumes.

`governance-mcp` applies `sql/001_governance.sql` on start. The migration is
idempotent and preserves the table names used by the services it replaced, so an
existing database migrates in place.

Scheduled work follows `policies/hermes-scheduling-governance.md`: Hermes cron
owns timing, while approval, credentials, idempotency, retry and delivery remain
deterministic inside `governance-mcp`.

## Configure Hermes

Hermes is one service for chat and coding execution. Configure a model provider
and the LINE Messaging API values in `.env` before connecting the public webhook.

```bash
docker compose up -d hermes
```

The official image stores sessions, memory, config, cron jobs and installed
skills under the persistent `/opt/data` volume. The governance repository is
mounted read-only at `/governance`, and job workspaces are shared with
`governance-mcp` at `/workspaces`.

`hermes-data-init` redeploys `config.yaml` on every start, and seeds
`cron/jobs.json` only when it is absent. Skills are mounted read-only, so a
newly published generated skill is visible to new sessions without a copy step.

```bash
docker compose restart hermes
```

Keep `HERMES_IMAGE` pinned to the reviewed digest.

## Reset local development data

`docker compose down` preserves data. `docker compose down -v` deletes
PostgreSQL, workspaces, generated skills, Caddy state and Hermes state —
including cron jobs and memory. Use it only when that destructive reset is
intended.
