import { buildAiBranchName } from './branch.js';
import type { OrchestratorPorts } from './ports.js';
import { evaluateQualityGates } from './quality.js';
import { transitionJob } from './state-machine.js';
import type {
  AgentExecutionResult,
  AiSdlcJob,
  EffectiveContextView,
  IntakeEvent,
  PullRequestMergedEvent,
  WorkType,
} from './types.js';

export class AiSdlcOrchestrator {
  constructor(private readonly ports: OrchestratorPorts) {}

  async processIntake(event: IntakeEvent): Promise<AiSdlcJob> {
    const existing = await this.ports.jobs.findByIntakeEventId(event.event_id);
    if (existing) return existing;

    const issue = await this.ports.jira.getIssue(event.issue_key);
    const now = new Date().toISOString();
    const workType = event.work_type ?? inferWorkType(issue.issueType);

    let job: AiSdlcJob = {
      schema_version: 1,
      job_id: `job:${event.issue_key}:${event.event_id}`,
      intake_event_id: event.event_id,
      jira_issue_key: event.issue_key,
      work_type: workType,
      state: 'RECEIVED',
      created_at: now,
      updated_at: now,
      repositories: [],
      prs: [],
      blocking_reason: null,
      artifacts: [],
      history: [{ state: 'RECEIVED', entered_at: now, actor: 'jira', reason: event.trigger_reason ?? null }],
    };
    await this.ports.jobs.save(job);

    job = transitionJob(job, 'RESOLVING_CONTEXT', 'system');
    await this.ports.jobs.save(job);

    const context = await this.ports.context.resolve({
      requestId: job.job_id,
      jiraIssueKey: job.jira_issue_key,
      workType: job.work_type,
      component: event.component ?? null,
    });

    if (!context.decision.can_plan || isRoutingBlocked(context)) {
      job = transitionJob(
        job,
        'WAITING_INFORMATION',
        'system',
        context.decision.reason ?? blockingContextReason(context),
      );
      await this.persistAndSync(job, 'AI SDLC is waiting for routing/governance information before code changes.');
      return job;
    }

    job = { ...job, repositories: context.routing.repositories.map((repo) => repo.repository) };
    job = transitionJob(job, 'ANALYZING', 'ai');
    await this.ports.jobs.save(job);
    await this.ports.jira.sync({
      issueKey: job.jira_issue_key,
      job,
      message: `AI SDLC started analysis. Resolved ${job.repositories.length} repository target(s).`,
      desiredCanonicalState: 'ANALYZING',
    });

    if (workType === 'analysis') {
      job = { ...job, artifacts: [...(job.artifacts ?? []), { kind: 'analysis', content: `Analysis completed for ${issue.summary}. Resolved repositories: ${job.repositories.join(', ') || 'none'}.`, created_at: new Date().toISOString() }] };
      job = transitionJob(job, 'DONE', 'ai', 'Analysis-only request completed without repository modification.');
      await this.persistAndSync(job, 'AI analysis completed. No code/PR was requested.');
      return job;
    }

    if (!context.decision.can_modify_code || !context.decision.can_create_pr) {
      job = transitionJob(job, 'WAITING_INFORMATION', 'system', context.decision.reason ?? 'Effective Context does not permit code modification.');
      await this.persistAndSync(job, 'AI SDLC cannot modify code until Effective Context permits it.');
      return job;
    }

    if (workType === 'new_project') {
      job = transitionJob(job, 'WAITING_INFORMATION', 'system', 'New Project must be routed through Phase 5 project automation.');
      await this.persistAndSync(job, 'New Project requires the Phase 5 planning workflow.');
      return job;
    }

    if (workType === 'new_module' && !event.plan_approved) {
      job = transitionJob(job, 'PLANNING', 'ai');
      job = { ...job, artifacts: [...(job.artifacts ?? []), { kind: 'plan', content: `Implement ${issue.summary} in ${job.repositories.join(', ')} after Phase 5 approval.`, created_at: new Date().toISOString() }] };
      job = transitionJob(job, 'WAITING_PLAN_APPROVAL', 'system', 'New Module requires human plan approval before coding.');
      await this.persistAndSync(job, 'Repository routing is resolved. New Module is waiting for human plan approval before coding.');
      return job;
    }

    job = transitionJob(job, 'CODING', 'ai');
    await this.ports.jobs.save(job);
    return this.executeAndCreatePullRequests(job, issue.summary, context, [issue.summary, issue.description].filter(Boolean).join('\n\n'));
  }

  async approvePlan(jobId: string): Promise<AiSdlcJob> {
    let job = await this.ports.jobs.findById(jobId);
    if (!job) throw new Error(`AI SDLC job not found: ${jobId}`);
    if (job.state !== 'WAITING_PLAN_APPROVAL') {
      throw new Error(`Job ${jobId} is not waiting for plan approval.`);
    }

    const issue = await this.ports.jira.getIssue(job.jira_issue_key);
    const context = await this.ports.context.resolve({
      requestId: `${job.job_id}:approved`,
      jiraIssueKey: job.jira_issue_key,
      workType: job.work_type,
    });
    if (!context.decision.can_modify_code || isRoutingBlocked(context)) {
      job = transitionJob(job, 'FAILED', 'system', context.decision.reason ?? blockingContextReason(context));
      await this.persistAndSync(job, 'Plan was approved but current Effective Context blocks implementation.');
      return job;
    }

    job = transitionJob(job, 'CODING', 'human', 'Human plan approval received.');
    await this.ports.jobs.save(job);
    return this.executeAndCreatePullRequests(job, issue.summary, context, [issue.summary, issue.description].filter(Boolean).join('\n\n'));
  }

  async getJob(jobId: string): Promise<AiSdlcJob | null> {
    return this.ports.jobs.findById(jobId);
  }

  async cancelJob(jobId: string): Promise<AiSdlcJob> {
    let job = await this.ports.jobs.findById(jobId);
    if (!job) throw new Error(`AI SDLC job not found: ${jobId}`);
    if (['DONE', 'FAILED', 'CANCELLED'].includes(job.state)) return job;
    job = transitionJob(job, 'CANCELLED', 'human', 'Cancelled through the trusted control plane.');
    await this.persistAndSync(job, 'AI SDLC job was cancelled by an authorized human.');
    return job;
  }

  async handlePullRequestMerged(event: PullRequestMergedEvent): Promise<AiSdlcJob | null> {
    let job = await this.ports.jobs.findByPullRequest(event.repository, event.pr_number);
    if (!job) return null;
    if (job.state !== 'WAITING_REVIEW') return job;

    const prs = job.prs.map((pr) =>
      pr.repository === event.repository && pr.number === event.pr_number
        ? { ...pr, state: 'closed' as const, merged: event.merged }
        : pr,
    );
    job = { ...job, prs, updated_at: new Date().toISOString() };
    await this.ports.jobs.save(job);

    if (!event.merged) {
      await this.ports.jira.sync({
        issueKey: job.jira_issue_key,
        job,
        message: `PR #${event.pr_number} in ${event.repository} was closed without merge. Job remains WAITING_REVIEW.`,
        desiredCanonicalState: 'WAITING_REVIEW',
      });
      return job;
    }

    if (job.prs.length > 0 && job.prs.every((pr) => pr.merged)) {
      job = transitionJob(job, 'DONE', 'github', 'All required pull requests were merged by human/policy-controlled GitHub workflow.');
      await this.persistAndSync(job, 'All required pull requests were merged. AI SDLC work is complete.');
    }

    return job;
  }

  private async executeAndCreatePullRequests(
    startingJob: AiSdlcJob,
    issueSummary: string,
    context: EffectiveContextView,
    requirement: string,
  ): Promise<AiSdlcJob> {
    let job = startingJob;
    const results: Array<{ result: AgentExecutionResult; baseBranch: string; branch: string }> = [];

    for (const routed of context.routing.repositories) {
      const baseBranch = await this.ports.git.getDefaultBranch(routed.repository);
      const branch = buildAiBranchName(job.jira_issue_key, issueSummary);
      await this.ports.git.ensureBranch({ repository: routed.repository, baseBranch, branch });

      const result = await this.ports.agent.execute({
        schema_version: 1,
        job_id: job.job_id,
        jira_issue_key: job.jira_issue_key,
        work_type: job.work_type,
        repository: routed.repository,
        base_branch: baseBranch,
        working_branch: branch,
        requirement,
        effective_context: context,
        constraints: {
          allow_merge: false,
          allow_production_deploy: false,
          allow_production_credentials: false,
        },
      });

      if (result.status === 'blocked') {
        job = transitionJob(job, 'WAITING_INFORMATION', 'ai', result.blocking_reason ?? 'Agent execution blocked.');
        await this.persistAndSync(job, `Agent execution blocked in ${routed.repository}.`);
        return job;
      }
      if (result.status !== 'completed') {
        job = transitionJob(job, 'FAILED', 'ai', result.blocking_reason ?? `Agent execution ${result.status}.`);
        await this.persistAndSync(job, `Agent execution failed in ${routed.repository}.`);
        return job;
      }

      results.push({ result, baseBranch, branch });
    }

    job = transitionJob(job, 'TESTING', 'ai');
    await this.ports.jobs.save(job);
    await this.ports.jira.sync({
      issueKey: job.jira_issue_key,
      job,
      message: 'AI implementation completed. Required quality gates are being evaluated before PR creation.',
      desiredCanonicalState: 'TESTING',
    });

    for (const item of results) {
      const quality = evaluateQualityGates(context, item.result);
      if (!quality.passed) {
        job = transitionJob(job, 'FAILED', 'system', `Required quality gates failed: ${quality.failures.join(', ')}`);
        await this.persistAndSync(job, `Required quality gates failed for ${item.result.repository}: ${quality.failures.join(', ')}.`);
        return job;
      }
    }

    job = transitionJob(job, 'CREATING_PR', 'system');
    await this.ports.jobs.save(job);

    const prs = [...job.prs];
    for (const item of results) {
      const existing = await this.ports.git.findOpenPullRequest({
        repository: item.result.repository,
        headBranch: item.branch,
        jiraIssueKey: job.jira_issue_key,
      });
      const pr = existing ?? (await this.ports.git.createPullRequest({
        repository: item.result.repository,
        baseBranch: item.baseBranch,
        headBranch: item.branch,
        title: `${job.jira_issue_key}: ${issueSummary}`,
        body: buildPullRequestBody(job, item.result),
      }));
      if (!prs.some((known) => known.repository === pr.repository && known.number === pr.number)) prs.push(pr);
    }

    job = { ...job, prs };
    job = transitionJob(job, 'WAITING_REVIEW', 'system');
    await this.persistAndSync(job, `AI created ${prs.length} pull request(s) and is waiting for human review/merge.`);
    return job;
  }

  private async persistAndSync(job: AiSdlcJob, message: string): Promise<void> {
    await this.ports.jobs.save(job);
    await this.ports.jira.sync({
      issueKey: job.jira_issue_key,
      job,
      message,
      desiredCanonicalState: job.state,
    });
    await this.ports.events?.publish(job, message);
  }
}

function inferWorkType(issueType?: string | null): WorkType {
  return issueType?.toLowerCase() === 'bug' ? 'bug' : 'analysis';
}

function isRoutingBlocked(context: EffectiveContextView): boolean {
  return !['resolved', 'multi_repo'].includes(context.routing.status) || context.conflicts.some((conflict) => conflict.blocking);
}

function blockingContextReason(context: EffectiveContextView): string {
  return context.conflicts.find((conflict) => conflict.blocking)?.message
    ?? context.unresolved[0]
    ?? `Repository routing status is ${context.routing.status}.`;
}

function buildPullRequestBody(job: AiSdlcJob, result: AgentExecutionResult): string {
  const gates = result.quality_gates
    .map((gate) => `- ${gate.key}: ${gate.status}${gate.required ? ' (required)' : ''}`)
    .join('\n');
  return [
    `Jira: ${job.jira_issue_key}`,
    `AI SDLC Job: ${job.job_id}`,
    '',
    '## Summary',
    result.summary ?? 'AI-assisted implementation.',
    '',
    '## Quality gates',
    gates || '- none reported',
    '',
    '## Guardrails',
    '- AI did not merge this PR.',
    '- Production deployment remains controlled by CI/CD and human/policy gates.',
  ].join('\n');
}
