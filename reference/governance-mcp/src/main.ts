import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMcpHandler } from '@modelcontextprotocol/server';
import pg from 'pg';
import { ActionService } from './actions.js';
import { loadRegistry } from './context.js';
import { WorkspaceManager } from './git.js';
import { GitHubClient } from './github.js';
import { JiraClient } from './jira.js';
import { OutboxWorker } from './outbox.js';
import { parseIdentities } from './principal.js';
import { safe } from './sanitize.js';
import { createGovernanceMcpServer } from './server.js';
import { GovernanceStore } from './store.js';
import { GovernanceError, type LinePrincipal } from './types.js';

const here = dirname(fileURLToPath(import.meta.url));

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function optional(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

const governanceRoot = optional('GOVERNANCE_ROOT', '/governance');
const apiToken = required('GOVERNANCE_MCP_TOKEN');
if (apiToken.length < 16) throw new Error('GOVERNANCE_MCP_TOKEN must be at least 16 characters.');

const pool = new pg.Pool({ connectionString: required('DATABASE_URL') });
await pool.query(await readFile(resolve(here, '../sql/001_governance.sql'), 'utf8'));

const store = new GovernanceStore(pool);
const registry = await loadRegistry(governanceRoot);

const jira = new JiraClient({
  baseUrl: required('JIRA_BASE_URL'),
  authorization: `Basic ${Buffer.from(`${required('JIRA_EMAIL')}:${required('JIRA_API_TOKEN')}`).toString('base64')}`,
  componentFieldId: optional('JIRA_COMPONENT_FIELD_ID') || undefined,
  workTypeFieldId: optional('JIRA_WORK_TYPE_FIELD_ID') || undefined,
  statusMappings: JSON.parse(optional('JIRA_STATUS_MAPPINGS_JSON', '{}')),
  aiAssigneeAccountIds: required('JIRA_AI_ASSIGNEE_ACCOUNT_IDS').split(',').map((v) => v.trim()).filter(Boolean),
  allowedProjectKeys: required('JIRA_ALLOWED_PROJECT_KEYS').split(',').map((v) => v.trim()).filter(Boolean),
  primaryAssigneeAccountId: required('JIRA_AI_PRIMARY_ASSIGNEE_ACCOUNT_ID'),
});

const github = new GitHubClient({
  apiBaseUrl: optional('GITHUB_API_URL', 'https://api.github.com'),
  authorization: `Bearer ${required('GITHUB_TOKEN')}`,
  governanceRoot,
});

const workspace = new WorkspaceManager({
  workspaceRoot: optional('AGENT_WORKSPACE_ROOT', '/workspaces'),
  githubToken: required('GITHUB_TOKEN'),
  hermesUid: optional('HERMES_UID', '10000'),
  hermesGid: optional('HERMES_GID', '10000'),
  gateTimeoutMs: Number(optional('QUALITY_GATE_TIMEOUT_MS', '900000')),
});

const outbox = new OutboxWorker(pool, {
  lineAccessToken: required('LINE_CHANNEL_ACCESS_TOKEN'),
  allowedTargetIds: required('LINE_DELIVERY_TARGET_IDS'),
  maxAttempts: Number(optional('REPORT_MAX_ATTEMPTS', '8')),
  intervalMs: Number(optional('OUTBOX_INTERVAL_MS', '10000')),
});
await outbox.start();

const actions = new ActionService({
  store,
  jira,
  github,
  async approvePlan(planId: string, principal: LinePrincipal) {
    const plan = await store.findPlan(planId);
    if (!plan) throw new GovernanceError('Plan not found.', 404, 'NOT_FOUND');
    if (plan.state !== 'WAITING_PLAN_APPROVAL') {
      throw new GovernanceError('Plan is not awaiting approval.', 409, 'INVALID_STATE');
    }
    const now = new Date().toISOString();
    const approved = {
      ...plan,
      state: 'APPROVED',
      // actor_type is always 'human': an AI or service actor can never be
      // recorded as the approver.
      approvals: [...plan.approvals, { actor_id: principal.jira_account_id, actor_type: 'human', approved_at: now }],
      history: [...plan.history, { state: 'APPROVED', entered_at: now, actor: 'human', reason: null }],
      updated_at: now,
    };
    await store.savePlan(approved);
    return approved;
  },
  async executePlan(planId: string) {
    const plan = await store.findPlan(planId);
    if (!plan) throw new GovernanceError('Plan not found.', 404, 'NOT_FOUND');
    if (plan.state !== 'APPROVED') {
      throw new GovernanceError('Plan must be approved before execution.', 409, 'INVALID_STATE');
    }
    const now = new Date().toISOString();
    const executing = {
      ...plan,
      state: 'EXECUTING',
      history: [...plan.history, { state: 'EXECUTING', entered_at: now, actor: 'human', reason: null }],
      updated_at: now,
    };
    await store.savePlan(executing);
    return executing;
  },
  async jobAction(jobId: string, operation: 'cancel' | 'retry') {
    const job = await store.findJob(jobId);
    if (!job) throw new GovernanceError('Job not found.', 404, 'NOT_FOUND');
    const { transitionJob } = await import('./state-machine.js');
    const next = transitionJob(
      job,
      operation === 'cancel' ? 'CANCELLED' : 'RESOLVING_CONTEXT',
      'human',
      operation === 'cancel' ? 'Cancelled by human request.' : 'Retried by human request.',
    );
    await store.saveJob(next);
    return next;
  },
});

const deps = {
  store,
  jira,
  github,
  workspace,
  actions,
  registry,
  config: {
    jobTokenSecret: required('JOB_TOKEN_SIGNING_SECRET'),
    principalSecret: required('PRINCIPAL_SIGNING_SECRET'),
    alertTargetId: required('LINE_ALERT_TARGET_ID'),
    reportTargetId: required('LINE_HOME_CHANNEL'),
    identities: parseIdentities(required('LINE_IDENTITIES_JSON')),
  },
};

const handler = createMcpHandler(() => createGovernanceMcpServer(deps), {
  onerror: (error) =>
    console.error(JSON.stringify({ service: 'governance-mcp', error: safe(error.message) })),
});

const port = Number(optional('GOVERNANCE_MCP_PORT', '8090'));

const server = createServer((req, res) => {
  void handle(req, res).catch(() => {
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json');
    }
    res.end(JSON.stringify({ error: { code: 'INTERNAL_ERROR' } }));
  });
});

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method === 'GET' && req.url === '/healthz') {
    return json(res, outbox.healthy ? 200 : 503, {
      status: outbox.healthy ? 'ok' : 'degraded',
      outbox: outbox.healthy ? 'ready' : 'stalled',
    });
  }
  // Hermes authenticates to the boundary with a transport credential that
  // grants no direct Jira/GitHub/production access of its own.
  if (req.headers.authorization !== `Bearer ${apiToken}`) {
    return json(res, 401, { error: { code: 'UNAUTHORIZED' } });
  }

  const response = await handler.fetch(await toWebRequest(req));
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  if (!response.body) return void res.end();

  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    res.write(Buffer.from(value));
  }
  res.end();
}

async function toWebRequest(req: IncomingMessage): Promise<Request> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 8 * 1024 * 1024) throw new Error('Request body too large.');
    chunks.push(buffer);
  }
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) headers.append(key, item);
  }
  const method = req.method ?? 'GET';
  return new Request(`http://governance-mcp.internal${req.url ?? '/'}`, {
    method,
    headers,
    ...(method === 'GET' || method === 'HEAD' ? {} : { body: Buffer.concat(chunks) }),
  });
}

function json(res: ServerResponse, status: number, value: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(value));
}

server.listen(port, '0.0.0.0', () =>
  console.log(JSON.stringify({ service: 'governance-mcp', port, outbox: 'started' })),
);

async function shutdown(): Promise<void> {
  server.close();
  outbox.stop();
  await handler.close().catch(() => undefined);
  await pool.end().catch(() => undefined);
}
process.once('SIGTERM', () => void shutdown());
process.once('SIGINT', () => void shutdown());
