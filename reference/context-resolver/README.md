# Effective Context Resolver — Reference Core

This directory contains a small deterministic TypeScript reference implementation for Phase 3.

It is intentionally split into:

- **adapters** (future/runtime): Jira, GitHub, governance file loading, code search, cache;
- **core** (this reference): routing validation, conflict evaluation, precedence-facing decision output, Effective Context assembly.

The core must not call an LLM. AI-assisted repository discovery may provide candidate evidence to the core, but final routing/conflict/permission output is deterministic and policy-driven.

## Suggested production service

```text
HTTP API
  ↓
Jira Adapter ─────┐
GitHub Adapter ───┤
Governance Loader ┤
Business Loader ──┤
Compliance Loader ┤
                  ▼
          Context Resolver Core
                  ↓
        Effective Context v1
                  ↓
      Hermes / Codex / Claude
```

## Core responsibilities

- validate deterministic RPA Component routing;
- accept evidence-based application repository candidates;
- support one issue → many repositories;
- carry known architecture/configuration/compliance drift;
- convert blocking conflicts into `can_modify_code=false`;
- never enable production deployment for AI;
- preserve source metadata/freshness.

## Non-responsibilities

- storing production credentials;
- deploying applications;
- accepting ADR/BDR decisions;
- replacing Jira/GitHub as source of truth;
- choosing a repository purely from an LLM guess.

## Run locally

```bash
npm install
npm test
npm run typecheck
```

This reference can later be moved into a dedicated service repository without changing the schemas/OpenAPI contract in the governance repository.
