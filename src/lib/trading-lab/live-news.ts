import { NextRequest } from "next/server";
import { POST as research } from "@/app/api/research/chat/route";

export async function researchMarketNews(req:NextRequest,snapshot:any) {
  const requestedAt=new Date().toISOString();
  const marketUsable=!snapshot.demo && snapshot.dataQuality?.price==="reported";
  const evidence=marketUsable?{symbol:snapshot.symbol,timeframe:snapshot.interval,barTime:snapshot.asOf,technical:snapshot.technical,volume:snapshot.volume,structure:{...snapshot.structure,levels:snapshot.structure?.levels?.slice(0,12)},macro:snapshot.fundamental,decision:snapshot.decision}:{symbol:snapshot.symbol,marketStatus:"No fresh real price/volume snapshot. Do not align news with demo or stale candles."};
  const message=`Research current gold/XAU USD news as of ${requestedAt}, prioritizing the last 24 hours and explaining older context explicitly. Find sources for central-bank/rate expectations, inflation and economic releases, dollar/yields, and relevant geopolitical events. State article publication dates when available and distinguish them from this retrieval time. Do not invent missing dates.\nUse headings: Current news and sources; Fundamental implications; Alignment or conflict with technical evidence; Volume and Wyckoff confirmation; Missing evidence and invalidation. Distinguish sourced facts from interpretation. Do not claim a headline caused a price move. OHLC volume cannot prove buying/selling aggression. Preserve the supplied deterministic decision state; never recommend execution or invent a combined win probability. If market data are missing, news-only analysis is allowed but technical/volume alignment must be unavailable.\nServer market evidence: ${JSON.stringify(evidence)}`;
  const response=await research(new NextRequest(req.url,{method:"POST",headers:req.headers,body:JSON.stringify({message,history:[],projectIds:[],requireCitations:true})}));
  const data=await response.json();
  const citations=(Array.isArray(data.citations)?data.citations:[]).filter((c:any)=>typeof c.url==="string"&&/^https:\/\//.test(c.url)).map((c:any)=>({title:String(c.title||c.url),url:c.url}));
  if(!response.ok || !data.reply || !citations.length) return {status:"unavailable",requestedAt,completedAt:new Date().toISOString(),marketAsOf:marketUsable?snapshot.asOf:null,alignmentAvailable:false,reply:null,citations:[],sessionId:null,error:"Current news could not be verified. Check the existing research provider configuration; no uncited fallback is presented."};
  return {status:"available",requestedAt,completedAt:new Date().toISOString(),marketAsOf:marketUsable?snapshot.asOf:null,alignmentAvailable:marketUsable,reply:data.reply,citations,sessionId:data.sessionId??null,error:null};
}
