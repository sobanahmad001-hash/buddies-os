import { z } from "zod";
import type { StrategyVersion } from "./strategy-schema";
export const PAPER_ENGINE_VERSION="paper-events-v1";
export const timeframeSeconds:Record<string,number>={"1m":60,"1min":60,"5m":300,"5min":300,"15m":900,"15min":900,"30m":1800,"30min":1800,"1h":3600,"H1":3600,"4h":14400,"H4":14400,"1day":86400,"D1":86400};
const pos=z.number().finite().positive();const nonneg=z.number().finite().nonnegative();
export const paperConfigSchema=z.object({
  symbol:z.string().min(1).max(40),currency:z.literal("USD"),quantityUnit:z.enum(["units","lots","contracts"]),
  contractSize:pos,tickSize:pos,quantityStep:pos,minimumQuantity:pos,marginRate:z.number().min(0).max(1),
  initialCapital:pos,riskAmount:pos,spread:nonneg,slippage:nonneg,commissionPerUnit:nonneg,
  financingPerUnitDay:z.number().finite(),maxFillQuantity:pos.nullable().default(null),
  sessionTimezone:z.string().min(1),sessionStart:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),sessionEnd:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  weekdays:z.array(z.number().int().min(0).max(6)).min(1),maxDailyLossPct:pos.max(100),maxDrawdownPct:pos.max(100),
  maxConcurrentPositions:z.number().int().min(1).max(20),maxTradesPerSession:z.number().int().min(1).max(100),targetSample:z.number().int().min(2).max(1000),
  maxDataAgeSeconds:z.number().int().min(60).max(600),feed:z.literal("twelve_data_1min"),
  ambiguityPolicy:z.literal("conservative_stop_first"),stopPolicy:z.literal("cancel_orders_close_next_bar"),
  contractEvidence:z.string().min(10).max(2000),
}).strict().superRefine((c,ctx)=>{try{new Intl.DateTimeFormat("en",{timeZone:c.sessionTimezone});}catch{ctx.addIssue({code:"custom",path:["sessionTimezone"],message:"Use an IANA timezone"});}if(c.minimumQuantity<c.quantityStep)ctx.addIssue({code:"custom",message:"Minimum quantity cannot be below its step"});if(c.riskAmount>c.initialCapital)ctx.addIssue({code:"custom",message:"Risk exceeds initial capital"});});
export type PaperConfig=z.infer<typeof paperConfigSchema>;
export const paperOrderSchema=z.object({
  orderId:z.string().uuid(),planId:z.string().uuid(),direction:z.enum(["long","short"]),type:z.enum(["market","limit","stop"]),
  entry:pos,stopLoss:pos,takeProfit:pos,quantity:pos,expiresAt:z.string().datetime({offset:true}),reason:z.string().min(1).max(2000),
}).strict().superRefine((o,c)=>{if(!(o.direction==="long"?o.stopLoss<o.entry&&o.entry<o.takeProfit:o.takeProfit<o.entry&&o.entry<o.stopLoss))c.addIssue({code:"custom",message:"Entry must lie between initial SL and TP"});});
export const paperCommandSchema=z.discriminatedUnion("action",[
  z.object({action:z.literal("create"),requestId:z.string().uuid(),name:z.string().min(2).max(120),experimentId:z.string().uuid(),mode:z.enum(["manual","rules"]),config:paperConfigSchema,approved:z.literal(true)}).strict(),
  z.object({action:z.literal("order"),requestId:z.string().uuid(),runId:z.string().uuid(),expectedRevision:z.number().int().nonnegative(),order:paperOrderSchema}).strict(),
  z.object({action:z.enum(["start","pause","resume","stop","cancel","close","protection"]),requestId:z.string().uuid(),runId:z.string().uuid(),expectedRevision:z.number().int().nonnegative(),orderId:z.string().uuid().optional(),quantity:pos.optional(),stopLoss:pos.optional(),takeProfit:pos.optional(),reason:z.string().min(1).max(2000)}).strict(),
  z.object({action:z.literal("replay"),requestId:z.string().uuid(),strategyVersionId:z.string().uuid(),name:z.string().min(2).max(120),config:paperConfigSchema,bars:z.array(z.object({time:z.string().datetime({offset:true}),open:pos,high:pos,low:pos,close:pos,volume:nonneg.nullable()})).min(60).max(15000),datasetLabel:z.string().min(1).max(500),provenance:z.enum(["uploaded_market","synthetic_test"])}).strict(),
  z.object({action:z.literal("pair"),requestId:z.string().uuid(),runId:z.string().uuid(),orderId:z.string().uuid(),brokerTradeId:z.string().uuid(),reason:z.string().min(1).max(2000)}).strict(),
]);
export type RuleCapability={key:string;label:string;status:"automatic"|"manual"|"unsupported";detail:string};
const operand=(x:unknown):boolean=>typeof x==="number"||typeof x==="boolean"||typeof x==="string"&&(/^(open|high|low|close|volume)$/.test(x)||/^(ema|rsi|atr|rolling_high|rolling_low)_(?:[1-9]\d{0,2})$/.test(x));
export function strategyCapabilities(s:StrategyVersion):RuleCapability[]{
  const rows:RuleCapability[]=[];
  const visit=(g:any,path:string)=>g?.conditions?.forEach((r:any,i:number)=>{const key=`${path}.${i}`;if(r.conditions){visit(r,key);return;}const manual=String(r.left).startsWith("manual:");const supported=operand(r.left)&&(Array.isArray(r.right)?r.right.every(operand):operand(r.right))&&!!timeframeSeconds[r.timeframe??s.timeframes.trigger]&&r.completedCandleOnly!==false;
    rows.push({key,label:`${r.left} ${r.operator} ${JSON.stringify(r.right)}`,status:manual?"manual":supported?"automatic":"unsupported",detail:manual?"Requires a recorded human assessment; blocks rule-driven paper.":supported?`Completed ${r.timeframe??s.timeframes.trigger} candles; chronological evaluation.`:"Operand, timeframe or incomplete-candle semantics not implemented."});});
  if(s.direction==="both"){visit(s.longEntry,"longEntry");visit(s.shortEntry,"shortEntry");}else visit(s.entry,"entry");
  rows.push({key:"exits",label:"Stops and targets",status:["fixed","atr"].includes(s.exit.stopType)&&["fixed","risk_multiple"].includes(s.exit.targetType)&&!!s.exit.stopValue&&(s.exit.targetType==="time"?!!s.exit.maxBars:!!s.exit.targetValue)?"automatic":"unsupported",detail:"Fixed/ATR stop; fixed/R target and optional maxBars exit. Standalone time, structure and trailing targets are unsupported."});
  rows.push({key:"sizing",label:"Position sizing",status:["fixed","fixed_risk_usd"].includes(s.sizing.type)?"automatic":"unsupported",detail:"Fixed quantity or fixed monetary risk. No progressive or volatility sizing in this engine version."});
  rows.push({key:"timing",label:"Execution timing",status:s.execution.timing==="next_open"&&!!timeframeSeconds[s.timeframes.trigger]?"automatic":"unsupported",detail:"Next eligible 1-minute bar open after the decision receipt; forward polling may delay eligibility."});
  rows.push({key:"news",label:"News veto",status:s.safety.eventVeto?"manual":"automatic",detail:s.safety.eventVeto?"No authoritative event-veto adapter configured; blocks rule-driven execution.":"This version does not require an event veto."});
  return rows;
}
