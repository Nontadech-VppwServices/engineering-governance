# Effective Context Resolver — Reference Service

This directory contains the Phase 3 TypeScript reference implementation of the Effective Context Resolver.

It is split into three layers:

1. **Source ports/adapters** — Jira, project registry, RPA routing, GitHub/repository discovery, repository facts, governance/business context.
2. **Resolver core** — deterministic routing validation, conflict evaluation, permissions and Effective Context assembly.
3. **HTTP adapter** — exposes the versioned Context Resolver API without embedding provider-specific credentials or SDKs in the core.

The core must not call an LLM directly. AI-assisted repository discovery may supply candidate repositories plus evidence/confidence through `RepositoryDiscoverySource`, but routing/conflict/permission output remains deterministic and policy-driven.

## Runtime architecture

```text
Atlassian/Jira Adapter ─────────────┐
Project Registry Adapter ───────────┤
RPA Routing Adapter ────────────────┤
GitHub Repository Discovery ────────┤
GitHub Repository Facts ────────────┤
Governance/Business Loader ─────────┤
                                   ▼
                         ContextResolverService
                                   │
                         two-pass repository resolve
                                   │
                                   ▼
                         Context Resolver Core
                                   │
                                   ▼
                         Effective Context v1
                                   │
                                   ▼
                            HTTP API Adapter
                                   │
                     ┌─────────────┼─────────────┐
                     ▼             ▼             ▼
                   Hermes        Codex         Claude
```

## Why two-pass resolution

RPA repository routing is deterministic from the Jira Component and becomes known only after routing evaluation. Application routing may be supplied by repository discovery. The service therefore:

1. loads Jira/project/governance inputs;
2. performs a preliminary routing pass;
3. inspects only the routed repositories;
4. performs the final Effective Context assembly with repository facts attached.

This prevents unrelated repositories from entering the final context and ensures RPA facts are loaded from the Component-selected repository.

## Source port contract

Defined in `src/ports.ts`:

- `JiraSource`
- `ProjectRegistrySource`
- `RpaRoutingSource`
- `RepositoryDiscoverySource`
- `RepositoryFactSource`
- `GovernanceSource`

Provider-specific production adapters are intentionally outside the deterministic core. Phase 4 can implement Atlassian and GitHub adapters against these ports without changing the Effective Context schema.

`src/adapters/static.ts` provides an in-memory/static adapter used for tests and local integration examples.

## HTTP endpoints

- `GET /healthz`
- `POST /v1/context/resolve`
- `GET /v1/projects/{projectId}/context`

The HTTP adapter returns structured 400/404/503 resolver errors and never caches Effective Context responses at the HTTP layer (`Cache-Control: no-store`).

## Core responsibilities

- validate deterministic RPA Component routing;
- accept evidence-based application repository candidates;
- support one issue → many repositories;
- carry known architecture/configuration/compliance drift;
- convert blocking conflicts into `can_modify_code=false`;
- never enable production deployment for AI;
- preserve source metadata/freshness;
- inspect repository facts only after repository routing is established.

## Non-responsibilities

- storing production credentials;
- deploying applications;
- accepting ADR/BDR decisions;
- replacing Jira/GitHub as source of truth;
- choosing a repository purely from an ungrounded LLM guess.

## Run locally

```bash
npm install
npm test
npm run typecheck
```

The current reference service can later be moved into a dedicated private service repository without changing the schemas/OpenAPI contract in `engineering-governance`.
