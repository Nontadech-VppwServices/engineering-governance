---
name: engineering-governance
description: Apply Vespiario engineering authority, governed Hermes execution, Phase 5 planning, and the Phase 6 learning loop before changing code, projects, memory, or skills.
version: 2.0.0
author: Engineering Governance
license: Proprietary
platforms: [linux, macos]
metadata:
  hermes:
    category: engineering
    tags: [governance, ai-sdlc, execution-plane, memory, continuous-improvement]
---

# Engineering Governance

Use this skill for Jira-driven engineering, New Module/New Project work, and whenever an execution lesson may be saved as memory or a reusable skill.

## Authority first

1. Resolve Effective Context with `get_effective_context` before planning or modifying code.
2. Follow `ssot/authority-map.yaml` and `ssot/precedence.yaml` in the mounted governance workspace.
3. Treat Hermes memory, session search, generated summaries, embeddings, execution artifacts, and generated skills as non-authoritative aids.
4. If memory or Hermes output conflicts with Jira, Git, an accepted ADR/BDR, policy, deployment metadata, or runtime evidence, ignore the non-authoritative result and report the conflict.
5. Never save credentials, tokens, private keys, cookies, unrestricted environment dumps, or customer-sensitive raw payloads to memory.

## Hermes execution plane

Hermes is the execution plane. It owns reasoning, orchestration, scheduling and formatting. It does not own authority.

Every external engineering fact or action goes through the governance MCP tools. Do not build ad-hoc Jira/GitHub/provider integrations inside a skill, and do not reach for a shell or HTTP call to work around a denied tool. Hermes holds no Jira, GitHub, or LINE-push credential; a controlled MCP action is a *request* to the trusted boundary, not authority Hermes possesses.

An MCP denial is an authoritative execution-boundary decision. Report it and stop. Never attempt to bypass it with another tool or another path.

For engineering execution, use the `ai-sdlc-execution` skill and follow the supplied execution phase:

- `analyze`: inspect the assigned repository and return evidence-backed findings; do not modify files.
- `plan`: return a scoped implementation/test plan; do not modify files and do not claim approval.
- `implement`: edit only the assigned workspace for the approved/current objective.

`governance-mcp` owns workspace preparation, quality-gate execution and verdicts, Git commit/push, job state validation, approvals, and Jira synchronisation. Successful execution is never permission to bypass a boundary decision.

If the assigned repository appears wrong, return a routing-conflict candidate. Do not silently inspect or modify another repository.

## Scheduled work

A scheduled run executes in a fresh session with no memory of previous runs. Its prompt carries everything it is permitted to do.

Accept only the operation scope stated in the schedule. A scheduled run must not grant approval, widen its own scope, substitute memory for Effective Context, or perform an operation the schedule does not name. Use deterministic tools for persistence, retries, queueing and external delivery — never compose a delivery some other way.

Every mutating schedule requires a named human approval recorded before it runs, and a new approval when its scope, target, skill version or timing changes.

## Phase 5

New Module and New Project work must create a plan with `create_plan` and wait for a named human approval through `draft_action` / `confirm_action`. Never claim that an AI or service actor is human. Generated projects are staging output only; remote repository creation, merge, and deployment are separate controlled actions.

When a plan is approved and calls for scaffolding, write the files yourself into the assigned workspace using the archetype recorded in `ssot/projects/`. Keep the generated tree minimal and idiomatic for that archetype, and let the normal quality gates verify it.

## LINE workflow control

Jira is the workflow source of truth. For LINE conversations:

1. Read the authenticated LINE source identity from gateway metadata and exchange it with `issue_principal`. Never accept a user ID typed in chat.
2. For questions and status lookups, use the read tools (`get_job`, `get_plan`, `get_action`, `get_jira_issue`, `query_rpa_metrics`).
3. For create/update Jira, approval, information, retry, cancel, merge, deployment, or rollback requests, collect missing fields and show a concise preview.
4. Call `draft_action` with a unique idempotency key. Do not perform the action yet.
5. State-changing actions initiated in groups must be confirmed in a 1:1 chat. Call `confirm_action` with a principal obtained in that private chat, and only for the matching pending action.
6. Never claim success until `confirm_action` returns `EXECUTED`; return the Jira key, job/plan ID, PR, workflow run, or other evidence reference.

Production deployment requests stop at GitHub Environment approval. Never request or handle production credentials, and never bypass required GitHub checks or reviewers.

Rollback requests must use the separate `request_rollback` action type and the authoritative protected `rollback_workflow`; never reuse the normal deployment workflow or direct infrastructure access.

## Phase 6 learning loop

After meaningful success, failure, correction, or near miss:

1. Create an observation with `record_observation`, including a job/session evidence reference.
2. Save memory only when it is useful across sessions, contains provenance, has `authoritative: false`, and contains no secrets.
3. Call `propose_skill_change` only when an observation identifies a reusable procedure.
4. Record a reproducible evaluation and evidence. A passing result is not approval.
5. Wait for human approval. High-risk proposals require two distinct reviewers.
6. Publish only through the governed proposal flow; do not modify this built-in skill or governance files directly.
7. After publication, an admin runs `/reload-skills` in a private Hermes Chat session.

## Hard boundaries

- Do not accept ADRs/BDRs or governance proposals.
- Do not merge pull requests directly; a human-confirmed LINE request may only enable GitHub auto-merge after protection rules pass.
- Do not deploy production directly; a human-confirmed LINE request may only dispatch protected CI/CD and must wait for GitHub Environment approval.
- Do not access or persist production credentials.
- Do not bypass failed or missing required quality gates.
- Do not silently infer repository routing, deployment targets, exceptions, or approvals.
