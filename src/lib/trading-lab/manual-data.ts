import type { SupabaseClient } from "@supabase/supabase-js";
import type { LabTrade } from "./experiment-metrics";

// Supabase defaults to a bounded response. Read explicit pages so a sample is
// never silently calculated from just its most recent rows.
export async function readAll(query: any): Promise<any[]> {
  const rows: any[] = [];
  for (let offset = 0; offset < 10_000; offset += 500) {
    const { data, error } = await query.range(offset, offset + 499);
    if (error) throw new Error("Trading Lab data could not be loaded. Verify the manual-workflow database setup.");
    rows.push(...(data ?? []));
    if (!data || data.length < 500) return rows;
  }
  throw new Error("This view exceeds 10,000 records. Narrow the experiment before reviewing.");
}

export async function loadManualTrades(supabase: SupabaseClient, userId: string, experimentId?: string): Promise<LabTrade[]> {
  let query = supabase.from("trading_entries")
    .select("*,plan:trading_decisions!decision_id(plan_snapshot,assessment_snapshot,locked_at,buddies_decision_id,strategy_version_id)")
    .eq("user_id", userId).gt("lifecycle_revision", 0).order("id");
  if (experimentId) query = query.eq("experiment_id", experimentId);
  const rows = await readAll(query);
  return rows.map(row => ({ ...row, ...row.plan, plan: undefined }));
}

export function dbError(error: { code?: string; message?: string }) {
  const conflict = ["23505", "40001"].includes(error.code ?? "");
  const invalid = ["23514", "P0001", "22007", "22P02", "22003"].includes(error.code ?? "");
  return { status: conflict ? 409 : invalid ? 400 : error.code === "42501" ? 403 : 503,
    error: conflict || invalid ? error.message ?? "Reload and check the record." : error.code === "42501" ? "The requested record is not available to this account." : "Save was not confirmed. Retry the same request or verify the manual-workflow database setup." };
}
