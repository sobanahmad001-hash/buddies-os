// Exercise the actual Edge entrypoint with isolated credentials and dependencies.
// This checks authentication/dispatch without contacting Supabase or market data.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

const source=await readFile(new URL('../supabase/functions/trading-paper-worker/index.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
let handler,allow=false,authError=null,throwAuth=false,throwWorker=false,authCalls=0,workCalls=0;
const admin={rpc:async(name,args)=>{
  authCalls++;assert.equal(name,'authorize_paper_worker');assert.equal(args.p_token,'test-worker-token-with-at-least-thirty-two-characters');
  if(throwAuth)throw new Error('network failed');
  return {data:allow,error:authError};
}};
const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'local-placeholder-only'};
runInNewContext(compiled,{
  exports:{},Response,
  Deno:{env:{get:name=>env[name]},serve:fn=>{handler=fn;}},
  require:name=>{
    if(name==='node:process')return {env:{}};
    if(name==='@supabase/supabase-js')return {createClient:(url,key)=>{assert.equal(url,env.SUPABASE_URL);assert.equal(key,env.SUPABASE_SERVICE_ROLE_KEY);return admin;}};
    if(name==='./worker.js')return {runPaperWorker:async(client)=>{workCalls++;assert.equal(client,admin);if(throwWorker)throw new Error('worker failed');return [];}};
    throw new Error('Unexpected worker import: '+name);
  },
});
const req=(method='POST',token=null,body=undefined)=>new Request('https://example.supabase.co/functions/v1/trading-paper-worker',{method,headers:token?{authorization:'Bearer '+token}:{},body});
assert.equal((await handler(req('GET'))).status,405);
assert.equal((await handler(req())).status,401);
assert.equal((await handler(req('POST','short'))).status,401);
assert.equal((await handler(req('POST','x'.repeat(257)))).status,401);
assert.equal(authCalls,0);assert.equal(workCalls,0);
const token='test-worker-token-with-at-least-thirty-two-characters';
assert.equal((await handler(req('POST',token))).status,401);
allow=true;authError={message:'database unavailable'};
assert.equal((await handler(req('POST',token))).status,401);assert.equal(workCalls,0);
authError=null;throwAuth=true;
assert.equal((await handler(req('POST',token))).status,503);assert.equal(workCalls,0);
throwAuth=false;
const valid=await handler(req('POST',token,JSON.stringify({ownerId:'forged',runId:'forged',prices:[999999]})));
assert.equal(valid.status,200);assert.deepEqual(await valid.json(),{ok:true,results:[]});assert.equal(workCalls,1);
throwWorker=true;
assert.equal((await handler(req('POST',token))).status,503);

// Import the generated deployment artifact and run one empty cycle with a DB stub.
const {runPaperWorker}=await import('../supabase/functions/trading-paper-worker/worker.js');
const selected=[];
const chain={select:()=>chain,in:(field,statuses)=>{selected.push(field,...statuses);return chain;},order:()=>chain,limit:async n=>{assert.equal(n,8);return {data:[],error:null};}};
assert.deepEqual(await runPaperWorker({from:table=>{assert.equal(table,'trading_paper_runs');return chain;}}),[]);
assert.deepEqual(selected,['status','running','paused','stopping']);
console.log('PASS: Edge method/token authentication, fail-closed database/network errors, no client-selected runs/prices, authorized dispatch, worker failure response, and generated bundle empty-cycle smoke check.');
