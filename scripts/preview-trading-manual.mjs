// UI-only fixture harness. Runs actual components with schema-validated mock APIs.
// It has no Supabase credentials, never writes real records, and is not shipped by Next.
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
const { build } = await import(process.env.BUDDIES_ESBUILD_MODULE || 'esbuild');
const root=fileURLToPath(new URL('../',import.meta.url));
const dir=await mkdtemp(join(tmpdir(),'buddies-ui-'));
const entry=`
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import ExperimentWorkspace from '${root}src/components/trading-lab/ExperimentWorkspace';
import ManualTrades from '${root}src/components/trading-lab/ManualTrades';
import { strategyFixture, planFixture } from '${root}src/__tests__/helpers/pretradeFixture';
import { assessPlan, pretradeSchema } from '${root}src/lib/trading-lab/pretrade';
import { experimentSchema, observationSchema, experimentReviewSchema } from '${root}src/lib/trading-lab/experiment';
import { experimentMetrics } from '${root}src/lib/trading-lab/experiment-metrics';
import { tradeEventSchema, reviewQuestions, netPnl } from '${root}src/lib/trading-lab/lifecycle';
const now=Date.now(), iso=(offset=0)=>new Date(now+offset).toISOString();
const eid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', vid=planFixture().strategyVersionId;
const strategy={id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',name:'Manual gold protocol',trading_strategy_versions:[{id:vid,version:1,definition:strategyFixture}]};
let experiments=[{id:eid,strategy_version_id:vid,approved_at:iso(-7200000),protocol:{requestId:eid,strategyVersionId:vid,name:'Gold London · first sample',hypothesis:'Waiting for completed confirmation improves results',session:'London 08:00–11:00',timezone:'Europe/London',targetSample:20,eligibility:'All setups meeting the stored version',invalidation:'No completed confirmation',stopConditions:'Daily loss limit reached',reviewCriteria:'Review net expectancy, compliance and execution',accountType:'live',riskCurrency:'USD',riskAmount:10,entryTolerance:1,protectionTolerance:0,quantityTolerancePct:0,approved:true},review_snapshot:null}];
const p=pretradeSchema.parse({...planFixture(),experimentId:eid,observedAt:iso(-600000),validUntil:iso(3600000)});
let plans=[{id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',buddies_decision_id:eid,locked_at:iso(-300000),strategy_version_id:vid,experiment_id:eid,plan_snapshot:p,assessment_snapshot:assessPlan(p,strategyFixture)}];
let trades=[],events=[],observations=[];
window.fetch=async(path,init)=>{
 try {
  const u=new URL(String(path),location.origin), endpoint=u.pathname.split('/').pop(), body=init?.body?JSON.parse(init.body):null;
  let result;
  if(endpoint==='strategies') result={strategies:[strategy]};
  else if(endpoint==='plans') {
   if(body){ const plan=pretradeSchema.parse(body); const saved={...plans[0],id:crypto.randomUUID(),locked_at:new Date().toISOString(),plan_snapshot:plan,assessment_snapshot:assessPlan(plan,strategyFixture)};plans.unshift(saved);result={plan:saved}; }
   else result={plans};
  } else if(endpoint==='experiments') {
   if(body?.action==='create') { const protocol=experimentSchema.parse(body.input);const e={id:crypto.randomUUID(),strategy_version_id:vid,protocol,approved_at:new Date().toISOString(),review_snapshot:null};experiments.push(e);result={experiment:e}; }
   else if(body?.action==='observe') {const v=observationSchema.parse(body.input); observations.push({id:v.requestId,started_at:v.startedAt,ended_at:v.endedAt,qualifying_setups:v.qualifyingSetups,taken_setups:v.takenSetups,notes:v.notes});result={};}
   else if(body?.action==='review') {const v=experimentReviewSchema.parse(body.input);const e=experiments.find(e=>e.id===v.experimentId);e.review_snapshot=v;result={experiment:e};}
   else if(u.searchParams.has('id')) {const experiment=experiments.find(e=>e.id===u.searchParams.get('id'));result={experiment,trades,observations,metrics:experimentMetrics(experiment.protocol,trades,observations),outsideSample:0};}
   else result={experiments};
  } else if(endpoint==='trades') {
   if(body){const e=tradeEventSchema.parse(body),v=e.payload;let t=trades.find(t=>t.id===e.tradeId);
    if(e.kind==='open'){const plan=plans.find(p=>p.id===v.planId);t={id:e.tradeId,decision_id:plan.id,experiment_id:eid,sample_member:true,instrument:plan.plan_snapshot.instrument,status:'open',opened_at:v.occurredAt,closed_at:null,lifecycle_revision:1,open_snapshot:v,plan_snapshot:plan.plan_snapshot,assessment_snapshot:plan.assessment_snapshot,locked_at:plan.locked_at,planned_risk_amount:10,risk_currency:'USD',entry_price:v.price,remaining_quantity:v.quantity,net_pnl:null};trades.push(t);}
    else{t.lifecycle_revision++;if(e.kind==='close'){t.status='closed';t.closed_at=v.occurredAt;t.close_snapshot=v;t.net_pnl=netPnl(v);t.exit_price=v.price;t.remaining_quantity=0;}if(e.kind==='review')t.review_snapshot=v;}
    events.push({...e,id:crypto.randomUUID(),trade_id:e.tradeId,recorded_at:new Date().toISOString()});result={trade:t};
   }else result=u.searchParams.has('tradeId')?{events:events.filter(e=>e.trade_id===u.searchParams.get('tradeId'))}:{trades,rules:[]};
  }else throw new Error('Unsupported fixture API');
  return new Response(JSON.stringify(result),{status:200,headers:{'content-type':'application/json'}});
 } catch(e){return new Response(JSON.stringify({error:e.message}),{status:400,headers:{'content-type':'application/json'}});}
};
function App(){const [tab,setTab]=useState('Experiments');return <main className="min-h-screen bg-canvas px-3 py-4 text-ink sm:px-6"><div className="mx-auto max-w-7xl space-y-4"><p className="rounded-lg border border-line bg-surface p-3 text-sm">Isolated UI fixture · synthetic data · no real accounts or trades</p><nav className="flex gap-4">{['Experiments','Execution'].map(t=><button className="rounded-lg border border-line bg-surface px-4 py-2" onClick={()=>setTab(t)} key={t}>{t}</button>)}</nav>{tab==='Experiments'?<ExperimentWorkspace strategies={[strategy]} onStrategiesSaved={async()=>{}} onExecute={()=>setTab('Execution')}/>:<ManualTrades/>}</div></main>};
createRoot(document.getElementById('root')).render(<App/>);
`;
await writeFile(join(dir,'entry.tsx'),entry);
await build({entryPoints:[join(dir,'entry.tsx')],outfile:join(dir,'app.js'),bundle:true,jsx:'automatic',nodePaths:[join(root,'node_modules')],alias:{'@':join(root,'src')},define:{'process.env.NODE_ENV':'"development"'}});
execFileSync(join(root,'node_modules/.bin/tailwindcss'),['-i',join(root,'src/app/globals.css'),'-c',join(root,'tailwind.config.ts'),'-o',join(dir,'app.css')],{cwd:root,stdio:'pipe'});
const html='<!doctype html><html data-theme="light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Trading Lab UI fixture</title><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>';
const server=createServer(async(req,res)=>{
 if(req.url==='/mobile'){res.setHeader('content-type','text/html');res.end('<!doctype html><title>Mobile fixture</title><iframe title="Mobile Trading Lab" src="/" style="width:390px;height:844px;border:0"></iframe>');return;}
 if(req.url==='/app.js'||req.url==='/app.css'){res.setHeader('content-type',req.url.endsWith('js')?'text/javascript':'text/css');res.end(await readFile(join(dir,req.url.slice(1))));return;}
 res.setHeader('content-type','text/html');res.end(html);
});
server.listen(4317,'127.0.0.1',()=>console.log('Isolated UI fixture: http://127.0.0.1:4317 (mobile at /mobile)'));
