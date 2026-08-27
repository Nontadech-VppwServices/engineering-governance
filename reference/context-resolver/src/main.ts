import { createContextResolverHttpServer } from './http.js';
import { ContextResolverService } from './service.js';
import { createRuntimeContextSources } from './adapters/runtime.js';

const port = Number(process.env.CONTEXT_RESOLVER_PORT ?? '8083');
const jiraEmail = required('JIRA_EMAIL');
const jiraToken = required('JIRA_API_TOKEN');
const sources = await createRuntimeContextSources({
  governanceRoot: process.env.GOVERNANCE_ROOT ?? '/governance',
  jiraBaseUrl: required('JIRA_BASE_URL'),
  jiraAuthorization: `Basic ${Buffer.from(`${jiraEmail}:${jiraToken}`).toString('base64')}`,
  githubApiUrl: process.env.GITHUB_API_URL,
  githubAuthorization: `Bearer ${required('GITHUB_TOKEN')}`,
});
createContextResolverHttpServer(new ContextResolverService(sources), required('CONTEXT_RESOLVER_API_TOKEN')).listen(port, '0.0.0.0', () => console.log(JSON.stringify({ service: 'context-resolver', port })));

function required(name: string): string { const value = process.env[name]; if (!value) throw new Error(`${name} is required.`); return value; }
