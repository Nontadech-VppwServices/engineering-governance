import { describe, expect, it } from 'vitest';
import { AiSdlcOrchestrator } from '../src/orchestrator.js';
import {
  InMemoryGitHost,
  InMemoryJiraSync,
  InMemoryJobStore,
  StaticAgentRunner,
  StaticContextResolver,
} from '../src/adapters/in-memory.js';
import type { AgentExecutionRequest, AgentExecutionResult, EffectiveContextView, IntakeEvent } from '../src/types.js';

function context(repositories: string[], archetype: string | null = null): EffectiveContextView {
  return {
    request_id: 'ctx-1',
    project: { id: 'APP', type: 'application', archetype },
    jira: { issue_key: 'APP-1', summary: 'Profile API fails', component: null },
    routing: {
      status: repositories.length > 1 ? 'multi_repo' : 'resolved',
      repositories: repositories.map((repository, index) => ({
        repository,
        role: index === 0 ? 'backend' : 'frontend',
        confidence: 0.99,
        reason: 'test evidence',
      })),
    },
    compliance: { testing: 'compliant' },
    decision: {
      can_plan: true,
      can_modify_code: true,
      can_create_pr: true,
      can_deploy_production: false,
      reason: null,
    },
    conflicts: [],
    unresolved: [],
  };
}

function intake(overrides: Partial<IntakeEvent> = {}): IntakeEvent {
  return {
    schema_version: 1,
    event_id: 'evt-1',
    occurred_at: '2026-08-27T12:00:00+07:00',
    issue_key: 'APP-1',
    event_type: 'manual_trigger',
    work_type: 'bug',
    ...overrides,
  };
}

function defaultAgentResult(request: AgentExecutionRequest): AgentExecutionResult {
  const phase = request.execution_phase ?? 'implement';
  if (phase === 'analyze' || phase === 'plan') {
    return {
      schema_version: 1,
      job_id: request.job_id,
      repository: request.repository,
      execution_phase: phase,
      hermes_run_id: `run-${phase}-${request.repository.split('/').pop()}`,
      artifact_content: phase === 'analyze'
        ? `Root cause analysis for ${request.repository}`
        : `Implementation plan for ${request.repository}`,
      status: 'analysis_only',
      summary: `${phase} completed`,
      commit_sha: null,
      changed_files: [],
      quality_gates: [],
      blocking_reason: null,
    };
  }

  return {
    schema_version: 1,
    job_id: request.job_id,
    repository: request.repository,
    execution_phase: 'implement',
    hermes_run_id: `run-implement-${request.repository.split('/').pop()}`,
    artifact_content: `Implementation notes for ${request.repository}`,
    status: 'completed',
    summary: `Fixed ${request.repository}`,
    commit_sha: 'abc123',
    changed_files: ['src/fix.ts'],
    quality_gates: [
      { key: 'unit', required: true, status: 'passed' },
      { key: 'api', required: true, status: 'passed' },
      { key: 'e2e', required: true, status: 'passed' },
    ],
    blocking_reason: null,
  };
}

function setup(effectiveContext = context(['VespiarioThailand/backend'])) {
  const jobs = new InMemoryJobStore();
  const git = new InMemoryGitHost();
  const jira = new InMemoryJiraSync({
    'APP-1': { summary: 'Profile API fails', issueType: 'Bug' },
  });
  const resolver = new StaticContextResolver(effectiveContext);
  const agent = new StaticAgentRunner(defaultAgentResult);
  return {
    jobs,
    git,
    jira,
    resolver,
    agent,
    orchestrator: new AiSdlcOrchestrator({ jobs, git, jira, context: resolver, agent }),
  };
}

describe('AiSdlcOrchestrator', () => {
  it('runs Hermes analysis then implementation for every routed repository in a multi-repo bug', async () => {
    const env = setup(context(['VespiarioThailand/backend', 'VespiarioThailand/frontend'], 'aws-nextjs-typescript'));
    const job = await env.orchestrator.processIntake(intake());

    expect(job.state).toBe('WAITING_REVIEW');
    expect(job.prs).toHaveLength(2);
    expect(env.agent.requests).toHaveLength(4);
    expect(env.agent.requests.map((request) => request.execution_phase)).toEqual([
      'analyze',
      'analyze',
      'implement',
      'implement',
    ]);
    expect(env.git.branches).toHaveLength(2);
    expect(job.artifacts?.some((artifact) => artifact.kind === 'analysis')).toBe(true);
    expect(job.history.map((item) => item.state)).toContain('TESTING');
  });

  it('blocks PR creation when an AWS website implementation is missing the API gate', async () => {
    const env = setup(context(['VespiarioThailand/frontend'], 'aws-nextjs-typescript'));
    env.agent = new StaticAgentRunner((request) => {
      if ((request.execution_phase ?? 'implement') !== 'implement') return defaultAgentResult(request);
      return {
        schema_version: 1,
        job_id: request.job_id,
        repository: request.repository,
        execution_phase: 'implement',
        status: 'completed',
        changed_files: ['src/page.tsx'],
        quality_gates: [{ key: 'e2e', required: true, status: 'passed' }],
      };
    });
    env.orchestrator = new AiSdlcOrchestrator({
      jobs: env.jobs,
      git: env.git,
      jira: env.jira,
      context: env.resolver,
      agent: env.agent,
    });

    const job = await env.orchestrator.processIntake(intake());
    expect(job.state).toBe('FAILED');
    expect(job.prs).toHaveLength(0);
    expect(job.blocking_reason).toContain('api:missing');
  });

  it('uses Hermes for analysis and planning before a new module waits for human approval', async () => {
    const env = setup();
    const job = await env.orchestrator.processIntake(intake({ work_type: 'new_module' }));

    expect(job.state).toBe('WAITING_PLAN_APPROVAL');
    expect(env.agent.requests.map((request) => request.execution_phase)).toEqual(['analyze', 'plan']);
    expect(job.artifacts?.map((artifact) => artifact.kind)).toEqual(['analysis', 'plan']);
    expect(job.prs).toHaveLength(0);
  });

  it('does not request duplicate planning approval for an approved Phase 5 handoff', async () => {
    const env = setup();
    const job = await env.orchestrator.processIntake(intake({
      event_id: 'phase5:plan-1',
      work_type: 'new_module',
      plan_approved: true,
    }));

    expect(job.state).toBe('WAITING_REVIEW');
    expect(env.agent.requests.map((request) => request.execution_phase)).toEqual(['analyze', 'implement']);
    expect(job.history.map((item) => item.state)).not.toContain('WAITING_PLAN_APPROVAL');
  });

  it('performs real Hermes analysis for analysis-only work without creating a branch or PR', async () => {
    const env = setup();
    const job = await env.orchestrator.processIntake(intake({ work_type: 'analysis' }));

    expect(job.state).toBe('DONE');
    expect(env.agent.requests).toHaveLength(1);
    expect(env.agent.requests[0]?.execution_phase).toBe('analyze');
    expect(job.artifacts?.[0]?.content).toContain('Root cause analysis');
    expect(env.git.branches).toHaveLength(0);
    expect(job.prs).toHaveLength(0);
  });

  it('blocks the workflow if a read-only Hermes phase reports file changes', async () => {
    const env = setup();
    env.agent = new StaticAgentRunner((request) => ({
      ...defaultAgentResult(request),
      changed_files: request.execution_phase === 'analyze' ? ['src/unexpected.ts'] : [],
    }));
    env.orchestrator = new AiSdlcOrchestrator({
      jobs: env.jobs,
      git: env.git,
      jira: env.jira,
      context: env.resolver,
      agent: env.agent,
    });

    const job = await env.orchestrator.processIntake(intake());
    expect(job.state).toBe('WAITING_INFORMATION');
    expect(job.blocking_reason).toContain('Read-only analyze phase');
    expect(job.prs).toHaveLength(0);
  });

  it('deduplicates the same intake event including Hermes execution', async () => {
    const env = setup();
    const first = await env.orchestrator.processIntake(intake());
    const second = await env.orchestrator.processIntake(intake());

    expect(second.job_id).toBe(first.job_id);
    expect(env.agent.requests).toHaveLength(2);
    expect(env.git.prs).toHaveLength(1);
  });

  it('marks the job DONE only after every required PR is merged', async () => {
    const env = setup(context(['VespiarioThailand/backend', 'VespiarioThailand/frontend']));
    let job = await env.orchestrator.processIntake(intake());
    expect(job.state).toBe('WAITING_REVIEW');

    job = (await env.orchestrator.handlePullRequestMerged({
      repository: job.prs[0]!.repository,
      pr_number: job.prs[0]!.number,
      merged: true,
    }))!;
    expect(job.state).toBe('WAITING_REVIEW');

    job = (await env.orchestrator.handlePullRequestMerged({
      repository: job.prs[1]!.repository,
      pr_number: job.prs[1]!.number,
      merged: true,
    }))!;
    expect(job.state).toBe('DONE');
  });
});
