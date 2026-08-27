import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { URL } from 'node:url';
import { issuePrincipal, verifyPrincipal } from './security.js';
import { ControlError, WorkflowControlService } from './service.js';
import type { Identity } from './types.js';

export interface ControlServerConfig { apiToken:string; gatewayToken:string; principalSecret:string; identities:Map<string,Identity>; phase4Url:string; phase4Token:string; phase5Url:string; phase5Token:string; contextUrl:string; contextToken:string; jiraWebhookSecret:string; jiraWorkTypeFieldId:string; jiraAiAssignees:string[]; jiraAllowedProjects:string[]; jiraModuleNameFieldId?:string; jiraTargetPathFieldId?:string; jiraProjectIdFieldId?:string; jiraDomainFieldId?:string; jiraProjectTypeFieldId?:string; jiraDeploymentTypeFieldId?:string; jiraRepositoryFieldId?:string; }
export function createControlServer(config: ControlServerConfig, service: WorkflowControlService): ReturnType<typeof createServer> {
  return createServer(async (req, res) => { try {
    const url = new URL(req.url ?? '/', 'http://workflow-control.internal');
    if (req.method === 'GET' && url.pathname === '/healthz') return json(res, 200, { status: 'ok' });
    if (req.method === 'POST' && url.pathname === '/webhooks/jira') return routeJiraWebhook(req,res,config);
    if (req.method === 'POST' && url.pathname === '/v1/principals/issue') {
      if (!bearer(req, config.gatewayToken)) return json(res, 401, { error: { code: 'UNAUTHORIZED' } });
      const body = await readJson(req) as any; const identity = config.identities.get(String(body.line_user_id ?? ''));
      if (!identity) throw new ControlError('LINE user is not allowlisted.', 403, 'FORBIDDEN');
      return json(res, 200, { principal_token: issuePrincipal(identity, config.principalSecret, body.direct_message === true) });
    }
    if (!bearer(req, config.apiToken)) return json(res, 401, { error: { code: 'UNAUTHORIZED' } });
    const principal = verifyPrincipal(header(req, 'x-principal-token'), config.principalSecret);
    if (req.method === 'POST' && url.pathname === '/v1/actions/draft') return json(res, 201, await service.draft(await readJson(req) as any, principal));
    const actionMatch = url.pathname.match(/^\/v1\/actions\/([^/]+)(?:\/(confirm))?$/);
    if (req.method === 'GET' && actionMatch?.[1] && !actionMatch[2]) return json(res, 200, await service.get(decodeURIComponent(actionMatch[1])));
    if (req.method === 'POST' && actionMatch?.[1] && actionMatch[2]) return json(res, 200, await service.confirm(decodeURIComponent(actionMatch[1]), principal));
    const jobMatch = url.pathname.match(/^\/v1\/jobs\/([^/]+)$/);
    if (req.method === 'GET' && jobMatch?.[1]) return proxy(res, `${config.phase4Url}/v1/jobs/${encodeURIComponent(jobMatch[1])}`, config.phase4Token);
    return json(res, 404, { error: { code: 'NOT_FOUND' } });
  } catch (error) { const known = error instanceof ControlError ? error : new ControlError(error instanceof Error ? error.message : 'Unexpected failure.', /principal|signature|expired/i.test(String(error)) ? 401 : 500, 'REQUEST_FAILED'); return json(res, known.status, { error: { code: known.code, message: known.status === 500 ? 'Request failed unexpectedly.' : known.message } }); } });
}
async function routeJiraWebhook(req:IncomingMessage,res:ServerResponse,config:ControlServerConfig){
  if(header(req,'x-ai-sdlc-webhook-secret')!==config.jiraWebhookSecret)return json(res,401,{error:'invalid_webhook_secret'});
  const raw=await readRaw(req);let body:any;try{body=JSON.parse(raw);}catch{throw new ControlError('Valid JSON body is required.');}
  const issue=body.issue;const fields=issue?.fields;const projectKey=fields?.project?.key??issue?.key?.split('-')[0];const assignee=fields?.assignee?.accountId;
  if(!issue?.key||!fields||!config.jiraAllowedProjects.includes(projectKey)||!config.jiraAiAssignees.includes(assignee))return json(res,202,{accepted:false,ignored:true});
  const changed=body.webhookEvent==='jira:issue_created'||(body.webhookEvent==='jira:issue_updated'&&body.changelog?.items?.some((x:any)=>x.field==='assignee'||x.fieldId==='assignee'));if(!changed)return json(res,202,{accepted:false,ignored:true});
  const workType=(selected(fields[config.jiraWorkTypeFieldId])??(String(fields.issuetype?.name).toLowerCase()==='bug'?'bug':'analysis')).toLowerCase().replace(/[\s-]+/g,'_');
  if(!['new_module','new_project'].includes(workType)){const response=await fetch(`${config.phase4Url}/webhooks/jira`,{method:'POST',headers:{'content-type':'application/json','x-ai-sdlc-webhook-secret':config.jiraWebhookSecret,'x-atlassian-webhook-identifier':header(req,'x-atlassian-webhook-identifier')},body:raw});res.statusCode=response.status;res.setHeader('content-type','application/json');res.end(await response.text());return;}
  const requestId=`jira:${issue.key}:${body.timestamp??Date.now()}`;let request:any;
  if(workType==='new_module'){
    const moduleName=selected(fields[config.jiraModuleNameFieldId??'']);const targetPath=selected(fields[config.jiraTargetPathFieldId??'']);if(!moduleName||!targetPath)return json(res,202,{accepted:false,waiting_information:true,missing:['module_name','target_path']});
    const context=await requestJson(`${config.contextUrl}/v1/context/resolve`,config.contextToken,{schema_version:1,request_id:`${requestId}:context`,jira_issue_key:issue.key,work_type:'new_module'});const repositories=context.routing?.repositories??[];if(repositories.length!==1)return json(res,202,{accepted:false,waiting_information:true,reason:'Exactly one resolved repository is required for module planning.'});
    request={schema_version:1,request_id:requestId,jira_issue_key:issue.key,kind:'new_module',requested_at:new Date().toISOString(),requested_by:fields.reporter?.accountId??'jira',module:{project_id:context.project.id,module_name:moduleName,repository:repositories[0].repository,target_path:targetPath,effective_context:context}};
  }else{
    const values={id:selected(fields[config.jiraProjectIdFieldId??'']),domain:selected(fields[config.jiraDomainFieldId??'']),project_type:normalize(selected(fields[config.jiraProjectTypeFieldId??''])),deployment_type:normalize(selected(fields[config.jiraDeploymentTypeFieldId??''])),repository:selected(fields[config.jiraRepositoryFieldId??''])};const missing=Object.entries(values).filter(([,v])=>!v).map(([k])=>k);if(missing.length)return json(res,202,{accepted:false,waiting_information:true,missing});
    request={schema_version:1,request_id:requestId,jira_issue_key:issue.key,kind:'new_project',requested_at:new Date().toISOString(),requested_by:fields.reporter?.accountId??'jira',project:{...values,name:fields.summary}};
  }
  const plan=await requestJson(`${config.phase5Url}/v1/plans`,config.phase5Token,request);return json(res,202,{accepted:true,routed_to:'phase5',plan_id:plan.plan_id,state:plan.state});
}
function selected(value:any):string|null{if(typeof value==='string'&&value.trim())return value.trim();for(const key of ['value','name','key'])if(typeof value?.[key]==='string'&&value[key].trim())return value[key].trim();return null;}
function normalize(value:string|null){return value?.toLowerCase().replace(/[\s-]+/g,'_')??null;}
async function requestJson(url:string,token:string,bodyValue:unknown):Promise<any>{const response=await fetch(url,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(bodyValue)});if(!response.ok)throw new Error(`Upstream returned HTTP ${response.status}.`);return response.json();}
async function proxy(res: ServerResponse, url: string, token: string) { const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } }); res.statusCode = response.status; res.setHeader('content-type', 'application/json'); res.end(await response.text()); }
function bearer(req: IncomingMessage, token: string) { return token.length >= 16 && req.headers.authorization === `Bearer ${token}`; }
function header(req: IncomingMessage, name: string) { const value = req.headers[name]; return Array.isArray(value) ? value[0] ?? '' : value ?? ''; }
async function readJson(req: IncomingMessage) { const chunks: Buffer[] = []; let size = 0; for await (const chunk of req) { const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); size += b.length; if (size > 1024 * 1024) throw new ControlError('Request body too large.'); chunks.push(b); } try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new ControlError('Valid JSON body is required.'); } }
async function readRaw(req:IncomingMessage){const chunks:Buffer[]=[];let size=0;for await(const chunk of req){const b=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=b.length;if(size>1024*1024)throw new ControlError('Request body too large.');chunks.push(b);}return Buffer.concat(chunks).toString('utf8');}
function json(res: ServerResponse, status: number, value: unknown) { res.statusCode = status; res.setHeader('content-type', 'application/json; charset=utf-8'); res.setHeader('cache-control', 'no-store'); res.end(JSON.stringify(value)); }
