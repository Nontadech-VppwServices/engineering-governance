# Phase 5–6 Docker Runtime

## Configuration

The root `compose.yaml` automatically reads `.env`. A local ignored `.env` is included in the workspace; `.env.example` is the version-controlled template. Replace all development passwords/tokens before any shared or production deployment. Never commit the real `.env`.

## Start the governed services

```bash
docker compose up -d --build
docker compose ps
curl http://localhost:8085/healthz
curl http://localhost:8086/healthz
```

This starts PostgreSQL, Phase 5 Project Automation, and Phase 6 Hermes Governance. Data is retained in named volumes.

## Configure and start Hermes

Hermes is opt-in through the `hermes` profile because first use requires an interactive provider/messaging setup.

```bash
docker compose --profile hermes run --rm hermes setup
docker compose --profile hermes up -d hermes
```

Set at least one supported model-provider key in `.env` before starting Hermes. The official image stores sessions, memory, config, and installed skills under the persistent `/opt/data` volume. The governance repository is mounted read-only.

Before the gateway starts, the one-shot `hermes-skill-sync` service copies the governed seed skill and approved generated candidates into the persistent Hermes data volume with the configured `HERMES_UID`/`HERMES_GID`. After publishing another generated skill, sync it and restart Hermes (or start a fresh session) so Hermes can discover it:

```bash
docker compose --profile hermes run --rm hermes-skill-sync
docker compose --profile hermes restart hermes
```

Do not run two Hermes gateway containers against the same `hermes-data` volume. Pin `HERMES_IMAGE` to an immutable version/digest for controlled environments.

## Reset local development data

`docker compose down` preserves data. `docker compose down -v` deletes PostgreSQL, generated scaffolds, generated skills, and Hermes state; use it only when that destructive reset is intended.
