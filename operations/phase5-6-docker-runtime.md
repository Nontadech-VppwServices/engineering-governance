# Phase 5–6 Docker Runtime

## Configuration

The root `compose.yaml` automatically reads `.env`. A local ignored `.env` is included in the workspace; `.env.example` is the version-controlled template. Replace all development passwords/tokens before any shared or production deployment. Never commit the real `.env`.

## Start the governed platform

```bash
docker compose up -d --build
docker compose ps
curl --insecure https://localhost/healthz
```

This starts PostgreSQL, Redis, Context Resolver, Phase 4–6, Workflow Control, Agent Runner, reporting, Hermes Chat/Coder and Caddy. Only HTTPS ingress is published; data is retained in named volumes.

Phase 4, Phase 5 and deployment state changes are posted to the reporting service as versioned workflow events. Each accepted event creates at most one outbox delivery. After publishing a generated skill, use Hermes Chat `/reload-skills` in a private admin session and restart only `hermes-coder` to perform the controlled live reload.

## Configure Hermes

Hermes Chat and Hermes Coder are separate default services. Configure a supported provider and LINE Messaging API values in `.env` before connecting the public webhook.

```bash
docker compose up -d hermes-chat hermes-coder
```

Set at least one supported model-provider key in `.env` before starting Hermes. The official image stores sessions, memory, config, and installed skills under the persistent `/opt/data` volume. The governance repository is mounted read-only.

The initialization service prepares writable Hermes data volumes. The governed seed skill and approved generated-skill volume are mounted read-only; a newly published generated skill is visible to new Hermes sessions without copying it into a second volume.

```bash
docker compose restart hermes-chat hermes-coder
```

Chat and Coder use distinct data volumes. Do not point them at the same `/opt/data`. Keep `HERMES_IMAGE` pinned to the reviewed digest.

## Reset local development data

`docker compose down` preserves data. `docker compose down -v` deletes PostgreSQL, Redis, workspaces, generated scaffolds, generated skills, Caddy state and Hermes state; use it only when that destructive reset is intended.
