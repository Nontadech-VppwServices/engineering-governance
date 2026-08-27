import{describe,expect,it}from'vitest';import{ReportingService,safe}from'../src/service.js';

describe('report sanitization',()=>{
  it('redacts credentials',()=>expect(safe('token=abc password=xyz')).not.toContain('abc'));
  it('deduplicates a workflow event and creates one outbox delivery',async()=>{
    const queries:string[]=[];let inserted=true;
    const pool={query:async(sql:string)=>{queries.push(sql);if(sql.startsWith('INSERT INTO workflow_events')){const rowCount=inserted?1:0;inserted=false;return{rowCount,rows:[]};}return{rowCount:1,rows:[]};}} as any;
    const service=new ReportingService(pool,'U-alert');
    const event={schema_version:1 as const,event_id:'evt-1',aggregate_type:'deployment' as const,aggregate_id:'act-1',event_type:'waiting_github_approval',occurred_at:new Date().toISOString(),payload:{evidence_ref:'act-1',token:'must-not-persist'}};
    expect((await service.ingestWorkflow(event)).duplicate).toBe(false);
    expect((await service.ingestWorkflow(event)).duplicate).toBe(true);
    expect(queries.filter(value=>value.startsWith('INSERT INTO notification_outbox'))).toHaveLength(1);
  });
});
