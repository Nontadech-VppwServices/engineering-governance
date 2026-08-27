# Organization Testing Policy

## Purpose

Defines the minimum automated testing requirements used by AI-assisted SDLC and CI/CD across VespiarioThailand projects.

## Authority

This policy is authoritative for organization-wide minimum quality gates. Project-local test suites may add stricter requirements but may not weaken this policy without an approved exception ADR.

## AWS application minimum gates

Every application deployed to AWS must have, at minimum:

1. **API tests** — automated tests covering externally consumed or business-critical API behavior.
2. **End-to-end (E2E) tests** — automated tests covering critical user or system flows against an application runtime.

Both gates are mandatory before production deployment.

### Required CI behavior

- API and E2E tests must run in CI/CD, not only on developer machines.
- A failed mandatory test blocks production deployment.
- Test commands and test locations are repository-owned implementation details.
- Test evidence should be retained through CI logs and/or artifacts.
- Tests must not require production credentials.
- Secrets used by tests must come from approved CI/environment secret stores.

### Recommended additional gates

Projects should add where applicable:

- lint
- typecheck / static analysis
- unit tests
- integration tests
- contract tests
- dependency/security audit
- build verification
- migration verification
- performance regression checks

## On-premise / RPA projects

API and E2E tests are not universally mandatory when the project does not expose an API or conventional application UI. Each project must define test gates appropriate to its automation contract, for example:

- Playwright workflow tests
- parser/export transformation tests
- file contract tests
- scheduler/idempotency tests
- smoke tests against controlled test environments

Production execution must still be gated by automated verification appropriate to the system.

## AI rules

AI agents must:

- detect the project's deployment type before selecting required test gates;
- require API + E2E for AWS application projects;
- never silently skip a mandatory gate;
- report missing mandatory tests as `quality_gate_gap`;
- propose implementation via pull request when a required gate is missing;
- never mark a project compliant solely from documentation; verify repository CI/test definitions.

## Exceptions

Any exception to mandatory AWS API or E2E testing requires an approved exception ADR with:

- project and scope;
- reason;
- risk assessment;
- compensating controls;
- owner;
- expiration/review date.
