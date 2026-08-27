---
id: EXCEPTION-2026-08-27-PHASE4-DIRECT-MAIN
status: accepted
scope: phase4_implementation
approved_by: human_project_owner
approved_at: 2026-08-27
expires_when: phase4_implementation_complete
---

# Phase 4 direct-main implementation exception

## Context

The standing AI SDLC governance requires AI-authored governance changes to be proposed through pull requests and merged by a human.

For Phase 4 implementation, the human project owner explicitly instructed the AI to write the implementation directly to `main` without a pull request.

## Approved exception

For the **Phase 4 — Jira → AI → Git → PR workflow implementation only**, AI may commit Phase 4 governance/reference implementation changes directly to the `main` branch of `VespiarioThailand/engineering-governance`.

This exception does **not** authorize:

- AI merge of application pull requests;
- AI production deployment;
- bypassing application CI/CD or required reviewers;
- direct access to production credentials;
- future governance changes to bypass PR review automatically.

The normal governance rule resumes after Phase 4 implementation is complete unless another explicit human exception is recorded.
