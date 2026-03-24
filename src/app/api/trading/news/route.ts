import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const FINNHUB_BASE = "https://finnhub.io/api/v1";

function classifyImpact(headline: string): "HIGH" | "MEDIUM" | "LOW" {
  const h = headline.toLowerCase();
  if (/\b(fed|federal reserve|fomc|rate hike|rate cut|inflation|cpi|nfp|non-farm|payroll|gdp|recession|central bank|ecb|boe|boj|powell|lagarde|war|sanctions|emergency)\b/.test(h)) {
    return "HIGH";
  }
  if (/\b(gold|silver|oil|nasdaq|s&p|dow|euro|yen|pound|bitcoin|btc|ethereum|eth|crypto|xau|xag|commodity|rally|selloff|breakout)\b/.test(h)) {
    return "MEDIUM";
  }
  return "LOW";
}

function getAffectedAssets(headline: string): string[] {
  const h = headline.toLowerCase();
  const assets: string[] = [];
  const map: [string, string[]][] = [
    ["XAU", ["gold", "xau"]],
    ["XAG", ["silver", "xag"]],
    ["BTC", ["bitcoin", "btc"]],
    ["ETH", ["ethereum", "eth"]],
    ["EUR", ["euro", "eur/usd", "eurusd"]],
    ["GBP", ["pound", "gbp", "sterling"]],
    ["JPY", ["yen", "jpy"]],
    ["NAS100", ["nasdaq", "ndx", "tech stocks"]],
    ["OIL", ["oil", "crude", "wti", "brent"]],
  ];
  for (const [symbol, keywords] of map) {
    if (keywords.some(kw => h.includes(kw))) assets.push(symbol);
  }
  return assets;
}

export async function GET(_req: NextRequest) {
  if (!FINNHUB_API_KEY) {
    return NextResponse.json({
      news: [],
      error: "FINNHUB_API_KEY not configured. Add it to .env.local to enable live news.",
    });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const [generalRes, forexRes] = await Promise.allSettled([
      fetch(`${FINNHUB_BASE}/news?category=general&token=${FINNHUB_API_KEY}`, { signal: AbortSignal.timeout(8000) }),
      fetch(`${FINNHUB_BASE}/news?category=forex&token=${FINNHUB_API_KEY}`, { signal: AbortSignal.timeout(8000) }),
    ]);

    const allRaw: any[] = [];
    for (const result of [generalRes, forexRes]) {
      if (result.status === "fulfilled" && result.value.ok) {
        const data = await result.value.json();
        if (Array.isArray(data)) allRaw.push(...data);
      }
    }

    // Deduplicate by id
    const seen = new Set<string>();
    const deduped = allRaw.filter(item => {
      const key = String(item.id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const news = deduped
      .slice(0, 50)
      .map(item => ({
        id: String(item.id),
        headline: item.headline ?? "",
        source: item.source ?? "",
        // Only allow https URLs to prevent protocol injection
        url: typeof item.url === "string" && item.url.startsWith("https://") ? item.url : "",
        datetime: Number(item.datetime) || 0,
        summary: item.summary ?? "",
        impact: classifyImpact(item.headline ?? ""),
        assets: getAffectedAssets(item.headline ?? ""),
      }))
      .sort((a, b) => b.datetime - a.datetime)
      .slice(0, 25);

    return NextResponse.json({ news });
  } catch (err: any) {
    return NextResponse.json({ news: [], error: err.message ?? "Failed to fetch news" });
  }
}
