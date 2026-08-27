import "server-only";

export async function testConnector(provider: string, secret?: string) {
  const started = Date.now();
  let response: Response | null = null;
  if (provider === "twelve_data") {
    response = await fetch(`https://api.twelvedata.com/time_series?symbol=XAU/USD&interval=1day&outputsize=1&apikey=${encodeURIComponent(secret ?? "")}`, { signal: AbortSignal.timeout(10_000), cache: "no-store" });
  } else if (provider === "fred") {
    response = await fetch(`https://api.stlouisfed.org/fred/series/observations?series_id=DGS10&limit=1&sort_order=desc&file_type=json&api_key=${encodeURIComponent(secret ?? "")}`, { signal: AbortSignal.timeout(10_000), cache: "no-store" });
  } else if (provider === "databento") {
    response = await fetch("https://hist.databento.com/v0/metadata.list_datasets", { method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${secret ?? ""}:`).toString("base64")}` }, signal: AbortSignal.timeout(10_000), cache: "no-store" });
  } else if (provider === "tradingview_webhook") {
    if (!secret || secret.length < 16) throw new Error("Webhook secret must contain at least 16 characters.");
    return { ok: true, latencyMs: 0, detail: "Webhook secret is ready" };
  } else if (provider === "cftc") {
    response = await fetch("https://publicreporting.cftc.gov/resource/6dca-aqww.json?$where=cftc_contract_market_code%3D%27088691%27&$order=report_date_as_yyyy_mm_dd%20DESC&$limit=1", { signal: AbortSignal.timeout(10_000), cache: "no-store" });
  } else {
    throw new Error("Unsupported connector provider.");
  }
  if (!response.ok) throw new Error(`${provider} rejected the connection (${response.status}).`);
  if (provider === "cftc") {
    const rows = await response.json() as Record<string, string>[];
    if (!rows[0]?.report_date_as_yyyy_mm_dd) throw new Error("CFTC returned no dated gold positioning data.");
  }
  return { ok: true, latencyMs: Date.now() - started, detail: "Connection verified" };
}
