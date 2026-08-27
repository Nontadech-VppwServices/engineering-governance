import type {
  AgentExecutionRequest,
  AgentExecutionResult,
  AiSdlcJob,
  EffectiveContextView,
  IntakeEvent,
  PullRequestMergedEvent,
  PullRequestRef,
} from './types.js';

export interface QueuePort {
  enqueue(event: IntakeEvent): Promise<void>;
}

export interface JobStorePort {
  findByIntakeEventId(eventId: string): Promise<AiSdlcJob | null>;
  findById(jobId: string): Promise<AiSdlcJob | null>;
  findByPullRequest(repository: string, prNumber: number): Promise<AiSdlcJob | null>;
  save(job: AiSdlcJob): Promise<void>;
}

export interface ContextResolverPort {
  resolve(input: {
    requestId: string;
    jiraIssueKey: string;
    workType: IntakeEvent['work_type'];
    component?: string | null;
  }): Promise<EffectiveContextView>;
}

export interface AgentRunnerPort {
  execute(request: AgentExecutionRequest): Promise<AgentExecutionResult>;
}

export interface GitHostPort {
  getDefaultBranch(repository: string): Promise<string>;
  ensureBranch(input: { repository: string; baseBranch: string; branch: string }): Promise<void>;
  findOpenPullRequest(input: { repository: string; headBranch: string; jiraIssueKey: string }): Promise<PullRequestRef | null>;
  createPullRequest(input: {
    repository: string;
    baseBranch: string;
    headBranch: string;
    title: string;
    body: string;
  }): Promise<PullRequestRef>;
}

export interface JiraIssueSnapshot {
  issueKey: string;
  summary: string;
  status?: string | null;
  issueType?: string | null;
  projectKey?: string | null;
}

export interface JiraSyncPort {
  getIssue(issueKey: string): Promise<JiraIssueSnapshot>;
  sync(input: {
    issueKey: string;
    job: AiSdlcJob;
    message: string;
    desiredCanonicalState?: AiSdlcJob['state'];
  }): Promise<void>;
}

export interface OrchestratorPorts {
  jobs: JobStorePort;
  context: ContextResolverPort;
  agent: AgentRunnerPort;
  git: GitHostPort;
  jira: JiraSyncPort;
}

export interface PullRequestEventHandlerPort {
  handlePullRequestMerged(event: PullRequestMergedEvent): Promise<AiSdlcJob | null>;
}
