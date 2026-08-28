import type { JiraRestAdapter, JiraPollingIssue } from './adapters/jira-rest.js';
import type { GitHubRestAdapter } from './adapters/github-rest.js';
import type { AiSdlcOrchestrator } from './orchestrator.js';
import type { JiraSyncPort, JobStorePort, QueuePort } from './ports.js';
import type { IntakeEvent, WorkType } from './types.js';

export interface PollingWorkerConfig {
  intervalMs: number;
  jiraProjects: string[];
  jiraAssignees: string[];
  componentFieldId?: string;
  workTypeFieldId?: string;
}

export class PollingWorker {
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    private readonly config: PollingWorkerConfig,
    private readonly jira: JiraRestAdapter,
    private readonly github: GitHubRestAdapter,
    private readonly jobs: JobStorePort,
    private readonly intake: QueuePort,
    private readonly orchestrator: AiSdlcOrchestrator,
  ) {}

  start(): void {
    void this.run();
    this.timer = setInterval(() => void this.run(), this.config.intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.pollJira();
      await this.pollGitHub();
      console.log(JSON.stringify({ service: 'ai-sdlc-polling', status: 'ok' }));
    } catch (error) {
      console.error(JSON.stringify({
        service: 'ai-sdlc-polling',
        status: 'failed',
        error: error instanceof Error ? error.message : 'poll failed',
      }));
    } finally {
      this.running = false;
    }
  }

  private async pollJira(): Promise<void> {
    if (!this.config.jiraProjects.length || !this.config.jiraAssignees.length) return;
    const projects = this.config.jiraProjects.map((project) => `'${project.replaceAll("'", "''")}'`).join(',');
    const assignees = this.config.jiraAssignees.map((assignee) => `'${assignee.replaceAll("'", "''")}'`).join(',');
    const jql = `project in (${projects}) AND assignee in (${assignees}) AND updated >= -${Math.max(1, Math.ceil(this.config.intervalMs / 60000))}m ORDER BY updated ASC`;
    const fields = ['summary', 'updated', 'issuetype', 'assignee', 'project'];
    if (this.config.componentFieldId) fields.push(this.config.componentFieldId);
    if (this.config.workTypeFieldId) fields.push(this.config.workTypeFieldId);
    const issues = await this.jira.searchIssues(jql, fields);
    for (const issue of issues) {
      const event = issueToIntake(issue, this.config);
      if (event) await this.intake.enqueue(event);
    }
  }

  private async pollGitHub(): Promise<void> {
    const reviewJobs = await this.jobs.findByState('WAITING_REVIEW');
    for (const job of reviewJobs) {
      for (const pr of job.prs) {
        const status = await this.github.getPullRequestStatus(pr.repository, pr.number);
        if (status.state !== pr.state || status.merged !== pr.merged) {
          await this.orchestrator.handlePullRequestMerged({
            repository: pr.repository,
            pr_number: pr.number,
            merged: status.merged,
            job_id: job.job_id,
            jira_issue_key: job.jira_issue_key,
          });
        }
      }
    }
  }
}

export function issueToIntake(issue: JiraPollingIssue, config: PollingWorkerConfig): IntakeEvent | null {
  const updated = issue.fields.updated;
  if (!updated) return null;
  const project = issue.fields.project?.key ?? issue.key.split('-')[0];
  const assignee = issue.fields.assignee?.accountId;
  if (!project || !config.jiraProjects.includes(project) || !assignee || !config.jiraAssignees.includes(assignee)) return null;
  const component = readValue(config.componentFieldId ? issue.fields[config.componentFieldId] : undefined);
  const configuredWorkType = readValue(config.workTypeFieldId ? issue.fields[config.workTypeFieldId] : undefined);
  const workType = normalizeWorkType(configuredWorkType, issue.fields.issuetype?.name);
  return {
    schema_version: 1,
    event_id: `jira-poll:${issue.key}:${updated}`,
    occurred_at: updated,
    issue_key: issue.key,
    event_type: 'issue_updated',
    work_type: workType,
    component,
    trigger_reason: `Jira polling detected an eligible issue updated at ${updated}.`,
  };
}

function readValue(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (!value || typeof value !== 'object') return null;
  const option = value as { value?: unknown; name?: unknown; key?: unknown };
  for (const candidate of [option.value, option.name, option.key]) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return null;
}

function normalizeWorkType(value?: string | null, issueType?: string | null): WorkType | null {
  const normalized = value?.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (normalized === 'bug' || normalized === 'bug_fix') return 'bug';
  if (normalized === 'new_module' || normalized === 'module') return 'new_module';
  if (normalized === 'new_project' || normalized === 'project') return 'new_project';
  if (normalized === 'analysis' || normalized === 'analysis_only') return 'analysis';
  return issueType?.trim().toLowerCase() === 'bug' ? 'bug' : null;
}
