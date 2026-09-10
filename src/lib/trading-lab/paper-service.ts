import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveConnectorSecret } from "./connector-secrets";
import { paperConfigSchema, strategyCapabilities, PAPER_ENGINE_VERSION, type PaperConfig } from "./paper-contracts";
import { newPaperState, paperCommand, processPaperBars, runPaperReplay, stablePaperId, validateBars, type PaperState, type PaperEffect } from "./paper-engine";
import { validateStrategyVersion, type StrategyVersion } from "./strategy-schema";
import { planChecks } from "./pretrade";
import type { LabCandle } from "./engine";

export async function fetchPaperBars(userId:string,symbol:string,age:number,initial=false,now=Date.now()):Promise<LabCandle[]> {
  const key=await resolveConnectorSecret(userId,"twelve_data");if(!key)throw new Error("Connect Twelve Data for one-minute market bars. Synthetic data is never substituted for a forward paper run.");
  const query=new URLSearchParams({symbol,interval:"1min",timezone:"UTC",outputsize:initial?"5000":"240",apikey:key});
  const response=await fetch(`https://api.twelvedata.com/time_series?${query}`,{signal:AbortSignal.timeout(12000),cache:"no-store"});
  if(!response.ok)throw new Error(`Price provider unavailable (${response.status})`);
  const raw=await response.json();if(!Array.isArray(raw.values))throw new Error("Price provider returned no one-minute bars. Check connector access and symbol support.");
  const bars:LabCandle[]=raw.values.map((v:any)=>({time:new Date(`${String(v.datetime).replace(" ","T")}Z`).toISOString(),open:Number(v.open),high:Number(v.high),low:Number(v.low),close:Number(v.close),volume:v.volume===undefined||v.volume===null?null:Number(v.volume)})).sort((a:LabCandle,b:LabCandle)=>Date.parse(a.time)-Date.parse(b.time)).filter((b:LabCandle)=>Date.parse(b.time)+60000<=now);
  validateBars(bars);if(!bars.length||now-Date.parse(bars.at(-1)!.time)-60000>age*1000)throw new Error("Market bars are stale or unavailable. No new fills or signals have been inferred.");
  return bars;
}
export function validatePaperReadiness(c:PaperConfig,s:StrategyVersion,mode:string) {
  const symbol=(x:string)=>x.toUpperCase().replace(/[\s/]/g,"");if(!s.symbols.some(x=>symbol(x)===symbol(c.symbol)))throw new Error("Paper instrument is outside the selected strategy");
  if(c.maxConcurrentPositions>s.safety.maxConcurrentPositions||c.maxTradesPerSession>s.safety.maxTradesPerSession||c.maxDailyLossPct>s.safety.maxDailyLossPct||c.maxDrawdownPct>s.safety.maxDrawdownPct)throw new Error("Paper risk limits cannot exceed the strategy limits");
  if(c.maxFillQuantity!==null&&(c.maxFillQuantity<c.quantityStep||Math.abs(c.maxFillQuantity/c.quantityStep-Math.round(c.maxFillQuantity/c.quantityStep))>1e-6))throw new Error("Simulated fill capacity must match the quantity step");
  if(mode!=="manual"){
    const blocked=strategyCapabilities(s).filter(r=>r.status!=="automatic");if(blocked.length)throw new Error(`Automation blocked: ${blocked.map(r=>r.label).join(", ")}`);
    if(s.sizing.type==="fixed_risk_usd"&&s.sizing.value!==c.riskAmount)throw new Error("Strategy fixed risk and experiment risk must match");
    if(s.execution.spread!==c.spread||s.execution.slippage!==c.slippage)throw new Error("Strategy spread/slippage and experiment fill assumptions must match");
  }
}
function normalizeEffects(effects:PaperEffect[],run:any,at:string){return effects.map(effect=>{
  if(effect.kind!=="plan")return effect;const p=effect.payload;const assessments:any={...p.checks};
  for(const check of planChecks(run.strategy_snapshot,p.direction).filter(c=>c.key.startsWith("safety.")))assessments[check.key]={status:"pass",evidence:`Deterministic paper readiness and account state under ${PAPER_ENGINE_VERSION}; run ${run.id}.`};
  return {...effect,payload:{requestId:effect.orderId,strategyVersionId:run.strategy_version_id,experimentId:run.experiment_id,
    instrument:run.config.symbol,direction:p.direction,entry:p.entry,stopLoss:p.stopLoss,takeProfit:p.takeProfit,quantity:p.quantity,quantityUnit:run.config.quantityUnit,
    riskAmount:run.config.riskAmount,riskCurrency:run.config.currency,session:`${run.config.sessionTimezone} ${run.config.sessionStart}–${run.config.sessionEnd}`,
    context:`Rule-driven paper signal; ${PAPER_ENGINE_VERSION}; run ${run.id}; recorded before the next eligible fill.`,observedAt:p.observedAt,validUntil:p.validUntil,notExecutedYet:true,predictedProbability:null,assessments},
    assessment:{schemaVersion:1,mode:"paper_rule_assessment",verdict:"REVIEW",entryStatus:"pass",safetyStatus:"pass",checks:Object.entries(assessments).map(([key,v]:any)=>({key,...v})),probability:{value:null,source:"none",calibration:"unavailable"},engineVersion:PAPER_ENGINE_VERSION,recordedAt:at}};
});}
async function commit(admin:any,run:any,eventId:string,event:any,state:PaperState,effects:PaperEffect[]=[]) {
  const r=await admin.rpc("commit_paper_event",{p_run_id:run.id,p_actor:run.user_id,p_event_id:eventId,p_expected_revision:run.revision,p_event:event,p_state:state,p_effects:normalizeEffects(effects,run,event.receivedAt??new Date().toISOString())});
  if(r.error)throw new Error(r.error.message);return r.data;
}
export async function executePaperCommand(userId:string,input:any,now=new Date().toISOString()) {
  const admin=createAdminClient();
  if(input.action==="create"||input.action==="replay") {
    const old=await admin.from("trading_paper_runs").select("*").eq("id",input.requestId).eq("user_id",userId).maybeSingle();
    if(old.error)throw new Error("Paper database is unavailable");
    if(old.data){if(JSON.stringify(old.data.create_request)!==JSON.stringify(input)){
      // JSONB key order is not significant; database verifies equality on retry below.
      const r=await admin.rpc("create_paper_run",{p_id:input.requestId,p_actor:userId,p_request:input,p_config:old.data.config,p_state:old.data.state});if(r.error)throw new Error(r.error.message);return {run:r.data};
    }return {run:old.data};}
    const c=paperConfigSchema.parse(input.config);let s:StrategyVersion;
    if(input.action==="create"){
      const e=await admin.from("trading_experiments").select("*").eq("id",input.experimentId).eq("user_id",userId).single();if(e.error)throw new Error("Owned experiment not found");
      if(e.data.protocol.executionSource!=="paper"||e.data.protocol.accountType!=="demo")throw new Error("Create a dedicated paper experiment first");
      s=validateStrategyVersion(e.data.strategy_snapshot).data!;
    }else{const v=await admin.from("trading_strategy_versions").select("definition").eq("id",input.strategyVersionId).eq("user_id",userId).single();if(v.error)throw new Error("Owned version not found");s=validateStrategyVersion(v.data.definition).data!;}
    if(!s)throw new Error("Strategy definition is invalid");validatePaperReadiness(c,s,input.mode??"rules");
    const state=input.action==="replay"?runPaperReplay(input.requestId,c,s,input.bars):newPaperState(input.requestId,input.mode,c,now);
    if(input.action==="replay")state.status="completed";
    const saved=await admin.rpc("create_paper_run",{p_id:input.requestId,p_actor:userId,p_request:input,p_config:c,p_state:state});if(saved.error)throw new Error(saved.error.message);return {run:saved.data};
  }
  const result=await admin.from("trading_paper_runs").select("*").eq("id",input.runId).eq("user_id",userId).single();if(result.error)throw new Error("Owned paper run not found");const run=result.data;
  if(input.action==="pair"){
    const order=run.state.orders.find((o:any)=>o.id===input.orderId);if(!order?.filled)throw new Error("Paper order has not filled");
    const broker=await admin.from("trading_entries").select("id,decision_id,execution_source").eq("id",input.brokerTradeId).eq("user_id",userId).single();
    if(broker.error||broker.data.execution_source!=="broker_manual"||broker.data.decision_id!==order.planId)throw new Error("Pair requires a broker execution of the same original locked plan");
    const old=await admin.from("trading_execution_pairs").select("*").eq("id",input.requestId).eq("user_id",userId).maybeSingle();if(old.error)throw new Error("Cannot verify previous pair");
    if(old.data){if(old.data.run_id!==run.id||old.data.paper_trade_id!==order.id||old.data.broker_trade_id!==input.brokerTradeId||old.data.reason!==input.reason)throw new Error("Pair request belongs to different evidence");return {pair:old.data};}
    const pair=await admin.from("trading_execution_pairs").insert({id:input.requestId,user_id:userId,run_id:run.id,paper_trade_id:order.id,broker_trade_id:input.brokerTradeId,reason:input.reason}).select().single();if(pair.error)throw new Error(pair.error.message);return {pair:pair.data};
  }
  const prior=await admin.from("trading_paper_events").select("event").eq("id",input.requestId).eq("user_id",userId).maybeSingle();if(prior.error)throw new Error("Cannot verify prior paper command");
  if(prior.data)return {run:await commit(admin,run,input.requestId,{command:input},run.state)};
  if(run.revision!==input.expectedRevision)throw new Error("Paper run changed; reload before submitting another command");
  if(run.mode==="replay")throw new Error("Historical runs are immutable; create a new replay");
  if(["start","resume"].includes(input.action)){validatePaperReadiness(run.config,run.strategy_snapshot,run.mode);await fetchPaperBars(userId,run.config.symbol,run.config.maxDataAgeSeconds);}
  if(input.action==="order"){
    const plan=await admin.from("trading_decisions").select("*").eq("id",input.order.planId).eq("user_id",userId).single();
    if(plan.error||plan.data.strategy_version_id!==run.strategy_version_id||plan.data.experiment_id!==run.experiment_id)throw new Error("Select a locked plan from this exact experiment");
    const p=plan.data.plan_snapshot;const o=input.order;
    if(plan.data.assessment_snapshot.entryStatus!=="pass"||plan.data.assessment_snapshot.safetyStatus!=="pass")throw new Error("Required plan conditions and safety checks must pass before a paper order");
    if(p.direction!==o.direction||p.entry!==o.entry||p.stopLoss!==o.stopLoss||p.takeProfit!==o.takeProfit||p.quantity!==o.quantity||p.quantityUnit!==run.config.quantityUnit||Date.parse(o.expiresAt)>Date.parse(p.validUntil)||Date.parse(p.validUntil)<=Date.parse(now))throw new Error("Paper order must match its unexpired frozen plan and units");
    if(run.state.orders.some((x:any)=>x.planId===o.planId))throw new Error("This plan already has a paper order in the run");
  }
  const state=paperCommand(run.state,run.config,input,now);return {run:await commit(admin,run,input.requestId,{command:input},state)};
}
export async function processPaperRun(admin:any,run:any,receivedAt=new Date().toISOString()) {
  try {
    const bars=await fetchPaperBars(run.user_id,run.config.symbol,run.config.maxDataAgeSeconds,!run.state.lastTime,Date.parse(receivedAt));
    const retained=new Map<string,LabCandle>(run.state.history.map((b:LabCandle)=>[b.time,b]));
    if(bars.some(b=>{const old=retained.get(b.time);return old&&["open","high","low","close","volume"].some(k=>old[k as keyof LabCandle]!==b[k as keyof LabCandle]);}))throw new Error("Provider revised previously recorded market evidence. Original prices are preserved; review the dataset before resuming.");
    const next=processPaperBars(run.state,run.config,run.strategy_snapshot,bars,receivedAt);
    if(next.state.lastTime===run.state.lastTime&&next.state.lastError===run.state.lastError)return {id:run.id,status:run.status,unchanged:true};
    const event={kind:"market_batch",source:"Twelve Data 1min UTC",receivedAt,bars:bars.filter(b=>!run.state.lastTime||Date.parse(b.time)>Date.parse(run.state.lastTime)),engineVersion:PAPER_ENGINE_VERSION};
    const saved=await commit(admin,run,stablePaperId(`${run.id}:${run.revision}:${receivedAt}`),event,next.state,next.effects);
    return {id:run.id,status:saved.status,revision:saved.revision};
  }catch(e){const error=(e as Error).message;if(/changed|40001/i.test(error))return {id:run.id,status:"retry",error:"Concurrent update; next worker tick retries from saved state"};
    const state={...run.state,status:"failed",lastError:error} as PaperState;
    try{await commit(admin,run,stablePaperId(`${run.id}:${run.revision}:error:${error}`),{kind:"feed_or_execution_error",error},state);}catch{/* Another worker/command advanced the run; never overwrite it. */}
    return {id:run.id,status:"failed",error};
  }
}
export async function runPaperWorker(admin=createAdminClient()) {
  const found=await admin.from("trading_paper_runs").select("*").in("status",["running","paused","stopping"]).order("updated_at").limit(8);if(found.error)throw new Error("Paper worker could not load active runs");
  const results=[];for(let i=0;i<(found.data?.length??0);i+=2)results.push(...await Promise.all(found.data!.slice(i,i+2).map(r=>processPaperRun(admin,r))));return results;
}
