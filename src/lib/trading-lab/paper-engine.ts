import { createHash } from "node:crypto";
import { atr, ema, rsi, type LabCandle } from "./engine";
import { PAPER_ENGINE_VERSION, timeframeSeconds, strategyCapabilities, type PaperConfig } from "./paper-contracts";
import type { StrategyVersion } from "./strategy-schema";

export const stablePaperId=(seed:string)=>{const h=createHash("sha256").update(seed).digest("hex");return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;};
export type PaperOrder={id:string;planId:string|null;planRequestId:string|null;direction:"long"|"short";type:"market"|"limit"|"stop";entry:number;stop:number;target:number;quantity:number;risk:number;submittedAt:string;expiresAt:string;initiator:"human"|"rules";status:"pending"|"partial"|"filled"|"closed"|"cancelled"|"rejected"|"expired";filled:number;remaining:number;averageEntry:number;exitQuantity:number;exitNotional:number;fees:number;financing:number;gross:number;revision:number;openedAt:string|null;closedAt:string|null;reason:string;maxBars?:number;closeRequest?:{quantity:number;at:string;reason:string};protectionRequest?:{stop:number;target:number;at:string;reason:string};assumptions:string[];lastFinancedAt?:string};
export type PaperState={engineVersion:string;runId:string;mode:"manual"|"rules"|"replay";createdAt:string;status:"ready"|"running"|"paused"|"stopping"|"completed"|"failed";balance:number;equity:number;peak:number;maxDrawdown:number;day:string;dayEquity:number;sessionTrades:number;lastTime:string|null;lastSignalTime:string|null;history:LabCandle[];orders:PaperOrder[];curve:{time:string;balance:number;equity:number}[];observations:number;qualifying:number;missed:number;warnings:string[];allowGap:boolean;lastError:string|null;lastEvaluation?:any};
export type PaperEffect={requestId:string;orderId:string;kind:"plan"|"open"|"add_fill"|"change_protection"|"partial_exit"|"close";expectedRevision:number;payload:any};
const ms=(s:string)=>Date.parse(s);const iso=(n:number)=>new Date(n).toISOString();
const money=(n:number)=>Math.round(n*1e8)/1e8;
export function newPaperState(runId:string,mode:PaperState["mode"],c:PaperConfig,at:string):PaperState{return {engineVersion:PAPER_ENGINE_VERSION,runId,mode,createdAt:at,status:"ready",balance:c.initialCapital,equity:c.initialCapital,peak:c.initialCapital,maxDrawdown:0,day:"",dayEquity:c.initialCapital,sessionTrades:0,lastTime:null,lastSignalTime:null,history:[],orders:[],curve:[],observations:0,qualifying:0,missed:0,warnings:[],allowGap:false,lastError:null};}
export function validateBars(bars:LabCandle[]) {
  let prior=-Infinity;
  for(const b of bars){const time=ms(b.time);if(!Number.isFinite(time)||time%60000!==0||time<=prior||![b.open,b.high,b.low,b.close].every(v=>Number.isFinite(v)&&v>0)||b.low>Math.min(b.open,b.close)||b.high<Math.max(b.open,b.close)||b.low>b.high||(b.volume!==null&&(!Number.isFinite(b.volume)||b.volume<0)))throw new Error("Price data must be chronological, unique, aligned one-minute OHLC candles with valid prices.");prior=time;}
}
export function completedBars(history:LabCandle[],seconds:number,asOf:number):LabCandle[]{
  const count=seconds/60;if(!Number.isInteger(count)||count<1)return [];
  const groups=new Map<number,LabCandle[]>();for(const b of history){const start=Math.floor(ms(b.time)/(seconds*1000))*seconds*1000;if(start+seconds*1000>asOf)continue;const g=groups.get(start)??[];g.push(b);groups.set(start,g);}
  return [...groups].filter(([start,g])=>g.length===count&&g.every((b,i)=>ms(b.time)===start+i*60000)).map(([start,g])=>({time:iso(start),open:g[0].open,close:g.at(-1)!.close,high:Math.max(...g.map(b=>b.high)),low:Math.min(...g.map(b=>b.low)),volume:g.some(b=>b.volume===null)?null:g.reduce((n,b)=>n+b.volume!,0)}));
}
function value(x:unknown,bars:LabCandle[]):number|boolean|null {
  if(typeof x==="number"||typeof x==="boolean")return x;if(typeof x!=="string"||!bars.length)return null;
  if(["open","high","low","close","volume"].includes(x))return bars.at(-1)![x as keyof Omit<LabCandle,"time">];
  const match=x.match(/^(ema|rsi|atr|rolling_high|rolling_low)_(\d+)$/);if(!match)return null;const n=+match[2];if(bars.length<n+(match[1]==="ema"?0:1))return null;
  const closes=bars.map(b=>b.close);if(match[1]==="ema")return ema(closes,n).at(-1)??null;if(match[1]==="rsi")return rsi(closes,n);if(match[1]==="atr")return atr(bars,n);
  const prior=bars.slice(-n-1,-1);return match[1]==="rolling_high"?Math.max(...prior.map(b=>b.high)):Math.min(...prior.map(b=>b.low));
}
export function evaluatePaperRules(strategy:StrategyVersion,history:LabCandle[],at:number,direction:"long"|"short") {
  const checks:Record<string,{status:"pass"|"fail"|"unknown";evidence:string}>={};
  const visit=(group:any,path:string):"pass"|"fail"|"unknown"=>{
    if(!group?.conditions?.length)return "unknown";
    const values=group.conditions.map((r:any,i:number)=>{const key=`${path}.${i}`;if(r.conditions)return visit(r,key);
      const tf=r.timeframe??strategy.timeframes.trigger;const bars=completedBars(history,timeframeSeconds[tf]??0,at);
      const last=bars.at(-1);const fresh=!!last&&at-(ms(last.time)+(timeframeSeconds[tf]??0)*1000)<(timeframeSeconds[tf]??0)*1000;
      const left=fresh?value(r.left,bars):null;const right=Array.isArray(r.right)?r.right.map((v:unknown)=>value(v,bars)):value(r.right,bars);
      let pass:boolean|null=null;
      if(left!==null&&right!==null&&!r.left.startsWith("manual:")&&r.completedCandleOnly!==false){
        if(r.operator==="eq"&&!Array.isArray(right))pass=left===right;
        else if(typeof left==="number"&&typeof right==="number"){
          if(r.operator==="gt")pass=left>right;if(r.operator==="gte")pass=left>=right;if(r.operator==="lt")pass=left<right;if(r.operator==="lte")pass=left<=right;
          if(r.operator.startsWith("crosses_")){const l=value(r.left,bars.slice(0,-1)),rr=value(r.right,bars.slice(0,-1));if(typeof l==="number"&&typeof rr==="number")pass=r.operator==="crosses_above"?l<=rr&&left>right:l>=rr&&left<right;}
        }else if(r.operator==="between"&&typeof left==="number"&&Array.isArray(right)&&right.every(v=>typeof v==="number"))pass=left>=(right[0] as number)&&left<=(right[1] as number);
      }
      const status=pass===null?"unknown":pass?"pass":"fail";checks[key]={status,evidence:`${tf} completed by ${iso(at)}; ${r.left}=${left??"unknown"}; ${r.operator} ${JSON.stringify(right)}.`};return status;
    });
    return group.logic==="all"?(values.includes("fail")?"fail":values.every((v:string)=>v==="pass")?"pass":"unknown"):(values.includes("pass")?"pass":values.every((v:string)=>v==="fail")?"fail":"unknown");
  };
  const group=strategy.direction==="both"?strategy[direction==="long"?"longEntry":"shortEntry"]:strategy.entry;
  return {status:visit(group,"entry"),checks};
}
export function paperSession(c:PaperConfig,at:number) {
  const parts=new Intl.DateTimeFormat("en-GB",{timeZone:c.sessionTimezone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(at);
  const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));const date=`${p.year}-${p.month}-${p.day}`;const min=+p.hour*60 + +p.minute;
  const toMin=(x:string)=>+x.slice(0,2)*60 + +x.slice(3);const start=toMin(c.sessionStart),end=toMin(c.sessionEnd);const overnight=start>end;
  const anchor=new Date(`${date}T12:00:00Z`);if(overnight&&min<end)anchor.setUTCDate(anchor.getUTCDate()-1);
  const active=(start===end||(!overnight?min>=start&&min<end:min>=start||min<end))&&c.weekdays.includes(anchor.getUTCDay());
  return {key:anchor.toISOString().slice(0,10),active};
}
const openOrders=(s:PaperState)=>s.orders.filter(o=>o.remaining>0||((o.status==="pending"||o.status==="partial")&&o.filled<o.quantity));
function available(s:PaperState,c:PaperConfig,at:number){const session=paperSession(c,at);return s.status==="running"&&session.active&&s.sessionTrades<c.maxTradesPerSession&&s.orders.filter(o=>o.filled>0).length<c.targetSample&&s.equity>0&&(s.dayEquity-s.equity)<s.dayEquity*c.maxDailyLossPct/100&&(s.peak-s.equity)<s.peak*c.maxDrawdownPct/100;}
function mark(s:PaperState,c:PaperConfig,price:number){s.equity=money(s.balance+s.orders.reduce((n,o)=>n+(o.remaining>0?(o.direction==="long"?price-c.spread/2-o.averageEntry:o.averageEntry-price-c.spread/2)*o.remaining*c.contractSize:0),0));s.peak=Math.max(s.peak,s.equity);s.maxDrawdown=Math.max(s.maxDrawdown,s.peak-s.equity);}
function effect(out:PaperEffect[],o:PaperOrder,kind:PaperEffect["kind"],payload:any,seed:string){out.push({requestId:stablePaperId(seed),orderId:o.id,kind,expectedRevision:o.revision,payload});if(kind!=="plan")o.revision++;}
export function paperCommand(state:PaperState,c:PaperConfig,command:any,at:string):PaperState {
  const s=structuredClone(state);
  if(command.action==="start"){if(s.status!=="ready")throw new Error("Only a ready run can start");s.status="running";s.createdAt=at;}
  else if(command.action==="pause"){if(s.status!=="running")throw new Error("Only a running experiment can pause");s.status="paused";}
  else if(command.action==="resume"){if(!["paused","failed"].includes(s.status))throw new Error("Run is not paused");s.status="running";s.allowGap=true;s.lastError=null;}
  else if(command.action==="stop"){if(s.status==="completed")return s;s.status="stopping";for(const o of s.orders){if(!o.filled)o.status="cancelled";else if(o.remaining>0){o.quantity=o.filled;o.closeRequest={quantity:o.remaining,at,reason:command.reason};}}if(!s.orders.some(o=>o.remaining>0))s.status="completed";}
  else if(command.action==="order"){
    if(s.mode!=="manual")throw new Error("Manual entries require a manual paper run");if(!available(s,c,ms(at)))throw new Error("Run, session, sample or risk limit blocks a new order");if(openOrders(s).length>=c.maxConcurrentPositions)throw new Error("Concurrent position limit reached");
    const p=command.order;const risk=Math.abs(p.entry-p.stopLoss)*p.quantity*c.contractSize;if(risk>c.riskAmount+1e-7)throw new Error("Order exceeds frozen monetary risk");if(ms(p.expiresAt)<=ms(at))throw new Error("Order has expired");if(s.orders.some(o=>o.id===p.orderId))throw new Error("Order ID already exists");
    if(p.quantity<c.minimumQuantity||Math.abs(p.quantity/c.quantityStep-Math.round(p.quantity/c.quantityStep))>1e-6)throw new Error("Quantity does not match the contract step/minimum");
    s.orders.push(makeOrder({...p,id:p.orderId,stop:p.stopLoss,target:p.takeProfit,submittedAt:at,risk:c.riskAmount,initiator:"human"}));
  }else {
    const o=s.orders.find(x=>x.id===command.orderId);if(!o)throw new Error("Order not found");
    if(command.action==="cancel"){if(o.filled>=o.quantity||["cancelled","expired","rejected"].includes(o.status))throw new Error("No pending quantity to cancel");o.quantity=o.filled;o.status=o.remaining>0?"filled":"cancelled";o.reason=command.reason;}
    else if(command.action==="close"){if(o.remaining<=0)throw new Error("Position is closed");const quantity=command.quantity??o.remaining;if(quantity>o.remaining)throw new Error("Close exceeds remaining position");if(quantity<c.quantityStep||Math.abs(quantity/c.quantityStep-Math.round(quantity/c.quantityStep))>1e-6)throw new Error("Close quantity must match the step");o.quantity=o.filled;o.closeRequest={quantity,at,reason:command.reason};}
    else if(command.action==="protection"){if(o.remaining<=0||!command.stopLoss||!command.takeProfit)throw new Error("Open position and both protection prices required");o.protectionRequest={stop:command.stopLoss,target:command.takeProfit,at,reason:command.reason};}
    else throw new Error("Unknown paper command");
  }
  return s;
}
function makeOrder(p:any):PaperOrder {return {id:p.id,planId:p.planId??null,planRequestId:p.planRequestId??null,direction:p.direction,type:p.type,entry:p.entry,stop:p.stop,target:p.target,quantity:p.quantity,risk:p.risk,submittedAt:p.submittedAt,expiresAt:p.expiresAt,initiator:p.initiator,status:"pending",filled:0,remaining:0,averageEntry:0,exitQuantity:0,exitNotional:0,fees:0,financing:0,gross:0,revision:0,openedAt:null,closedAt:null,reason:p.reason??"Approved rule signal",maxBars:p.maxBars,assumptions:[]};}
export function processPaperBars(state:PaperState,c:PaperConfig,strategy:StrategyVersion,bars:LabCandle[],receivedAt:string){
  validateBars(bars);if(state.engineVersion!==PAPER_ENGINE_VERSION)throw new Error("Run uses a different engine version");
  const s=structuredClone(state);const effects:PaperEffect[]=[];
  for(const b of bars){const t=ms(b.time),end=t+60000;if(end>ms(receivedAt)||s.lastTime&&t<=ms(s.lastTime))continue;
    if(s.lastTime&&t-ms(s.lastTime)>60000&&t>=ms(s.createdAt)){
      if(!s.allowGap){s.status="failed";s.lastError=`Missing bars between ${s.lastTime} and ${b.time}. Resume explicitly to acknowledge unknown price paths, or supply complete evidence.`;break;}
      s.warnings.push(`Acknowledged missing price path: ${s.lastTime} to ${b.time}.`);for(const o of s.orders.filter(o=>o.remaining>0))o.assumptions.push("Missing market evidence during position; outcome path uncertain");s.allowGap=false;
    }
    const seeded=t<ms(s.createdAt);s.lastTime=b.time;s.history.push(b);s.history=s.history.slice(-15000);
    if(seeded||["ready","completed","failed"].includes(s.status))continue;
    const session=paperSession(c,t);if(s.day!==session.key){s.day=session.key;s.dayEquity=s.equity;s.sessionTrades=0;}
    mark(s,c,b.open);
    if(s.status==="running"&&((s.dayEquity-s.equity)>=s.dayEquity*c.maxDailyLossPct/100||(s.peak-s.equity)>=s.peak*c.maxDrawdownPct/100||s.equity<=0)){s.status="stopping";s.warnings.push(`Risk stop at ${b.time}`);for(const o of s.orders){o.quantity=o.filled;if(!o.remaining)o.status="cancelled";else o.closeRequest={quantity:o.remaining,at:b.time,reason:"Frozen account risk limit"};}}
    for(const o of s.orders){
      if(ms(o.submittedAt)>t||["closed","cancelled","expired","rejected"].includes(o.status))continue;
      if(o.protectionRequest&&ms(o.protectionRequest.at)<=t){const p=o.protectionRequest;o.stop=p.stop;o.target=p.target;effect(effects,o,"change_protection",{occurredAt:b.time,stopLoss:o.stop,takeProfit:o.target,reason:p.reason},`${o.id}:${b.time}:protection`);delete o.protectionRequest;}
      const buy=o.direction==="long",sign=buy?1:-1;let intrabarEntry=false;
      if(o.filled<o.quantity&&s.status==="running"){
        if(ms(o.expiresAt)<=t){o.quantity=o.filled;o.status=o.remaining>0?"filled":"expired";}
        else if(!session.active||(!o.filled&&!available(s,c,t))){o.quantity=o.filled;o.status=o.remaining>0?"filled":"cancelled";o.reason="Session, sample or risk limit";}
        else {
          const sideOpen=b.open+sign*c.spread/2,sideLow=b.low+sign*c.spread/2,sideHigh=b.high+sign*c.spread/2;
          let price:number|null=o.type==="market"?sideOpen+sign*c.slippage:null;
          if(o.type==="limit"&&(buy?sideLow<=o.entry:sideHigh>=o.entry)){price=buy?Math.min(o.entry,sideOpen):Math.max(o.entry,sideOpen);intrabarEntry=buy?sideOpen>o.entry:sideOpen<o.entry;}
          if(o.type==="stop"&&(buy?sideHigh>=o.entry:sideLow<=o.entry)){price=(buy?Math.max(o.entry,sideOpen):Math.min(o.entry,sideOpen))+sign*c.slippage;intrabarEntry=buy?sideOpen<o.entry:sideOpen>o.entry;}
          if(price!==null){price=Math.round(price/c.tickSize)*c.tickSize;const qty=Math.min(o.quantity-o.filled,c.maxFillQuantity??Infinity);
            const margin=s.orders.reduce((n,x)=>n+x.remaining*x.averageEntry*c.contractSize*c.marginRate,0);
            if(!(buy?o.stop<price&&price<o.target:o.target<price&&price<o.stop)||Math.abs(price-o.stop)*(o.filled+qty)*c.contractSize>c.riskAmount+1e-7||qty*price*c.contractSize*c.marginRate>s.equity-margin){o.quantity=o.filled;o.status=o.remaining>0?"filled":"rejected";o.reason="Fill would violate protection, risk or available margin";}
            else {const first=o.filled===0;o.averageEntry=(o.averageEntry*o.filled+price*qty)/(o.filled+qty);o.filled=money(o.filled+qty);o.remaining=money(o.remaining+qty);o.fees+=qty*c.commissionPerUnit;s.balance-=qty*c.commissionPerUnit;o.status=o.filled<o.quantity?"partial":"filled";
              if(first){o.openedAt=b.time;o.lastFinancedAt=b.time;s.sessionTrades++;}
              if(intrabarEntry)o.assumptions.push(`Candle entry path assumed at ${b.time}; target deferred until next bar`);
              const payload=first?{planId:o.planId,planRequestId:o.planRequestId,occurredAt:b.time,price,quantity:qty,stopLoss:o.stop,takeProfit:o.target,actualRiskAmount:Math.abs(price-o.stop)*qty*c.contractSize,accountType:"demo",brokerReference:`Paper ${s.runId}`,reason:`Simulated ${o.type} fill; ${o.reason}`,paperRunId:s.runId}:{occurredAt:b.time,price,quantity:qty,reason:"Simulated remaining entry fill"};
              effect(effects,o,first?"open":"add_fill",payload,`${o.id}:${b.time}:entry`);
            }
          }
        }
      }
      if(o.remaining<=0)continue;
      const elapsed=(t-ms(o.lastFinancedAt??o.openedAt!))/86400000;
      if(elapsed>=1){const fee=Math.floor(elapsed)*c.financingPerUnitDay*o.remaining;o.financing+=fee;s.balance+=fee;o.lastFinancedAt=iso(ms(o.lastFinancedAt??o.openedAt!)+Math.floor(elapsed)*86400000);}
      const exitOpen=b.open-sign*c.spread/2,exitLow=b.low-sign*c.spread/2,exitHigh=b.high-sign*c.spread/2;
      const gapStop=buy?exitOpen<=o.stop:exitOpen>=o.stop,gapTarget=buy?exitOpen>=o.target:exitOpen<=o.target;
      const hitStop=buy?exitLow<=o.stop:exitHigh>=o.stop,hitTarget=buy?exitHigh>=o.target:exitLow<=o.target;
      let exit:number|null=null,reason="",quantity=o.remaining;
      if(gapStop){exit=exitOpen-sign*c.slippage;reason="Stop gap";}
      else if(gapTarget&&!intrabarEntry){exit=o.target;reason="Target at open; conservative limit fill";}
      else if(o.closeRequest&&ms(o.closeRequest.at)<=t){exit=exitOpen-sign*c.slippage;quantity=Math.min(o.remaining,o.closeRequest.quantity);reason=o.closeRequest.reason;delete o.closeRequest;}
      else if(hitStop){exit=o.stop-sign*c.slippage;reason=hitTarget?"Both SL and TP touched; conservative stop-first assumption":"Stop";if(hitTarget||intrabarEntry)o.assumptions.push(`${b.time}: ${reason}; actual event order unknown`);}
      else if(hitTarget&&!intrabarEntry){exit=o.target;reason="Target";}
      else if(o.maxBars&&t-ms(o.openedAt!)>=o.maxBars*(timeframeSeconds[strategy.timeframes.trigger]??60)*1000){exit=exitOpen-sign*c.slippage;reason="Time limit";}
      if(exit!==null){exit=Math.max(c.tickSize,Math.round(exit/c.tickSize)*c.tickSize);o.quantity=o.filled;const pnl=sign*(exit-o.averageEntry)*quantity*c.contractSize;o.gross+=pnl;o.fees+=quantity*c.commissionPerUnit;s.balance+=pnl-quantity*c.commissionPerUnit;o.remaining=money(o.remaining-quantity);o.exitQuantity=money(o.exitQuantity+quantity);o.exitNotional+=exit*quantity;o.closedAt=o.remaining===0?iso(end):null;o.status=o.remaining===0?"closed":"filled";
        // OHLC does not reveal the intrabar timestamp; close receipt uses the completed bar boundary.
        const payload:any={occurredAt:iso(end),price:exit,quantity,reason:`Simulated: ${reason}`};
        if(!o.remaining)Object.assign(payload,{pnlAmount:money(o.gross),pnlBasis:"gross",fees:money(o.fees),financing:money(o.financing),pnlEvidence:`${PAPER_ENGINE_VERSION}; retained 1-minute OHLC; declared spread/slippage/contract/cost model. ${o.assumptions.join("; ")}`});
        effect(effects,o,o.remaining>0?"partial_exit":"close",payload,`${o.id}:${b.time}:exit`);
      }
    }
    mark(s,c,b.close);s.curve.push({time:iso(end),balance:money(s.balance),equity:s.equity});s.curve=s.curve.slice(-15000);
    if(session.active && s.status==="running")s.observations++;
    if(s.orders.filter(o=>o.filled>0).length>=c.targetSample&&!s.orders.some(o=>o.remaining>0)){s.status="completed";for(const o of s.orders.filter(o=>!o.filled))o.status="cancelled";}
    if(s.status==="stopping"&&!s.orders.some(o=>o.remaining>0))s.status="completed";
    const trigger=timeframeSeconds[strategy.timeframes.trigger];
    if(s.mode!=="manual"&&available(s,c,end)&&trigger&&end%(trigger*1000)===0&&s.lastSignalTime!==iso(end)){
      s.lastSignalTime=iso(end);const directions: ("long"|"short")[]=strategy.direction==="both"?["long","short"]:[strategy.direction];
      const evaluations=directions.map(direction=>({direction,...evaluatePaperRules(strategy,s.history,end,direction)}));s.lastEvaluation={at:iso(end),evaluations};
      const signals=evaluations.filter(r=>r.status==="pass");
      if(signals.length){s.qualifying++;if(signals.length!==1||openOrders(s).length>=c.maxConcurrentPositions){s.missed++;continue;}
        const signal=signals[0],sign=signal.direction==="long"?1:-1;const triggerBars=completedBars(s.history,trigger,end);const stopDistance=strategy.exit.stopType==="atr"?(atr(triggerBars,14)??NaN)*strategy.exit.stopValue!:strategy.exit.stopValue!;
        if(!Number.isFinite(stopDistance)||stopDistance<=0){s.missed++;continue;}
        const entry=Math.round((b.close+sign*(c.spread/2+c.slippage))/c.tickSize)*c.tickSize;const stop=Math.round((entry-sign*stopDistance)/c.tickSize)*c.tickSize;
        const targetDistance=strategy.exit.targetType==="fixed"?strategy.exit.targetValue!:Math.abs(entry-stop)*(strategy.exit.targetValue??1000);
        const target=Math.round((entry+sign*targetDistance)/c.tickSize)*c.tickSize;
        const desired=strategy.sizing.type==="fixed"?strategy.sizing.value:c.riskAmount/(Math.abs(entry-stop)*c.contractSize);
        const quantity=money(Math.floor(desired/c.quantityStep+1e-9)*c.quantityStep);const risk=quantity*Math.abs(entry-stop)*c.contractSize;
        if(quantity<c.minimumQuantity||risk>c.riskAmount+1e-7||Math.min(entry,stop,target)<=0){s.missed++;continue;}
        const id=stablePaperId(`${s.runId}:${iso(end)}:${signal.direction}`),at=s.mode==="replay"?iso(end):receivedAt;
        const o=makeOrder({id,planRequestId:id,direction:signal.direction,type:"market",entry,stop,target,quantity,risk:c.riskAmount,submittedAt:at,expiresAt:iso(ms(at)+Math.max(trigger*2000,600000)),initiator:"rules",maxBars:strategy.exit.maxBars});
        s.orders.push(o);effect(effects,o,"plan",{entry,stopLoss:stop,takeProfit:target,quantity,direction:signal.direction,observedAt:iso(end),validUntil:o.expiresAt,checks:signal.checks,riskAmount:risk},`${id}:plan`);
      }
    }
  }
  return {state:s,effects};
}
export function runPaperReplay(runId:string,c:PaperConfig,strategy:StrategyVersion,bars:LabCandle[]) {
  if(strategyCapabilities(strategy).some(r=>r.status!=="automatic"))throw new Error("Strategy contains rules unsupported by the replay engine. Check Implementation.");
  validateBars(bars);let state=newPaperState(runId,"replay",c,bars[0].time);state.status="running";
  state=processPaperBars(state,c,strategy,bars,iso(ms(bars.at(-1)!.time)+60000)).state;
  if(state.orders.some(o=>o.remaining>0))state.warnings.push("Dataset ended with open positions; realized metrics exclude their unresolved outcomes.");
  return state;
}
export function paperMetrics(s:PaperState){const closed=s.orders.filter(o=>o.status==="closed"),net=(o:PaperOrder)=>o.gross-o.fees+o.financing;const wins=closed.filter(o=>net(o)>0),losses=closed.filter(o=>net(o)<0);const sum=(xs:PaperOrder[])=>xs.reduce((n,o)=>n+net(o),0);const r=(o:PaperOrder)=>net(o)/o.risk;return {closed:closed.length,open:s.orders.filter(o=>o.remaining>0).length,wins:wins.length,losses:losses.length,breakevens:closed.length-wins.length-losses.length,winRate:closed.length?wins.length/closed.length*100:null,netPnl:money(sum(closed)),expectancyR:closed.length?closed.reduce((n,o)=>n+r(o),0)/closed.length:null,averageWinR:wins.length?wins.reduce((n,o)=>n+r(o),0)/wins.length:null,averageLossR:losses.length?losses.reduce((n,o)=>n+r(o),0)/losses.length:null,profitFactor:losses.length?sum(wins)/Math.abs(sum(losses)):null,balance:s.balance,equity:s.equity,maxDrawdown:s.maxDrawdown,observedMinutes:s.observations,qualifyingSetups:s.mode==="manual"?null:s.qualifying,missedSetups:s.mode==="manual"?null:s.missed,ambiguousTrades:closed.filter(o=>o.assumptions.length>0).length,evidence:"Simulation under declared assumptions; descriptive sample, no conclusive edge claim"};}
