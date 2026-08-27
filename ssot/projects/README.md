# Project Registry

This directory contains one YAML file per governed project.

## Naming

Use the canonical project ID as the filename:

```text
PIM.yaml
ECOM.yaml
RPA.yaml
```

The canonical `project.id` must remain stable even if repository names or Jira projects change.

## Purpose

A project registry file is a directory of pointers to authoritative sources, not a copy of all project documentation.

It should identify:

- canonical project ID and name
- ownership
- Jira project
- Git repository
- business/domain classification
- deployment model
- environment-to-branch mapping
- locations of project ADR/BDR records
- locations of API/database/runtime truth when needed
- AI permissions for the project

Do not duplicate values such as runtime versions when the project repository already has an authoritative file such as `.nvmrc`, `go.mod`, or `Dockerfile`.

## Validation

Project files should conform to `schemas/project.schema.json`.
