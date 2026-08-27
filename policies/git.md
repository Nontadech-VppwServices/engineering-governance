# Git Policy

## Purpose

Defines minimum Git controls for AI-assisted development.

## Rules

1. Source code changes must be version controlled.
2. AI must work on a dedicated branch and must not commit directly to protected branches.
3. AI-generated changes must be delivered through a pull request unless an explicitly approved policy allows otherwise.
4. Jira issue keys should be included in branch names and pull requests when the work originates from Jira.
5. Pull requests must preserve traceability to the originating work item.
6. Force-push to protected branches is prohibited.
7. Repository secrets and production credentials must never be committed.

## Recommended AI branch format

```text
ai/{jira-key}-{short-description}
```

Example:

```text
ai/PIM-123-fix-product-sync-timeout
```

## Initial rollout rule

AI may create branches, commits, pushes, and pull requests when allowed by the project registry. AI may not merge its own pull requests.
