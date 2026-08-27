# Phase 5 Module / New Project Automation Policy

## Intake and planning

Every request must have a stable request ID, Jira issue key, requested-at timestamp, and exactly one work kind: `new_module` or `new_project`.

New Module planning requires Effective Context with `can_plan=true`, a resolved repository, and no blocking conflict. Implementation must refresh Effective Context before coding and use the Phase 4 approval/execution path.

New Project planning requires an explicit canonical project ID, name, domain, project type, deployment type, and repository name. Unknown values remain unknown; they must not be invented to make generation succeed.

## Archetype selection

- AWS website/application: `aws-nextjs-typescript`
- On-premise browser/RPA automation: `onprem-playwright-typescript-rpa`

A requested stack outside these mappings is blocked until an accepted ADR or approved exception identifies the alternative.

## Approval and execution

- Every plan starts in `WAITING_PLAN_APPROVAL`.
- Only an authenticated human actor may approve.
- Approval is rejected if the plan is not in the waiting state.
- Execution is rejected until approval exists.
- Output paths must remain below the configured staging root; absolute paths and traversal are prohibited.
- Repeating execution for a completed plan returns the existing result and must not create a second scaffold.

## Generated baseline

New Project scaffolds must include project-local business/ADR/BDR locations, `.ai/project.yaml`, environment documentation, Docker packaging, CI quality gates, health/operational baseline, and tests appropriate to the selected archetype.

Generation does not:

- create or delete a remote repository;
- push directly to a protected branch;
- accept an ADR/BDR;
- merge a PR;
- deploy production;
- write real credentials.

