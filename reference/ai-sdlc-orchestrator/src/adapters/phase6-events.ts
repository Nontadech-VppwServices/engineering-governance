import type { AiSdlcJob } from '../types.js';
export class Phase6EventAdapter {
  constructor(private readonly baseUrl:string,private readonly token:string,private readonly fetchImpl:typeof fetch=fetch){}
  async publish(job:AiSdlcJob,message:string):Promise<void>{
    const response=await this.fetchImpl(`${this.baseUrl.replace(/\/$/,'')}/v1/observations`,{method:'POST',headers:{authorization:`Bearer ${this.token}`,'content-type':'application/json','x-actor-id':'phase4-orchestrator'},body:JSON.stringify({schema_version:1,observation_id:`phase4:${job.job_id}:${job.state}`,scope:`project:${job.jira_issue_key.split('-')[0]}`,execution_ref:job.job_id,outcome:job.state==='FAILED'?'failure':job.state==='WAITING_INFORMATION'?'near_miss':'success',evidence:sanitize(`${job.state}: ${message}`),suggested_action:job.state==='FAILED'||job.state==='WAITING_INFORMATION'?'Review the cited job evidence and correct the blocking condition.':'Retain this trace as non-authoritative execution evidence.',created_at:new Date().toISOString()})});
    if(!response.ok)console.error(JSON.stringify({service:'ai-sdlc-orchestrator',event:'phase6_observation_failed',status:response.status,job_id:job.job_id}));
  }
}
function sanitize(value:string){return value.replace(/(password|token|secret)\s*[:=]\s*\S+/gi,'$1=<redacted>').slice(0,2000);}
