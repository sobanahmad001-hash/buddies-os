import { NextRequest,NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { paperCommandSchema, PAPER_ENGINE_VERSION } from "@/lib/trading-lab/paper-contracts";
import { paperMetrics } from "@/lib/trading-lab/paper-engine";
import { executePaperCommand } from "@/lib/trading-lab/paper-service";
import { readAll } from "@/lib/trading-lab/manual-data";
export const maxDuration=60;
export async function GET(req:NextRequest){const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  try{const id=req.nextUrl.searchParams.get("id");if(id&&!z.string().uuid().safeParse(id).success)return NextResponse.json({error:"Invalid run ID"},{status:400});
    if(!id){const r=await db.from("trading_paper_runs").select("id,name,mode,status,experiment_id,strategy_version_id,revision,created_at,updated_at").eq("user_id",user.id).order("created_at",{ascending:false}).limit(100);if(r.error)throw new Error("Paper workspace is unavailable. Verify its database migration.");return NextResponse.json({runs:r.data,engineVersion:PAPER_ENGINE_VERSION});}
    const r=await db.from("trading_paper_runs").select("*").eq("id",id).eq("user_id",user.id).maybeSingle();if(r.error)throw new Error("Paper run could not be loaded");if(!r.data)return NextResponse.json({error:"Run not found"},{status:404});
    const [events,pairs]=await Promise.all([readAll(db.from("trading_paper_events").select("id,revision,event,recorded_at").eq("user_id",user.id).eq("run_id",id).order("revision").order("id")),readAll(db.from("trading_execution_pairs").select("*,broker:trading_entries!broker_trade_id(id,net_pnl,planned_risk_amount,closed_at,review_snapshot),paper:trading_entries!paper_trade_id(id,net_pnl,planned_risk_amount,closed_at)").eq("user_id",user.id).eq("run_id",id).order("id"))]);
    const comparable=pairs.filter((p:any)=>p.broker?.net_pnl!==null&&p.paper?.net_pnl!==null&&p.broker?.closed_at&&p.paper?.closed_at);
    const comparison={pairs:comparable.length,paperR:comparable.reduce((n:number,p:any)=>n+p.paper.net_pnl/p.paper.planned_risk_amount,0),brokerR:comparable.reduce((n:number,p:any)=>n+p.broker.net_pnl/p.paper.planned_risk_amount,0),note:"Same original decisions and planned risk. Gap includes feed/model/cost differences; it is not automatically behavioral cost."};
    return NextResponse.json({run:r.data,metrics:paperMetrics(r.data.state),events,pairs,comparison});
  }catch(e){return NextResponse.json({error:(e as Error).message},{status:503});}}
export async function POST(req:NextRequest){const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});const parsed=paperCommandSchema.safeParse(await req.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:parsed.error.issues[0]?.message,issues:parsed.error.issues},{status:400});try{return NextResponse.json(await executePaperCommand(user.id,parsed.data));}catch(e){return NextResponse.json({error:(e as Error).message},{status:409});}}
