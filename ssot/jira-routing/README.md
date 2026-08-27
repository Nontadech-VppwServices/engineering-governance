# Jira Repository Routing SSOT

This directory contains routing configuration used to resolve Jira issues to one or more GitHub repositories.

## Routing modes

### `required_component`

Use when the Jira project covers many independent systems/bots and the end user can reliably identify the business automation. The selected component maps to a registered primary repository.

Current use: Jira project `RPA`.

### `ai_auto_discovery`

Use when end users should not be expected to know whether a defect belongs to frontend, backend, CMS, worker, or another repository. The Repository Resolver inspects Jira context, architecture, project registry and repository evidence to identify one or more impacted repositories.

This is the default approach for application projects that span multiple repositories.

### `hybrid`

Optional future mode where Jira metadata narrows candidates but AI still performs repository discovery.

## Authority

Routing records are authoritative mappings/policies for repository resolution. They do not replace repository source code or Jira issue content.

If Jira metadata conflicts with strong repository evidence, AI must report `routing_conflict` rather than silently changing the route.

## Multi-repository support

Repository Resolver outputs must support arrays of repositories. A Jira issue may require changes to frontend and backend together, or code changes in one repository plus regression tests in another.

## RPA dropdown

The current approved Jira RPA component values are defined in `RPA.yaml`. Jira administrators should use the exact stable keys as dropdown/component values so automation does not depend on mutable display labels.
