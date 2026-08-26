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

export async function getLabSnapshot(userId: string, symbol = "XAU/USD", allowDemo = true) {
  let candles: LabCandle[] | null = null; let source = "Twelve Data"; let demo = false;
  try { candles = await twelveDataCandles(userId, symbol); } catch (error) { if (!allowDemo) throw error; }
  if (!candles) { if (!allowDemo) throw new Error("No historical-bar connector is configured"); candles = demoCandles(); source = "Built-in deterministic preview dataset"; demo = true; }
  const technical = technicalPillar(candles); const volume = volumePillar(candles); const fundamental = demo ? { bias: "neutral", score: 0, confidence: 25, summary: "Preview macro context is neutral", evidence: ["Connect FRED for live macro evidence"], warnings: ["Demo context is not a live-market fact"] } as PillarResult : await fredFundamental(userId);
  const last = candles.at(-1)!; const parsed = Date.parse(last.time.replace(" ", "T") + (last.time.includes("Z") ? "" : "Z")); const fresh = demo || !Number.isFinite(parsed) || Date.now() - parsed < 4 * 60 * 60 * 1000;
  return { symbol, source, demo, asOf: last.time, currentPrice: last.close, candles, dataQuality: { price: demo ? "preview" : "reported", volume: volume.available ? demo ? "preview" : "reported" : "unavailable", macro: demo ? "preview" : fundamental.bias === "unavailable" ? "unavailable" : "reported" }, fundamental, technical, volume, decision: decide(fundamental, technical, volume, fresh) };
}
