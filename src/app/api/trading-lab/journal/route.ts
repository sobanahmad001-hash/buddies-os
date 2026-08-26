import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizeTradeRow, parseCsv } from "@/lib/trading-lab/journal";

async function auth() { const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); return { supabase, user }; }

export async function GET() {
  const { supabase, user } = await auth(); if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [{ data: entries }, { data: imports }, { data: decisions }] = await Promise.all([
    supabase.from("trading_entries").select("*").eq("user_id", user.id).order("opened_at", { ascending: false }).limit(100),
    supabase.from("trading_import_batches").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10),
    supabase.from("trading_decisions").select("id,instrument,decision_state,confidence,as_of,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
  ]);
  return NextResponse.json({ entries: entries ?? [], imports: imports ?? [], decisions: decisions ?? [] });
}

export async function POST(req: NextRequest) {
  try {
    const { supabase, user } = await auth(); if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (req.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await req.formData(); const file = form.get("file");
      if (!(file instanceof File)) return NextResponse.json({ error: "Choose a CSV file" }, { status: 400 });
      if (file.size > 2_000_000) return NextResponse.json({ error: "CSV must be under 2 MB" }, { status: 400 });
      const rawRows = parseCsv(await file.text()).slice(0, 2000); const normalized: any[] = []; const errors: string[] = [];
      rawRows.forEach((row, index) => { try { normalized.push({ user_id: user.id, ...normalizeTradeRow(row, index) }); } catch (error) { errors.push(error instanceof Error ? error.message : `Row ${index + 2} failed`); } });
      const { data: batch, error: batchError } = await supabase.from("trading_import_batches").insert({ user_id: user.id, file_name: file.name, row_count: rawRows.length, imported_count: 0, skipped_count: errors.length, status: "processing", error_log: errors }).select().single();
      if (batchError) throw batchError;
      const externalIds = normalized.map(row => row.external_trade_id).filter(Boolean);
      const { data: existing } = externalIds.length
        ? await supabase.from("trading_entries").select("external_trade_id").eq("user_id", user.id).in("external_trade_id", externalIds)
        : { data: [] };
      const seen = new Set((existing ?? []).map(item => item.external_trade_id));
      const rows = normalized.filter(row => !row.external_trade_id || !seen.has(row.external_trade_id)).map(row => {
        if (row.external_trade_id) seen.add(row.external_trade_id);
        return { ...row, import_batch_id: batch.id };
      });
      const result = rows.length ? await supabase.from("trading_entries").insert(rows).select("id") : { data: [], error: null };
      const imported = result.data?.length ?? 0; const finalErrors = result.error ? [...errors, result.error.message] : errors;
      await supabase.from("trading_import_batches").update({ imported_count: imported, skipped_count: rawRows.length - imported, status: result.error ? "failed" : "completed", error_log: finalErrors }).eq("id", batch.id).eq("user_id", user.id);
      return NextResponse.json({ imported, skipped: rawRows.length - imported, errors: finalErrors });
    }
    const body = await req.json();
    if (body.action !== "log") return NextResponse.json({ error: "Unknown journal action" }, { status: 400 });
    const trade = body.trade ?? {};
    const { data, error } = await supabase.from("trading_entries").insert({ user_id: user.id, instrument: trade.instrument ?? "XAUUSD", direction: trade.direction === "sell" ? "sell" : "buy", entry_price: Number(trade.entry_price), exit_price: trade.exit_price ? Number(trade.exit_price) : null, lot_size: Number(trade.lot_size ?? .01), stop_loss: trade.stop_loss ? Number(trade.stop_loss) : null, take_profit: trade.take_profit ? Number(trade.take_profit) : null, result_usd: trade.result_usd ? Number(trade.result_usd) : null, status: trade.exit_price ? "closed" : "open", opened_at: trade.opened_at ?? new Date().toISOString(), closed_at: trade.exit_price ? trade.closed_at ?? new Date().toISOString() : null, notes: trade.notes ?? null, strategy: trade.strategy ?? null, setup_name: trade.setup_name ?? null, timeframe: trade.timeframe ?? null, session: trade.session ?? null, emotions: trade.emotions ?? null, lessons: trade.lessons ?? null, decision_id: trade.decision_id ?? null, ladder_campaign_id: trade.ladder_campaign_id ?? null, checklist_passed: trade.checklist_passed ?? null, checklist_results: trade.checklist_results ?? {}, source: "manual", account_type: "external", ladder_step: 1 }).select().single();
    if (error) throw error; return NextResponse.json({ entry: data });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Journal operation failed" }, { status: 500 }); }
}
