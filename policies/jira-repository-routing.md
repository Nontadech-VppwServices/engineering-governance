# Jira Repository Routing Policy

## Purpose

Defines how AI SDLC resolves a Jira issue to one or more GitHub repositories before analysis, planning, or code modification.

## Core rule

A Jira project is a work-management boundary, not a repository identifier. Routing must produce one or more repository targets with evidence.

## Application projects

For website/application Jira projects that may span frontend/backend/CMS/service repositories:

- Jira users are not required to identify frontend vs backend;
- Repository selection defaults to `ai_auto_discovery`;
- the resolver should start from all governed repositories associated with the project/domain;
- code/API/dependency evidence must narrow the candidate set;
- one issue may resolve to multiple repositories;
- AI must explain why each repository is primary, secondary, test-only, or unaffected.

Minimum resolver inputs:

- Jira summary/description/acceptance criteria;
- live Jira metadata;
- central project registry;
- `docs/business/` context;
- accepted ADR/BDR records;
- repository code search;
- relevant API/dependency/configuration evidence.

## RPA Jira project

For Jira project key `RPA`, `Component` is required for maintenance, bug, and module work.

The selected component must exist in `ssot/jira-routing/RPA.yaml`.

The component provides a deterministic primary repository, but AI must verify consistency with issue evidence. A conflicting issue must produce `routing_conflict` rather than silently switching repositories.

## Output contract

Repository Resolver output should follow this logical model:

```json
{
  "status": "resolved",
  "routingMode": "ai_auto_discovery",
  "repositories": [
    {
      "repository": "VespiarioThailand/example-backend",
      "role": "primary",
      "confidence": 0.96,
      "reason": "API route and failing implementation found in this repository"
    }
  ],
  "conflicts": []
}
```

Allowed repository roles:

- `primary`
- `secondary`
- `test_only`
- `dependency`

## Required safeguards

- No code modification while status is `routing_conflict`, `unmapped_component`, or `waiting_information`.
- RPA component routes are authoritative unless repository evidence shows a conflict; conflicts require review/correction of Jira metadata or routing SSOT.
- Application routing may not choose a repository solely from repository name similarity.
- AI must preserve evidence used to resolve the repository.
- If more than one repository is impacted, the plan and PR traceability must identify all repositories.

## Jira field recommendation

For Jira project `RPA`, configure a single-select/dropdown field or Jira Component values using the keys defined in `ssot/jira-routing/RPA.yaml`.

For application projects, do not require a frontend/backend dropdown. The resolver is responsible for discovering the affected repository set.
