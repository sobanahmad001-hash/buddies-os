import { timingSafeEqual } from "node:crypto";
import { NextRequest,NextResponse } from "next/server";
import { runPaperWorker } from "@/lib/trading-lab/paper-service";
export const maxDuration=60;
export async function POST(req:NextRequest){const secret=process.env.TRADING_PAPER_WORKER_SECRET;const token=req.headers.get("authorization")?.replace(/^Bearer /,"");if(!secret||!token||Buffer.byteLength(secret)!==Buffer.byteLength(token)||!timingSafeEqual(Buffer.from(secret),Buffer.from(token)))return NextResponse.json({error:"Unauthorized"},{status:401});try{return NextResponse.json({results:await runPaperWorker()});}catch{return NextResponse.json({error:"Worker could not complete this cycle"},{status:503});}}
