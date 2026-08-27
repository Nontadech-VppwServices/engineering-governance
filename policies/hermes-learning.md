# Hermes Learning Governance Policy

## Memory

Every stored record must include project/scope, kind, content, provenance, classification, lifecycle state, and `authoritative=false`.

Allowed classifications are `public`, `internal`, and `confidential`. Secrets, credentials, private keys, tokens, cookies, raw environment dumps, and customer-sensitive payloads are prohibited. Retrieval must exclude revoked, superseded, and expired records.

Memory may help navigation and recall. Before planning or acting on material facts, Hermes must resolve Effective Context or consult the named authoritative source. A memory conflict is resolved by ignoring memory and recording `stale_ai_memory`.

## Observations

Continuous-improvement observations must cite an execution/job/session reference and record outcome, evidence, and suggested action. An observation is evidence for a proposal, not permission to change a skill.

## Skill proposals

Skill creation/update/retirement uses the following lifecycle:

```text
PROPOSED → EVALUATING → WAITING_HUMAN_APPROVAL → APPROVED → PUBLISHED
                                      └────────→ REJECTED
```

All evaluations must pass. Low/medium-risk proposals require one distinct human approval; high-risk proposals require two. AI/service actors cannot approve. Publication is idempotent and writes only below the configured generated-skill root.

Generated skill content must retain guardrails for authority resolution, secret handling, merge, and production deployment. Built-in governed skills are changed through Git and pull request, not direct runtime publication.

## Audit and retention

Create, evaluate, approve, reject, publish, supersede, and revoke actions must be durable. Audit entries identify actor, time, action, and subject.

Retention and deletion must follow organization data policy. Revocation is preferred over destructive deletion when auditability is required, and only a named human actor may revoke a record through the service.
