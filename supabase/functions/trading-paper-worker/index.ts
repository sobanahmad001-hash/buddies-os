// Custom bearer authentication is checked against a server-only hash before any work.
// No user-supplied owner or run IDs are accepted by this scheduler endpoint.
declare const Deno: {env:{get(name:string):string|undefined};serve(handler:(request:Request)=>Promise<Response>):void};
import process from "node:process";
import {createClient} from "@supabase/supabase-js";
import {runPaperWorker} from "./worker.js";
process.env.NEXT_PUBLIC_SUPABASE_URL=Deno.env.get("SUPABASE_URL");
process.env.SUPABASE_SERVICE_ROLE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return new Response("Method not allowed",{status:405});
  const token=req.headers.get("authorization")?.replace(/^Bearer /,"")??"";
  if(token.length<32||token.length>256)return new Response("Unauthorized",{status:401});
  const admin=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
  try{
    const auth=await admin.rpc("authorize_paper_worker",{p_token:token});
    if(auth.error||auth.data!==true)return new Response("Unauthorized",{status:401});
    const results=await runPaperWorker(admin);return Response.json({ok:true,results});}
  catch{return Response.json({ok:false,error:"Worker could not complete this cycle"},{status:503});}
});
