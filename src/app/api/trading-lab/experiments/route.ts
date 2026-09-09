import { NextRequest, NextResponse } from "next/server";
import { isDeepStrictEqual } from "node:util";
import { createClient } from "@/lib/supabase/server";
import { experimentSchema, experimentReviewSchema, observationSchema } from "@/lib/trading-lab/experiment";
import { experimentMetrics } from "@/lib/trading-lab/experiment-metrics";
import { dbError, loadManualTrades, readAll } from "@/lib/trading-lab/manual-data";
import { validateStrategyVersion } from "@/lib/trading-lab/strategy-schema";

export async function GET(req: NextRequest) {
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ experiments: await readAll(supabase.from("trading_experiments").select("*").eq("user_id", user.id).order("approved_at", { ascending: false }).order("id")) });
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Invalid experiment ID" }, { status: 400 });
    const found = await supabase.from("trading_experiments").select("*").eq("user_id", user.id).eq("id", id).maybeSingle();
    if (found.error) throw new Error("Could not load the experiment.");
    if (!found.data) return NextResponse.json({ error: "Experiment not found" }, { status: 404 });
    const [trades, observations] = await Promise.all([loadManualTrades(supabase, user.id, id), readAll(supabase.from("trading_observation_sessions").select("*").eq("user_id", user.id).eq("experiment_id", id).order("started_at").order("id"))]);
    const sample = trades.filter((t: any) => t.sample_member);
    return NextResponse.json({ experiment: found.data, trades, observations, metrics: experimentMetrics(found.data.protocol, sample, observations), outsideSample: trades.length - sample.length });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 503 }); }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const parse = body?.action === "create" ? experimentSchema.safeParse(body.input)
    : body?.action === "review" ? experimentReviewSchema.safeParse(body.input)
    : body?.action === "observe" ? observationSchema.safeParse(body.input) : null;
  if (!parse?.success) return NextResponse.json({ error: parse?.error?.issues[0]?.message ?? "Unknown experiment action or invalid fields." }, { status: 400 });
  const input: any = parse.data;
  try {
    if (body.action === "review") {
      const saved = await supabase.rpc("review_trading_experiment", { p_experiment_id: input.experimentId, p_review: input });
      if (saved.error) { const e = dbError(saved.error); return NextResponse.json({ error: e.error }, { status: e.status }); }
      return NextResponse.json({ experiment: saved.data });
    }
    const table = body.action === "create" ? "trading_experiments" : "trading_observation_sessions";
    const previous = await supabase.from(table).select("*").eq("user_id", user.id).eq("request_id", input.requestId).maybeSingle();
    if (previous.error) throw new Error("Could not confirm previous saves. Verify the manual-workflow database setup.");
    let row: any;
    if (body.action === "create") {
      if (previous.data) {
        if (!isDeepStrictEqual(previous.data.protocol, input)) return NextResponse.json({ error: "This request ID belongs to a different protocol." }, { status: 409 });
        return NextResponse.json({ experiment: previous.data });
      }
      const version = await supabase.from("trading_strategy_versions").select("definition").eq("user_id", user.id).eq("id", input.strategyVersionId).maybeSingle();
      if (version.error) throw new Error("Cannot verify the strategy version.");
      if (!version.data) return NextResponse.json({ error: "Strategy version not found" }, { status: 404 });
      if (!validateStrategyVersion(version.data.definition).success) return NextResponse.json({ error: "Save valid structured strategy rules before approving the experiment." }, { status: 422 });
      row = { user_id: user.id, request_id: input.requestId, strategy_version_id: input.strategyVersionId, parent_experiment_id: input.parentExperimentId, protocol: input, strategy_snapshot: version.data.definition };
    } else {
      row = { user_id: user.id, request_id: input.requestId, experiment_id: input.experimentId, started_at: input.startedAt, ended_at: input.endedAt, qualifying_setups: input.qualifyingSetups, taken_setups: input.takenSetups, notes: input.notes };
      if (previous.data) {
        const same = Object.entries(row).every(([key, value]) => key.endsWith("_at") ? Date.parse(previous.data![key]) === Date.parse(value as string) : previous.data![key] === value);
        return NextResponse.json(same ? { observation: previous.data } : { error: "This request ID belongs to different coverage." }, { status: same ? 200 : 409 });
      }
    }
    const saved = await supabase.from(table).insert(row).select().single();
    if (saved.error) { const e = dbError(saved.error); return NextResponse.json({ error: e.error }, { status: e.status }); }
    return NextResponse.json({ [body.action === "create" ? "experiment" : "observation"]: saved.data }, { status: 201 });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 503 }); }
}
