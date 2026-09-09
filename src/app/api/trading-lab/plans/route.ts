import { NextRequest, NextResponse } from "next/server";
import { isDeepStrictEqual } from "node:util";
import { createClient } from "@/lib/supabase/server";
import { assessPlan, pretradeSchema } from "@/lib/trading-lab/pretrade";
import { validateStrategyVersion } from "@/lib/trading-lab/strategy-schema";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await supabase.from("trading_decisions")
    .select("id,buddies_decision_id,strategy_version_id,locked_at,plan_snapshot,assessment_snapshot,strategy_snapshot")
    .eq("user_id", user.id).not("locked_at", "is", null).order("locked_at", { ascending: false }).limit(20);
  if (error) return NextResponse.json({ error: "Saved plans are unavailable. Verify the pre-trade database setup." }, { status: 503 });
  return NextResponse.json({ plans: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = pretradeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check the plan fields and assessment evidence.", issues: parsed.error.issues }, { status: 400 });
  const plan = parsed.data;
  // A lost response must be recoverable even after the original plan has expired.
  const previous = await supabase.from("trading_decisions").select("*")
    .eq("user_id", user.id).eq("capture_request_id", plan.requestId).maybeSingle();
  if (previous.error) return NextResponse.json({ error: "Cannot confirm saved plans. Verify the pre-trade database setup." }, { status: 503 });
  if (previous.data) {
    if (!isDeepStrictEqual(previous.data.plan_snapshot, plan)) return NextResponse.json({ error: "This request ID belongs to a different plan." }, { status: 409 });
    if (!previous.data.locked_at || !previous.data.buddies_decision_id) return NextResponse.json({ error: "The saved plan is incomplete." }, { status: 503 });
    return NextResponse.json({ plan: previous.data });
  }
  // The exact owned version is authoritative. Never accept a definition or verdict from the browser.
  const { data: version, error } = await supabase.from("trading_strategy_versions").select("id,definition")
    .eq("user_id", user.id).eq("id", plan.strategyVersionId).maybeSingle();
  if (error) return NextResponse.json({ error: "Cannot load the strategy version." }, { status: 503 });
  if (!version) return NextResponse.json({ error: "Strategy version not found." }, { status: 404 });
  const strategy = validateStrategyVersion(version.definition);
  if (!strategy.success) return NextResponse.json({ error: "This strategy version needs valid structured rules before recording a plan." }, { status: 422 });
  let assessment;
  try { assessment = assessPlan(plan, strategy.data); }
  catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 400 }); }
  const saved = await supabase.rpc("capture_trading_plan", {
    p_request_id: plan.requestId, p_version_id: plan.strategyVersionId,
    p_plan: plan, p_assessment: assessment, p_definition: version.definition,
  });
  if (saved.error) {
    const conflict = saved.error.code === "23505" || saved.error.code === "40001";
    return NextResponse.json({ error: conflict ? "The strategy or request changed. Reload before saving a new plan." : "Plan was not confirmed saved. Retry the same request or verify database setup." }, { status: conflict ? 409 : 503 });
  }
  if (!saved.data?.id || !saved.data?.locked_at || !saved.data?.buddies_decision_id) {
    return NextResponse.json({ error: "The database did not confirm a complete saved plan." }, { status: 503 });
  }
  return NextResponse.json({ plan: saved.data }, { status: 201 });
}
