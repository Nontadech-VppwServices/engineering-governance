import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { AgentHttpAdapter } from './adapters/agent-http.js';
import { BullMqIntakeQueue } from './adapters/bullmq-queue.js';
import { BullMqWorkerRuntime } from './adapters/bullmq-worker.js';
import { ContextResolverHttpAdapter } from './adapters/context-resolver-http.js';
import { GitHubRestAdapter } from './adapters/github-rest.js';
import { JiraRestAdapter } from './adapters/jira-rest.js';
import { PostgresJobStore } from './adapters/postgres-job-store.js';
import { Phase6EventAdapter } from './adapters/phase6-events.js';
import { CompositeJobEventPublisher, ReportingEventAdapter } from './adapters/reporting-events.js';
import { createPhase4HttpServer } from './http.js';
import { JiraIntakeService } from './intake.js';
import { AiSdlcOrchestrator } from './orchestrator.js';
import { PollingWorker } from './polling.js';

const pool = new pg.Pool({ connectionString: required('DATABASE_URL') });
const sqlPath = resolve(dirname(fileURLToPath(import.meta.url)), '../sql/001_ai_sdlc_jobs.sql');
await pool.query(await readFile(sqlPath, 'utf8'));
const redis = new URL(required('REDIS_URL'));
const connection = { host: redis.hostname, port: Number(redis.port || '6379'), password: redis.password || undefined };
const queue = new BullMqIntakeQueue(connection);
const jobs = new PostgresJobStore(pool);
const jiraAuthorization = `Basic ${Buffer.from(`${required('JIRA_EMAIL')}:${required('JIRA_API_TOKEN')}`).toString('base64')}`;
const orchestrator = new AiSdlcOrchestrator({
  jobs,
  context: new ContextResolverHttpAdapter(required('CONTEXT_RESOLVER_URL'), `Bearer ${required('CONTEXT_RESOLVER_API_TOKEN')}`),
  agent: new AgentHttpAdapter(required('AGENT_RUNNER_URL'), `Bearer ${required('AGENT_RUNNER_API_TOKEN')}`),
  git: new GitHubRestAdapter({ authorization: `Bearer ${required('GITHUB_TOKEN')}`, apiBaseUrl: process.env.GITHUB_API_URL }),
  jira: new JiraRestAdapter({ baseUrl: required('JIRA_BASE_URL'), authorization: jiraAuthorization, statusNamesByProject: jsonEnv('JIRA_STATUS_MAPPINGS_JSON', {}) }),
  events: new CompositeJobEventPublisher([
    new Phase6EventAdapter(required('PHASE6_API_URL'), required('PHASE6_API_TOKEN')),
    new ReportingEventAdapter(required('REPORTING_API_URL'), required('REPORTING_API_TOKEN')),
  ]),
});
const worker = new BullMqWorkerRuntime(connection, orchestrator);
const intake = new JiraIntakeService(queue);
const port = Number(process.env.PHASE4_PORT ?? '8084');
const server = createPhase4HttpServer({
  apiToken: required('PHASE4_API_TOKEN'),
}, intake, orchestrator);
server.listen(port, '0.0.0.0', () => console.log(JSON.stringify({ service: 'ai-sdlc-orchestrator', port })));
const polling = new PollingWorker(
  {
    intervalMs: Number(process.env.JIRA_POLL_INTERVAL_MS ?? '900000'),
    jiraProjects: csv(required('JIRA_ALLOWED_PROJECT_KEYS')),
    jiraAssignees: csv(required('JIRA_AI_ASSIGNEE_ACCOUNT_IDS')),
    componentFieldId: process.env.JIRA_COMPONENT_FIELD_ID,
    workTypeFieldId: process.env.JIRA_WORK_TYPE_FIELD_ID,
  },
  new JiraRestAdapter({ baseUrl: required('JIRA_BASE_URL'), authorization: jiraAuthorization, statusNamesByProject: jsonEnv('JIRA_STATUS_MAPPINGS_JSON', {}) }),
  new GitHubRestAdapter({ authorization: `Bearer ${required('GITHUB_TOKEN')}`, apiBaseUrl: process.env.GITHUB_API_URL }),
  jobs,
  queue,
  orchestrator,
);
polling.start();

async function shutdown(): Promise<void> { polling.stop(); server.close(); await worker.close(); await queue.close(); await pool.end(); }
process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
function required(name: string): string { const value = process.env[name]; if (!value) throw new Error(`${name} is required.`); return value; }
function csv(value: string): string[] { return value.split(',').map((item) => item.trim()).filter(Boolean); }
function jsonEnv<T>(name: string, fallback: T): T { const value = process.env[name]; return value ? JSON.parse(value) as T : fallback; }
