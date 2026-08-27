# Deployment Policy

## Principle

Deployment is executed by CI/CD, not directly by an AI agent.

```text
AI → Branch → PR → Review/Policy Gate → Merge → GitHub Actions → Environment
```

## Environment rules

### DEV

- automated deployment is allowed according to project workflow
- production credentials must not be exposed

### UAT

- deployment must be initiated through version-controlled CI/CD
- tests/build checks should pass before deployment

### PROD

- deployment must use protected CI/CD workflows/environments
- human approval is required during the initial AI SDLC rollout
- AI must not possess direct production SSH, cloud, database, or secret-manager credentials

## AWS projects

The project registry must identify the approved AWS deployment platform. Infrastructure/deployment configuration must remain version controlled.

## On-Premise projects

The project registry must identify the Docker/on-prem deployment method. Deployment should be executed by GitHub Actions/self-hosted runner or another approved CI/CD runner, not by direct AI SSH.

## Rollback

Each production-capable project should define a tested rollback path before AI automation is expanded beyond pull-request creation.
