import type {
  AgentRunnerPort,
  ContextResolverPort,
  GitHostPort,
  JiraSyncPort,
  JobStorePort,
  QueuePort,
} from '../ports.js';
import type {
  AgentExecutionRequest,
  AgentExecutionResult,
  AiSdlcJob,
  EffectiveContextView,
  IntakeEvent,
  PullRequestRef,
} from '../types.js';

export class InMemoryJobStore implements JobStorePort {
  readonly jobs = new Map<string, AiSdlcJob>();

  async findByIntakeEventId(eventId: string): Promise<AiSdlcJob | null> {
    return [...this.jobs.values()].find((job) => job.intake_event_id === eventId) ?? null;
  }

  async findById(jobId: string): Promise<AiSdlcJob | null> {
    return this.jobs.get(jobId) ?? null;
  }

  async findByPullRequest(repository: string, prNumber: number): Promise<AiSdlcJob | null> {
    return [...this.jobs.values()].find((job) =>
      job.prs.some((pr) => pr.repository === repository && pr.number === prNumber),
    ) ?? null;
  }

  async save(job: AiSdlcJob): Promise<void> {
    this.jobs.set(job.job_id, structuredClone(job));
  }
}

export class InMemoryQueue implements QueuePort {
  readonly events: IntakeEvent[] = [];
  async enqueue(event: IntakeEvent): Promise<void> {
    if (!this.events.some((item) => item.event_id === event.event_id)) this.events.push(structuredClone(event));
  }
}

export class StaticContextResolver implements ContextResolverPort {
  constructor(public context: EffectiveContextView) {}
  async resolve(): Promise<EffectiveContextView> {
    return structuredClone(this.context);
  }
}

export class StaticAgentRunner implements AgentRunnerPort {
  readonly requests: AgentExecutionRequest[] = [];
  constructor(private readonly factory: (request: AgentExecutionRequest) => AgentExecutionResult) {}
  async execute(request: AgentExecutionRequest): Promise<AgentExecutionResult> {
    this.requests.push(structuredClone(request));
    return structuredClone(this.factory(request));
  }
}

export class InMemoryGitHost implements GitHostPort {
  readonly branches: Array<{ repository: string; baseBranch: string; branch: string }> = [];
  readonly prs: PullRequestRef[] = [];
  private nextPr = 1;

  async getDefaultBranch(): Promise<string> {
    return 'main';
  }

  async ensureBranch(input: { repository: string; baseBranch: string; branch: string }): Promise<void> {
    if (!this.branches.some((item) => item.repository === input.repository && item.branch === input.branch)) {
      this.branches.push({ ...input });
    }
  }

  async findOpenPullRequest(input: { repository: string; headBranch: string; jiraIssueKey: string }): Promise<PullRequestRef | null> {
    return this.prs.find((pr) => pr.repository === input.repository && pr.state === 'open') ?? null;
  }

  async createPullRequest(input: { repository: string; baseBranch: string; headBranch: string; title: string; body: string }): Promise<PullRequestRef> {
    const pr: PullRequestRef = {
      repository: input.repository,
      number: this.nextPr++,
      url: `https://github.example/${input.repository}/pull/${this.nextPr - 1}`,
      state: 'open',
      merged: false,
    };
    this.prs.push(pr);
    return structuredClone(pr);
  }
}

export class InMemoryJiraSync implements JiraSyncPort {
  readonly messages: Array<{ issueKey: string; state?: AiSdlcJob['state']; message: string }> = [];

  constructor(private readonly issues: Record<string, { summary: string; status?: string | null; issueType?: string | null }>) {}

  async getIssue(issueKey: string) {
    const issue = this.issues[issueKey];
    if (!issue) throw new Error(`Jira issue not found: ${issueKey}`);
    return { issueKey, ...issue };
  }

  async sync(input: { issueKey: string; job: AiSdlcJob; message: string; desiredCanonicalState?: AiSdlcJob['state'] }): Promise<void> {
    this.messages.push({ issueKey: input.issueKey, state: input.desiredCanonicalState, message: input.message });
  }
}
