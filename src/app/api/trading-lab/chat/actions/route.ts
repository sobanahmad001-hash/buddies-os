import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { chatActionSchema } from "@/lib/trading-lab/chat";
import { dbError } from "@/lib/trading-lab/manual-data";

function identity(id:string) {const h=createHash("sha256").update(`lab-action:${id}`).digest("hex");return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;}
export async function POST(req:NextRequest) {
  const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  const p=z.object({sessionId:z.string().uuid(),requestId:z.string().uuid(),expectedRevision:z.number().int().nonnegative(),approved:z.literal(true)}).strict().safeParse(await req.json().catch(()=>null));
  if(!p.success)return NextResponse.json({error:"Approve a specific saved proposal."},{status:400});
  const input=p.data;
  const write=(phase:string,payload:any)=>db.rpc("lab_chat_write",{p_session_id:input.sessionId,p_request_id:input.requestId,p_expected_revision:input.expectedRevision,p_phase:phase,p_payload:payload});
  const claim=await write("claim_action",{});
  if(claim.error){const e=dbError(claim.error);return NextResponse.json({error:e.error},{status:e.status});}
  const message=claim.data.message;
  if(message.metadata.status==="executed")return NextResponse.json({receipt:message.metadata.receipt});
  try {
    const action=chatActionSchema.parse(message.metadata.action);const requestId=identity(message.id);
    let handler:(req:NextRequest)=>Promise<NextResponse>;let body:any;
    switch(action.kind) {
      case "save_strategy":handler=(await import("@/app/api/trading-lab/strategies/route")).POST;body={action:"save",...action.input,requestId};break;
      case "create_experiment":case "review_experiment":case "observe":handler=(await import("@/app/api/trading-lab/experiments/route")).POST;body={action:action.kind==="create_experiment"?"create":action.kind==="review_experiment"?"review":"observe",input:{...action.input,requestId}};break;
      case "capture_plan":handler=(await import("@/app/api/trading-lab/plans/route")).POST;body={...action.input,requestId};break;
      case "trade_event":handler=(await import("@/app/api/trading-lab/trades/route")).POST;body={...action.input,requestId};if(body.kind==="open")body.tradeId=identity(`${message.id}:trade`);break;
      case "paper":handler=(await import("@/app/api/trading-lab/paper/route")).POST;body={...action.input,requestId};if(body.action==="order"&&body.order)body.order={...body.order,orderId:identity(`${message.id}:order`)};break;
    }
    // Direct dispatch preserves request authentication; no model-supplied URL is fetched.
    const result=await handler(new NextRequest("http://buddies.internal/api/trading-lab/action",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)}));
    const receipt=await result.json();if(!result.ok)throw new Error(receipt.error||"Save failed");
    const saved=await write("receipt",receipt);
    if(saved.error)throw new Error("Action may have saved, but its receipt was not confirmed. Retry this same proposal to recover it.");
    return NextResponse.json({receipt});
  } catch(e) {
    const error=(e as Error).message;await write("action_error",{error});
    return NextResponse.json({error},{status:409});
  }
}
