import { createHmac } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { ActionExecutor } from './service.js';
import { ControlError } from './service.js';
import type { LinePrincipal, PendingAction } from './types.js';

export interface ExecutorConfig { jiraBaseUrl: string; jiraAuthorization: string; jiraAiAssigneeAccountId: string; jiraWorkTypeFieldId?: string; phase4Url: string; phase4Token: string; phase5Url: string; phase5Token: string; actorSigningSecret: string; governanceRoot:string; githubApiUrl?: string; githubAuthorization: string; }
export class HttpActionExecutor implements ActionExecutor {
  constructor(private readonly config: ExecutorConfig, private readonly fetchImpl: typeof fetch = fetch) {}
  async execute(action: PendingAction, principal: LinePrincipal): Promise<unknown> {
    switch (action.type) {
      case 'create_requirement': return this.createRequirement(action.payload, principal);
      case 'update_requirement': return this.updateRequirement(action.payload);
      case 'approve_plan': return this.phase5(action.payload, 'approve', principal);
      case 'execute_plan': return this.executePlan(action.payload);
      case 'provide_information': return this.provideInformation(action.payload);
      case 'request_merge': return this.requestAutoMerge(action.payload);
      case 'request_deployment': return this.requestDeployment(action.payload);
      case 'request_rollback': return this.requestRollback(action.payload);
      case 'cancel_job': return this.phase4JobAction(action.payload, 'cancel');
      case 'retry_job': return this.phase4JobAction(action.payload, 'retry');
    }
  }
  private async createRequirement(payload: Record<string, unknown>, principal: LinePrincipal) {
    const projectKey = requiredString(payload, 'project_key'); const summary = requiredString(payload, 'summary'); const issueType = requiredString(payload, 'issue_type');
    const fields: Record<string, unknown> = { project: { key: projectKey }, summary, issuetype: { name: issueType }, assignee: { accountId: this.config.jiraAiAssigneeAccountId }, description: adf(String(payload.description ?? '')) };
    if (this.config.jiraWorkTypeFieldId && payload.work_type) fields[this.config.jiraWorkTypeFieldId] = { value: String(payload.work_type) };
    return this.jira('/rest/api/3/issue', { method: 'POST', body: JSON.stringify({ fields, properties: [{ key: 'ai_sdlc_requested_by', value: principal.jira_account_id }] }) });
  }
  private async updateRequirement(payload: Record<string, unknown>) {
    const key = requiredString(payload, 'issue_key'); const fields: Record<string, unknown> = {};
    if (typeof payload.summary === 'string') fields.summary = payload.summary;
    if (typeof payload.description === 'string') fields.description = adf(payload.description);
    if (!Object.keys(fields).length) throw new ControlError('No permitted Jira fields supplied.');
    await this.jira(`/rest/api/3/issue/${encodeURIComponent(key)}`, { method: 'PUT', body: JSON.stringify({ fields }) }); return { issue_key: key, updated: true };
  }
  private async provideInformation(payload: Record<string, unknown>) {
    const key = requiredString(payload, 'issue_key'); const message = requiredString(payload, 'message');
    await this.jira(`/rest/api/3/issue/${encodeURIComponent(key)}/comment`, { method: 'POST', body: JSON.stringify({ body: adf(message) }) }); return { issue_key: key, commented: true };
  }
  private async phase5(payload: Record<string, unknown>, operation: string, principal: LinePrincipal) {
    const planId = requiredString(payload, 'plan_id'); const path = `/v1/plans/${encodeURIComponent(planId)}/${operation}`; const actorType = 'human';
    return requestJson(this.fetchImpl, `${this.config.phase5Url}${path}`, { method: 'POST', headers: internal(this.config.phase5Token, { 'x-actor-id': principal.jira_account_id, 'x-actor-type': actorType, 'x-actor-signature': actorSignature(path, principal.jira_account_id, actorType, this.config.actorSigningSecret) }) });
  }
  private async executePlan(payload: Record<string, unknown>) {
    const planId = requiredString(payload, 'plan_id'); const plan = await requestJson(this.fetchImpl, `${this.config.phase5Url}/v1/plans/${encodeURIComponent(planId)}/execute`, { method: 'POST', headers: internal(this.config.phase5Token) }) as any;
    if (plan.output?.type === 'phase4_handoff') await requestJson(this.fetchImpl, `${this.config.phase4Url}/v1/handoffs/phase5`, { method: 'POST', headers: internal(this.config.phase4Token), body: JSON.stringify({ ...plan.output.handoff, plan_id: plan.plan_id }) });
    return plan;
  }
  private async phase4JobAction(payload: Record<string, unknown>, operation: string) { const id = requiredString(payload, 'job_id'); return requestJson(this.fetchImpl, `${this.config.phase4Url}/v1/jobs/${encodeURIComponent(id)}/${operation}`, { method: 'POST', headers: internal(this.config.phase4Token) }); }
  private async requestAutoMerge(payload: Record<string, unknown>) {
    const repository = repositoryName(payload); const number = Number(payload.pr_number); if (!Number.isInteger(number) || number < 1) throw new ControlError('pr_number is invalid.');
    const pr = await this.github(`/repos/${repository}/pulls/${number}`) as any;
    const query = `mutation($id:ID!){enablePullRequestAutoMerge(input:{pullRequestId:$id,mergeMethod:SQUASH}){pullRequest{number autoMergeRequest{enabledAt}}}}`;
    return requestJson(this.fetchImpl, 'https://api.github.com/graphql', { method: 'POST', headers: githubHeaders(this.config.githubAuthorization), body: JSON.stringify({ query, variables: { id: pr.node_id } }) });
  }
  private async requestDeployment(payload: Record<string, unknown>) {
    const repository = repositoryName(payload); const requestedWorkflow = requiredString(payload, 'workflow'); const ref = requiredString(payload, 'ref'); const environment = requiredString(payload, 'environment');
    if (!['dev', 'uat', 'prod'].includes(environment)) throw new ControlError('Deployment target is not permitted.');
    const deployment = await this.authoritativeDeployment(repository, environment); const workflow=deployment.workflow;
    if(requestedWorkflow!==workflow)throw new ControlError('Requested workflow does not match the authoritative project registry.',409,'DEPLOYMENT_CONFIGURATION_DRIFT');
    if(environment==='prod'&&ref!==deployment.defaultBranch&&!/^prod-[A-Za-z0-9._-]+$/.test(ref))throw new ControlError('Production ref must be the default branch or an approved prod-* release tag.',409,'INVALID_PRODUCTION_REF');
    await this.github(`/repos/${repository}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`, { method: 'POST', body: JSON.stringify({ ref, inputs: { environment, requested_via: 'line' } }) });
    return { repository, workflow, ref, environment, state: environment === 'prod' ? 'WAITING_GITHUB_APPROVAL' : 'DISPATCHED' };
  }
  private async requestRollback(payload: Record<string, unknown>) {
    const repository = repositoryName(payload); const ref = requiredString(payload, 'ref'); const rollbackTo = requiredString(payload, 'rollback_to');
    const rollback = await this.authoritativeDeployment(repository, 'prod', 'rollback');
    if (ref !== rollback.defaultBranch && !/^prod-[A-Za-z0-9._-]+$/.test(ref)) throw new ControlError('Rollback workflow ref must be the default branch or an approved prod-* release tag.', 409, 'INVALID_PRODUCTION_REF');
    await this.github(`/repos/${repository}/actions/workflows/${encodeURIComponent(rollback.workflow)}/dispatches`, { method: 'POST', body: JSON.stringify({ ref, inputs: { environment: 'prod', rollback_to: rollbackTo, requested_via: 'line' } }) });
    return { repository, workflow: rollback.workflow, ref, rollback_to: rollbackTo, environment: 'prod', state: 'WAITING_GITHUB_APPROVAL' };
  }
  private async authoritativeDeployment(repository:string,environment:string,kind:'deployment'|'rollback'='deployment'):Promise<{workflow:string;defaultBranch:string}>{const dir=join(this.config.governanceRoot,'ssot/projects');for(const file of(await readdir(dir)).filter(v=>v.endsWith('.yaml'))){const value=parse(await readFile(join(dir,file),'utf8'))as any;const registered=value.repository?.organization&&value.repository?.name?`${value.repository.organization}/${value.repository.name}`:null;if(registered!==repository)continue;if(value.unresolved?.some((item:string)=>/deployment.*(drift|mechanism|mapping)/i.test(item)))throw new ControlError('Project registry has unresolved deployment configuration.',409,'DEPLOYMENT_CONFIGURATION_DRIFT');const deployment=value.ci_cd??value.deployment??{};const key=kind==='rollback'?'rollback_workflow':environment==='prod'?'production_workflow':environment==='dev'?'development_workflow':'uat_workflow';const workflow=deployment[key];if(typeof workflow!=='string'||!/^\.github\/workflows\/[A-Za-z0-9._-]+\.ya?ml$/.test(workflow))throw new ControlError(`No verified ${kind==='rollback'?'rollback':environment} workflow is registered.`,409,'DEPLOYMENT_NOT_VERIFIED');return{workflow,defaultBranch:value.repository?.default_branch??'main'};}throw new ControlError('Repository is not registered for deployment.',404,'PROJECT_NOT_FOUND');}
  private jira(path: string, init: RequestInit) { return requestJson(this.fetchImpl, `${this.config.jiraBaseUrl.replace(/\/$/, '')}${path}`, { ...init, headers: { authorization: this.config.jiraAuthorization, accept: 'application/json', 'content-type': 'application/json' } }); }
  private github(path: string, init: RequestInit = {}) { return requestJson(this.fetchImpl, `${(this.config.githubApiUrl ?? 'https://api.github.com').replace(/\/$/, '')}${path}`, { ...init, headers: githubHeaders(this.config.githubAuthorization) }); }
}
function requiredString(payload: Record<string, unknown>, key: string): string { const value = payload[key]; if (typeof value !== 'string' || !value.trim()) throw new ControlError(`${key} is required.`); return value.trim(); }
function repositoryName(payload: Record<string, unknown>): string { const value = requiredString(payload, 'repository'); if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) throw new ControlError('repository is invalid.'); return value; }
function adf(text: string) { return { version: 1, type: 'doc', content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }] }; }
function internal(token: string, extra: Record<string, string> = {}) { return { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...extra }; }
function githubHeaders(value: string) { return { authorization: value, accept: 'application/vnd.github+json', 'content-type': 'application/json', 'x-github-api-version': '2022-11-28' }; }
function actorSignature(path:string,actorId:string,actorType:string,secret:string){return createHmac('sha256',secret).update(`POST:${path}:${actorId}:${actorType}`).digest('hex');}
async function requestJson(fetchImpl: typeof fetch, url: string, init: RequestInit): Promise<unknown> { const response = await fetchImpl(url, init); if (!response.ok) throw new Error(`Upstream request failed with HTTP ${response.status}.`); if (response.status === 204) return { accepted: true }; return response.json(); }
