# Production AI SDLC Runtime

## Activation

1. Copy `.env.example` to `.env`, replace all placeholders, and run `chmod 600 .env`.
2. Configure DNS for `PUBLIC_DOMAIN` and allow inbound TCP 80/443; Caddy obtains and renews TLS.
3. Configure Jira and GitHub webhook secrets and assign eligible Jira issues to an account listed in `JIRA_AI_ASSIGNEE_ACCOUNT_IDS`.
4. Configure the LINE Messaging API webhook at `https://PUBLIC_DOMAIN/line/webhook`; keep `LINE_ALLOW_ALL_USERS=false`.
5. Verify GitHub branch protection, required checks, auto-merge and protected Environment reviewers before enabling deployment actions.
6. Start with `docker compose up -d --build` and confirm `docker compose ps` reports all long-running services healthy.
7. After a reviewed Phase 6 skill is published, an admin sends `/reload-skills` to Hermes Chat in a private session and runs `docker compose restart hermes-coder` for the non-messaging coder profile. The generated skill volume is mounted read-only and directly, so no copy/sync job is required.

## Smoke checks

- `GET https://PUBLIC_DOMAIN/healthz` returns 200.
- Unsigned LINE, Jira and GitHub webhook requests return 401.
- Hermes logs contain `LINE: webhook listening` and `line connected`.
- A duplicate RPA `event_id` returns `duplicate=true` and creates no second record.
- A LINE group action creates a draft but cannot confirm until the requester uses a 1:1 chat.

## Guardrails

The Agent Runner and Hermes Coder have no production credentials. LINE can request auto-merge or CI deployment, but GitHub protections remain authoritative. Production deployment remains pending until a GitHub Environment reviewer approves it. Rotate integration and internal service tokens through `.env`, recreate only affected services, and never commit `.env`.
