import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await supabase.from("coding_agent_jobs")
    .select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(30);
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ jobs: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const repository = String(body.repository ?? "").trim().replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "");
  const prompt = String(body.prompt ?? "").trim();
  if (!REPO_PATTERN.test(repository)) return NextResponse.json({ error: "Repository must be owner/name" }, { status: 400 });
  if (prompt.length < 5 || prompt.length > 20_000) return NextResponse.json({ error: "Prompt must be 5-20,000 characters" }, { status: 400 });
  const commands = Array.isArray(body.verificationCommands) ? body.verificationCommands.slice(0, 8).map(String) : [];
  const { data, error } = await supabase.from("coding_agent_jobs").insert({
    user_id: user.id,
    project_id: body.projectId ?? null,
    task_id: body.taskId ?? null,
    repository,
    base_branch: String(body.baseBranch ?? "main"),
    prompt,
    verification_commands: commands,
  }).select().single();
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ job: data }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Job id required" }, { status: 400 });
  const { error } = await supabase.from("coding_agent_jobs").update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", id).eq("user_id", user.id).eq("status", "queued");
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ cancelled: true });
}

