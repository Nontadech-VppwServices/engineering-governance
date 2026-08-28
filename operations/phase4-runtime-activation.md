# AI SDLC Runtime Activation

Operator checklist for connecting real Jira, GitHub and LINE credentials.
Architecture: `decisions/adr/global/ADR-GLOBAL-010-hermes-first-consolidation.md`.

## Infrastructure

- [ ] Provision PostgreSQL and confirm `governance-mcp` applied `sql/001_governance.sql` on first start.
- [ ] Confirm `docker compose ps` reports `caddy`, `postgres`, `governance-mcp` and `hermes` healthy.
- [ ] Confirm `hermes-data-init` completed successfully.
- [ ] Confirm Hermes discovered the boundary and registered its tools: `docker compose logs hermes | grep -i mcp`.
- [ ] Configure health/availability monitoring for `governance-mcp`, PostgreSQL, Hermes and Caddy.

## Credentials

- [ ] Generate `GOVERNANCE_MCP_TOKEN`, `JOB_TOKEN_SIGNING_SECRET` and `PRINCIPAL_SIGNING_SECRET` as independent values.
- [ ] Set the Jira credential, `JIRA_ALLOWED_PROJECT_KEYS`, `JIRA_AI_ASSIGNEE_ACCOUNT_IDS` and `JIRA_AI_PRIMARY_ASSIGNEE_ACCOUNT_ID`.
- [ ] Set the GitHub App installation token with the minimum scopes required for branch, PR and workflow-dispatch operations.
- [ ] Set the LINE channel credentials, `LINE_IDENTITIES_JSON` and `LINE_DELIVERY_TARGET_IDS`.
- [ ] Verify Hermes holds none of them: `docker compose exec hermes env | grep -E 'JIRA_|GITHUB_TOKEN|SIGNING_SECRET'` must return nothing.
- [ ] Verify no workspace contains a credential: `git config --get remote.origin.url` inside a prepared workspace must have no embedded token.
- [ ] Do not grant production deployment credentials to Hermes or to `governance-mcp`.

## Tool boundary

- [ ] Confirm `ssot/mcp/ai-sdlc-tools.yaml`, `hermes/config.yaml` `tools.include`, and the tools registered in `reference/governance-mcp/src/server.ts` agree. CI enforces this; re-run it after any change.
- [ ] Confirm no forbidden tool is registered.
- [ ] Confirm `prepare_workspace` mints a job token and that scoped tools reject a token from another job.

## Jira and GitHub

- [ ] Confirm `list_ready_jira_issues` returns only issues in the permitted projects assigned to the AI assignee.
- [ ] Confirm `JIRA_STATUS_MAPPINGS_JSON` resolves each canonical job state to a real status name per project, and that transitions are discovered rather than hard-coded.
- [ ] Verify GitHub branch protection, required checks, auto-merge settings and protected Environment reviewers.
- [ ] Confirm each deployable project in `ssot/projects/` registers a valid `production_workflow`, `uat_workflow`, `development_workflow` and `rollback_workflow`.

## Schedules

- [ ] Review the seeded jobs in `hermes/cron/jobs.json`.
- [ ] Record the named human approval for each mutating schedule before enabling it.
- [ ] Confirm with `/cron` in a private admin session that the schedules loaded and that timing is `Asia/Bangkok`.

## Verification

1. Assign a test Jira issue to the AI assignee and wait for the intake sweep.
2. Confirm a job is created, reaches `RESOLVING_CONTEXT`, and that a second sweep does not create a duplicate.
3. Confirm an issue with unresolved routing stops at `WAITING_INFORMATION` with a Jira comment naming what is missing.
4. Confirm `prepare_workspace` refuses a repository outside Effective Context routing.
5. Confirm a Git write tool is refused during `analyze` and `plan`.
6. Confirm `commit_and_push` is refused with `QUALITY_GATES_NOT_VERIFIED` before gates have recorded a passing verdict.
7. Confirm a LINE group action creates a draft that cannot be confirmed outside a 1:1 chat.
8. Confirm a production deployment request stops at GitHub Environment approval.
9. Confirm a duplicate RPA `event_id` returns `duplicate=true`.
10. Confirm `mcp_tool_audit` recorded an allow and a deny row for the above.

## Record

```
Activated by:
Date:
governance-mcp image/commit:
Hermes image digest:
Jira projects enabled:
Schedules approved by:
```
