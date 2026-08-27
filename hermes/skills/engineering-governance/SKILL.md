---
name: engineering-governance
description: Apply Vespiario engineering authority, Phase 5 planning, and the Phase 6 governed learning loop before changing code, projects, memory, or skills.
version: 1.1.0
author: Engineering Governance
license: Proprietary
platforms: [linux, macos]
metadata:
  hermes:
    category: engineering
    tags: [governance, ai-sdlc, memory, continuous-improvement]
---

# Engineering Governance

Use this skill for Jira-driven engineering, New Module/New Project work, and whenever an execution lesson may be saved as memory or a reusable skill.

## Authority first

1. Resolve Effective Context before planning or modifying code.
2. Follow `ssot/authority-map.yaml` and `ssot/precedence.yaml` in the mounted governance workspace.
3. Treat Hermes memory, session search, generated summaries, embeddings, and generated skills as non-authoritative aids.
4. If memory conflicts with Jira, Git, an accepted ADR/BDR, policy, deployment metadata, or runtime evidence, ignore the memory and report `stale_ai_memory`.
5. Never save credentials, tokens, private keys, cookies, unrestricted environment dumps, or customer-sensitive raw payloads to memory.

## Phase 5

New Module and New Project work must create a Phase 5 plan and wait for a named human approval. Use `$PHASE5_API_URL` with bearer token `$PHASE5_API_TOKEN`. Never claim that an AI/service actor is human. Generated projects are staging output only; remote repository creation, merge, and deployment are separate controlled actions.

## LINE workflow control

Jira is the workflow source of truth. For LINE conversations:

1. Read the authenticated LINE source identity from gateway metadata; never accept a user ID typed in chat.
2. For questions and status lookups, call the read-only Workflow Control API at `$WORKFLOW_CONTROL_URL`.
3. For create/update Jira, approval, information, retry, cancel, merge, deployment, or rollback requests, collect missing fields and show a concise preview.
4. Create a pending action with a unique idempotency key. Do not perform the action yet.
5. State-changing actions initiated in groups must be confirmed in a 1:1 chat. Obtain a short-lived principal through the trusted gateway path and confirm only the matching pending action.
6. Never claim success until the control API returns `EXECUTED`; return the Jira key, job/plan ID, PR, workflow run, or other evidence reference.

Production deployment requests stop at GitHub Environment approval. Never request or handle production credentials, and never bypass required GitHub checks or reviewers.
Rollback requests must use the separate `request_rollback` action and an authoritative protected `rollback_workflow`; never reuse the normal deployment workflow or direct infrastructure access.

Use only the typed routes documented in `reference/workflow-control/README.md`. Never query its database or construct human actor headers yourself.

## Phase 6 learning loop

After meaningful success, failure, correction, or near miss:

1. Create an observation with a job/session evidence reference at `$PHASE6_API_URL/v1/observations`.
2. Save memory only when it is useful across sessions, contains provenance, has `authoritative: false`, and contains no secrets.
3. Propose a skill change only when an observation identifies a reusable procedure.
4. Record a reproducible evaluation and evidence. A passing result is not approval.
5. Wait for human approval. High-risk proposals require two distinct reviewers.
6. Publish only through the Phase 6 API; do not modify this governed built-in skill or governance files directly.
7. After publication, an admin must run `/reload-skills` in a private Hermes Chat session; the coder profile is reloaded by the controlled container restart documented in `operations/production-runtime.md`.

## Hard boundaries

- Do not accept ADRs/BDRs or governance proposals.
- Do not merge pull requests directly; a human-confirmed LINE request may only enable GitHub auto-merge after protection rules pass.
- Do not deploy production directly; a human-confirmed LINE request may only dispatch protected CI/CD and must wait for GitHub Environment approval.
- Do not access or persist production credentials.
- Do not bypass failed or missing required quality gates.
- Do not silently infer repository routing, deployment targets, exceptions, or approvals.
