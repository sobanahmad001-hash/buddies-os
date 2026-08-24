import { spawn } from "child_process";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveRuntimeCwd, validateRuntimeCommand } from "@/lib/coding-agent/runtime-policy";

const MAX_OUTPUT = 200_000;
const TIMEOUT_MS = 60_000;

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await supabase.from("coding_agent_executions").select("*").eq("user_id", user.id).order("requested_at", { ascending: false }).limit(50);
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ executions: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();

  if (body.action === "request") {
    const policy = validateRuntimeCommand(body.command);
    if (!policy.ok) return NextResponse.json({ error: policy.error }, { status: 400 });
    const { program, args, cwd = "." } = body.command;
    const { data, error } = await supabase.from("coding_agent_executions").insert({ user_id: user.id, project_id: body.projectId ?? null, program: program.toLowerCase(), args, cwd, status: "pending" }).select().single();
    return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ execution: data }, { status: 201 });
  }

  if (body.action !== "approve" || !body.executionId) return NextResponse.json({ error: "Unsupported runtime action" }, { status: 400 });
  if (process.env.CODING_AGENT_EXECUTION_ENABLED !== "true") return NextResponse.json({ error: "Coding Agent execution is disabled" }, { status: 503 });
  const workspaceRoot = process.env.CODING_AGENT_WORKSPACE_ROOT;
  if (!workspaceRoot) return NextResponse.json({ error: "Coding Agent workspace is not configured" }, { status: 503 });

  const { data: execution, error: findError } = await supabase.from("coding_agent_executions").select("*").eq("id", body.executionId).eq("user_id", user.id).eq("status", "pending").single();
  if (findError || !execution) return NextResponse.json({ error: "Pending execution not found" }, { status: 404 });
  const policy = validateRuntimeCommand({ program: execution.program, args: execution.args, cwd: execution.cwd });
  if (!policy.ok) {
    await supabase.from("coding_agent_executions").update({ status: "rejected", stderr: policy.error, completed_at: new Date().toISOString() }).eq("id", execution.id).eq("user_id", user.id);
    return NextResponse.json({ error: policy.error }, { status: 400 });
  }

  let cwd: string;
  try { cwd = resolveRuntimeCwd(workspaceRoot, execution.cwd); }
  catch (error: any) { return NextResponse.json({ error: error.message }, { status: 400 }); }
  await supabase.from("coding_agent_executions").update({ status: "running", approved_at: new Date().toISOString() }).eq("id", execution.id).eq("user_id", user.id);

  const result = await run(execution.program, execution.args, cwd);
  const status = result.exitCode === 0 ? "succeeded" : "failed";
  await supabase.from("coding_agent_executions").update({ status, exit_code: result.exitCode, stdout: result.stdout, stderr: result.stderr, completed_at: new Date().toISOString() }).eq("id", execution.id).eq("user_id", user.id);
  return NextResponse.json({ executionId: execution.id, status, ...result });
}

function run(program: string, args: string[], cwd: string) {
  return new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve) => {
    const child = spawn(program, args, { cwd, shell: false, windowsHide: true, env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" } });
    let stdout = ""; let stderr = ""; let settled = false;
    const append = (current: string, chunk: Buffer) => (current + chunk.toString()).slice(0, MAX_OUTPUT);
    child.stdout.on("data", (chunk) => { stdout = append(stdout, chunk); });
    child.stderr.on("data", (chunk) => { stderr = append(stderr, chunk); });
    const timer = setTimeout(() => { child.kill(); stderr = `${stderr}\nExecution timed out after ${TIMEOUT_MS / 1000}s`.trim(); }, TIMEOUT_MS);
    const finish = (exitCode: number) => { if (settled) return; settled = true; clearTimeout(timer); resolve({ stdout, stderr, exitCode }); };
    child.on("error", (error) => { stderr = append(stderr, Buffer.from(error.message)); finish(1); });
    child.on("close", (code) => finish(code ?? 1));
  });
}
