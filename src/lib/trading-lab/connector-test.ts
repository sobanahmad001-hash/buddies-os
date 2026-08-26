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
    response = await fetch("https://publicreporting.cftc.gov/api/views", { signal: AbortSignal.timeout(10_000), cache: "no-store" });
  } else {
    throw new Error("Unsupported connector provider.");
  }
  if (!response.ok) throw new Error(`${provider} rejected the connection (${response.status}).`);
  return { ok: true, latencyMs: Date.now() - started, detail: "Connection verified" };
}
