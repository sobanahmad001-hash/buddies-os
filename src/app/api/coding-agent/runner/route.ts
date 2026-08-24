import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

function authorized(req: NextRequest) {
  const expected = process.env.CODING_AGENT_RUNNER_TOKEN ?? "";
  const supplied = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || expected.length !== supplied.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized runner" }, { status: 401 });
  const runnerId = req.nextUrl.searchParams.get("runnerId") ?? "personal-runner";
  const admin = createAdminClient();
  const { data: candidates, error } = await admin.from("coding_agent_jobs").select("*")
    .eq("status", "queued").order("created_at", { ascending: true }).limit(1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const candidate = candidates?.[0];
  if (!candidate) return NextResponse.json({ job: null });
  const now = new Date().toISOString();
  const { data } = await admin.from("coding_agent_jobs").update({ status: "claimed", runner_id: runnerId, claimed_at: now, updated_at: now })
    .eq("id", candidate.id).eq("status", "queued").select().maybeSingle();
  return NextResponse.json({ job: data ?? null });
}

export async function PATCH(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized runner" }, { status: 401 });
  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: "Job id required" }, { status: 400 });
  const allowed = new Set(["running", "succeeded", "failed"]);
  if (!allowed.has(body.status)) return NextResponse.json({ error: "Invalid runner status" }, { status: 400 });
  const completed = body.status === "succeeded" || body.status === "failed";
  const outputLimit = (value: unknown, max = 500_000) => String(value ?? "").slice(-max);
  const updates: Record<string, unknown> = {
    status: body.status,
    updated_at: new Date().toISOString(),
    ...(body.status === "running" ? { started_at: new Date().toISOString() } : {}),
    ...(completed ? {
      completed_at: new Date().toISOString(), exit_code: Number(body.exitCode ?? 1),
      stdout: outputLimit(body.stdout), stderr: outputLimit(body.stderr), diff: outputLimit(body.diff, 1_000_000),
      changed_files: Array.isArray(body.changedFiles) ? body.changedFiles.slice(0, 200) : [],
      verification_results: Array.isArray(body.verificationResults) ? body.verificationResults.slice(0, 20) : [],
      work_branch: outputLimit(body.workBranch, 200), error: outputLimit(body.error, 10_000),
    } : {}),
  };
  const { data, error } = await createAdminClient().from("coding_agent_jobs").update(updates).eq("id", body.id).select().single();
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ job: data });
}

