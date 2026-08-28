import { execFile } from 'node:child_process';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
export interface Request { schema_version:1; job_id:string; jira_issue_key:string; work_type:string; repository:string; base_branch:string; working_branch:string; requirement?:string; effective_context:{project:{archetype?:string|null}}; constraints:{allow_merge:false;allow_production_deploy:false;allow_production_credentials:false}; }
export interface Gate { key:string; required:boolean; status:'passed'|'failed'|'not_run'|'not_applicable'; details?:string; }
export interface Result { schema_version:1; job_id:string; repository:string; status:'completed'|'blocked'|'failed'; summary:string; commit_sha:string|null; changed_files:string[]; quality_gates:Gate[]; blocking_reason:string|null; }
export interface Config { workspaceRoot:string; githubToken:string; hermesUrl:string; hermesKey:string; hermesModel?:string; hermesUid?:string; hermesGid?:string; mode:'hermes'|'mock'; }
export class AgentRunner {
  constructor(private readonly config:Config) {}
  async execute(request:Request):Promise<Result> {
    validate(request); const dir = resolve(this.config.workspaceRoot, safe(request.job_id), safe(request.repository)); if(!dir.startsWith(resolve(this.config.workspaceRoot)+sep)) throw new Error('Unsafe workspace path.');
    await rm(dir,{recursive:true,force:true}); const env={...process.env,GITHUB_TOKEN:this.config.githubToken,GIT_ASKPASS:'/usr/local/bin/git-askpass',GIT_TERMINAL_PROMPT:'0'};
    await run('git',['clone','--branch',request.working_branch,'--single-branch',`https://github.com/${request.repository}.git`,dir],undefined,env); if(this.config.mode==='hermes'){ await run('chown',['-R',`${this.config.hermesUid??'10000'}:${this.config.hermesGid??'10000'}`,dir]); await this.runHermes(request,dir); } else await run('sh',['-c','printf "mock agent execution\n" > .ai-sdlc-mock.txt'],dir,env);
    const changed=await changedFiles(dir,env); if(!changed.length) return result(request,'blocked','Agent produced no repository changes.',null,[],[],'NO_CHANGES');
    const gates=await qualityGates(dir,request.effective_context.project.archetype??'',env); if(gates.some(g=>g.required&&g.status!=='passed')) return result(request,'failed','Trusted quality gates failed.',null,changed,gates,'QUALITY_GATES_FAILED');
    await run('git',['add','--all'],dir,env); await run('git',['-c','user.name=AI SDLC','-c','user.email=ai-sdlc@localhost','commit','-m',`${request.jira_issue_key}: AI-assisted implementation`],dir,env);
    await run('git',['merge-base','--is-ancestor',`origin/${request.base_branch}`,'HEAD'],dir,env); await run('git',['push','origin',`HEAD:${request.working_branch}`],dir,env);
    const sha=(await run('git',['rev-parse','HEAD'],dir,env)).trim(); return result(request,'completed','Implementation committed, verified and pushed by the isolated runner.',sha,changed,gates,null);
  }
  private async runHermes(request:Request,dir:string){ const response=await fetch(`${this.config.hermesUrl.replace(/\/$/,'')}/v1/runs`,{method:'POST',headers:{authorization:`Bearer ${this.config.hermesKey}`,'content-type':'application/json'},body:JSON.stringify({provider:'custom',model:this.config.hermesModel??'qwen3-coder:30b',session_id:`coder:${safe(request.job_id)}`,input:`Work only in ${dir}. You own this task end-to-end: inspect the repository, implement the requirement, create or modify the necessary files, run the relevant tests yourself, fix failures, and report the files changed and test results. Requirement: ${request.requirement??`Implement Jira ${request.jira_issue_key} according to the supplied Effective Context.`} Do not commit, push, merge, deploy, or access credentials. Stop only after implementation and tests are complete or a concrete blocking reason is established.`,instructions:JSON.stringify({request:{...request,constraints:request.constraints}})})}); if(!response.ok)throw new Error(`Hermes coder returned HTTP ${response.status}.`); const created=await response.json() as any; const deadline=Date.now()+30*60*1000; while(Date.now()<deadline){await new Promise(r=>setTimeout(r,2000));const poll=await fetch(`${this.config.hermesUrl.replace(/\/$/,'')}/v1/runs/${encodeURIComponent(created.run_id)}`,{headers:{authorization:`Bearer ${this.config.hermesKey}`}});if(!poll.ok)throw new Error(`Hermes run poll returned HTTP ${poll.status}.`);const state=await poll.json() as any;if(state.status==='completed')return;if(['failed','stopped','cancelled'].includes(state.status))throw new Error(`Hermes coder ended with ${state.status}.`);}throw new Error('Hermes coder timed out.'); }
}
