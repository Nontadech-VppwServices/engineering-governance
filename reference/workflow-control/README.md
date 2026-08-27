# Workflow Control

Trusted control plane between Hermes/LINE and Jira, AI SDLC, GitHub and Phase 5.

Every state-changing operation is two-step: `POST /v1/actions/draft`, then `POST /v1/actions/{id}/confirm`. A confirmation requires a non-expired `X-Principal-Token` for the original requester and `direct_message=true`. Tokens are issued only through `POST /v1/principals/issue` using the gateway-only bearer token and the static `LINE_IDENTITIES_JSON` mapping.

Supported action types are `create_requirement`, `update_requirement`, `approve_plan`, `execute_plan`, `provide_information`, `request_merge`, `request_deployment`, `request_rollback`, `cancel_job` and `retry_job`. Rollback is accepted only when the authoritative project registry defines a separate protected `rollback_workflow`. Read-only job lookup is `GET /v1/jobs/{id}`.

The service is internal-only. Caddy must never publish these routes.
