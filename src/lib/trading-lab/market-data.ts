import "server-only";
import { resolveConnectorSecret } from "@/lib/trading-lab/connector-secrets";
import { decide, demoCandles, technicalPillar, volumePillar, type LabCandle, type PillarResult } from "@/lib/trading-lab/engine";

async function twelveDataCandles(userId: string, symbol: string, interval = "1h") {
  const key = await resolveConnectorSecret(userId, "twelve_data");
  if (!key) return null;
  const response = await fetch(`https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=${interval}&outputsize=220&apikey=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(12_000), cache: "no-store" });
  if (!response.ok) throw new Error(`Twelve Data request failed (${response.status})`);
  const payload = await response.json();
  if (!Array.isArray(payload.values)) throw new Error(payload.message ?? "Twelve Data returned no candles");
  return payload.values.reverse().map((value: Record<string, string>): LabCandle => ({ time: value.datetime, open: Number(value.open), high: Number(value.high), low: Number(value.low), close: Number(value.close), volume: value.volume && Number(value.volume) > 0 ? Number(value.volume) : null }));
}

async function fredFundamental(userId: string): Promise<PillarResult> {
  const key = await resolveConnectorSecret(userId, "fred");
  if (!key) return { bias: "unavailable", score: 0, confidence: 0, summary: "FRED macro connector is not configured", evidence: [], warnings: ["Connect FRED to add real yields, nominal yields and dollar context"] };
  const getSeries = async (series: string) => {
    const response = await fetch(`https://api.stlouisfed.org/fred/series/observations?series_id=${series}&api_key=${key}&file_type=json&sort_order=desc&limit=2`, { signal: AbortSignal.timeout(10_000), next: { revalidate: 3600 } });
    if (!response.ok) return null; const values = (await response.json()).observations?.map((item: { value: string }) => Number(item.value)).filter(Number.isFinite) ?? [];
    return values.length ? { latest: values[0], previous: values[1] ?? values[0] } : null;
  };
  const [real, nominal, dollar] = await Promise.all([getSeries("DFII10"), getSeries("DGS10"), getSeries("DTWEXBGS")]);
  let score = 0; const evidence: string[] = [];
  for (const [name, item] of [["10Y real yield", real], ["10Y nominal yield", nominal], ["Broad dollar", dollar]] as const) {
    if (!item) continue; const change = item.latest - item.previous; score += change < 0 ? 1 : change > 0 ? -1 : 0; evidence.push(`${name}: ${item.latest} (${change >= 0 ? "+" : ""}${Number(change.toFixed(3))})`);
  }
  const bias = score >= 2 ? "bullish" : score <= -2 ? "bearish" : "neutral";
  return { bias, score, confidence: evidence.length === 3 ? 70 : 50, summary: `${bias} gold macro pressure from available FRED series`, evidence, warnings: ["Economic-calendar and COT context remain separate inputs"] };
}

async function cftcGoldPositioning(): Promise<PillarResult & { asOf?: string; openInterest?: number | null }> {
  try {
    const query = new URLSearchParams({ "$where": "cftc_contract_market_code='088691'", "$order": "report_date_as_yyyy_mm_dd DESC", "$limit": "2" });
    const response = await fetch(`https://publicreporting.cftc.gov/resource/6dca-aqww.json?${query}`, { signal: AbortSignal.timeout(10_000), next: { revalidate: 21_600 } });
    if (!response.ok) throw new Error(`CFTC request failed (${response.status})`);
    const rows = await response.json() as Record<string, string>[];
    const latest = rows[0];
    if (!latest) throw new Error("CFTC returned no gold positioning row");
    const long = Number(latest.noncomm_positions_long_all); const short = Number(latest.noncomm_positions_short_all); const openInterest = Number(latest.open_interest_all);
    if (![long, short, openInterest].every(Number.isFinite)) throw new Error("CFTC response shape changed");
    const net = long - short; const ratio = openInterest ? net / openInterest : 0;
    const bias = ratio > .08 ? "bullish" : ratio < -.08 ? "bearish" : "neutral";
    const asOf = latest.report_date_as_yyyy_mm_dd;
    return { bias, score: bias === "bullish" ? 1 : bias === "bearish" ? -1 : 0, confidence: 55, summary: `${bias} weekly CFTC positioning`, evidence: [`Non-commercial net ${net.toLocaleString()} contracts`, `Open interest ${openInterest.toLocaleString()}`, `Report date ${asOf}`], warnings: ["Weekly CFTC positioning is context only, never an intraday trigger"], asOf, openInterest };
  } catch (error) {
    return { bias: "unavailable", score: 0, confidence: 0, summary: "CFTC weekly positioning is unavailable", evidence: [], warnings: [error instanceof Error ? error.message : "CFTC request failed"], openInterest: null };
  }
}

export async function getLabSnapshot(userId: string, symbol = "XAU/USD", allowDemo = true) {
  let candles: LabCandle[] | null = null; let source = "Twelve Data"; let demo = false;
  try { candles = await twelveDataCandles(userId, symbol); } catch (error) { if (!allowDemo) throw error; }
  if (!candles) { if (!allowDemo) throw new Error("No historical-bar connector is configured"); candles = demoCandles(); source = "Built-in deterministic preview dataset"; demo = true; }
  const technical = technicalPillar(candles); const volume = volumePillar(candles);
  const [macro, positioning] = await Promise.all([demo ? Promise.resolve({ bias: "neutral", score: 0, confidence: 25, summary: "Preview macro context is neutral", evidence: ["Connect FRED for live macro evidence"], warnings: ["Demo context is not a live-market fact"] } as PillarResult) : fredFundamental(userId), cftcGoldPositioning()]);
  const availableFundamentals = [macro, positioning].filter(item => item.bias !== "unavailable");
  const fundamental: PillarResult = availableFundamentals.length ? { bias: availableFundamentals.reduce((sum, item) => sum + item.score, 0) > 0 ? "bullish" : availableFundamentals.reduce((sum, item) => sum + item.score, 0) < 0 ? "bearish" : "neutral", score: availableFundamentals.reduce((sum, item) => sum + item.score, 0), confidence: Math.round(availableFundamentals.reduce((sum, item) => sum + item.confidence, 0) / availableFundamentals.length), summary: `${macro.summary}; ${positioning.summary}`, evidence: [...macro.evidence, ...positioning.evidence], warnings: [...macro.warnings, ...positioning.warnings] } : { bias: "unavailable", score: 0, confidence: 0, summary: "Macro and positioning data are unavailable", evidence: [], warnings: [...macro.warnings, ...positioning.warnings] };
  const last = candles.at(-1)!; const parsed = Date.parse(last.time.replace(" ", "T") + (last.time.includes("Z") ? "" : "Z")); const fresh = demo || !Number.isFinite(parsed) || Date.now() - parsed < 4 * 60 * 60 * 1000;
  return { symbol, source, demo, asOf: last.time, currentPrice: last.close, candles, dataQuality: { price: demo ? "preview" : "reported", volume: volume.available ? demo ? "preview" : "reported" : "unavailable", macro: macro.bias === "unavailable" ? "unavailable" : demo ? "preview" : "reported", positioning: positioning.bias === "unavailable" ? "unavailable" : "official-weekly" }, fundamental, positioning, technical, volume, decision: decide(fundamental, technical, volume, fresh) };
}
