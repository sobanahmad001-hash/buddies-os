import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Map Twelve Data instrument_type values to our asset_type CHECK constraint
const TYPE_MAP: Record<string, string> = {
  Physical_Currency: "forex",
  Digital_Currency: "crypto",
  ETF: "index",
  Index: "index",
  Commodity: "commodity",
  // anything else falls back to "commodity"
};

function toAssetType(raw: string): string {
  return TYPE_MAP[raw] ?? "commodity";
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const q = req.nextUrl.searchParams.get("q")?.trim();
    if (!q || q.length < 1) return NextResponse.json({ results: [] });

    const apiKey = process.env.TWELVE_DATA_API_KEY;
    if (!apiKey) {
      // Fallback curated list when key is missing
      return NextResponse.json({ results: CURATED_SYMBOLS.filter(s =>
        s.symbol.toLowerCase().includes(q.toLowerCase()) ||
        s.display_name.toLowerCase().includes(q.toLowerCase())
      ).slice(0, 15) });
    }

    const url = `https://api.twelvedata.com/symbol_search?symbol=${encodeURIComponent(q)}&outputsize=15&apikey=${apiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return NextResponse.json({ results: [] });

    const data = await res.json();
    const raw: any[] = data.data ?? [];

    const results = raw
      .filter(r => r.symbol && r.instrument_name)
      .map(r => ({
        symbol: r.symbol as string,
        display_name: r.instrument_name as string,
        asset_type: toAssetType(r.instrument_type ?? ""),
        exchange: r.exchange ?? "",
      }))
      .slice(0, 15);

    return NextResponse.json({ results });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Curated fallback — shown when TWELVE_DATA_API_KEY is absent or query matches
const CURATED_SYMBOLS = [
  { symbol: "XAU/USD", display_name: "Gold", asset_type: "commodity" },
  { symbol: "XAG/USD", display_name: "Silver", asset_type: "commodity" },
  { symbol: "XPT/USD", display_name: "Platinum", asset_type: "commodity" },
  { symbol: "WTI/USD", display_name: "Crude Oil WTI", asset_type: "commodity" },
  { symbol: "BTC/USD", display_name: "Bitcoin", asset_type: "crypto" },
  { symbol: "ETH/USD", display_name: "Ethereum", asset_type: "crypto" },
  { symbol: "SOL/USD", display_name: "Solana", asset_type: "crypto" },
  { symbol: "EUR/USD", display_name: "Euro / US Dollar", asset_type: "forex" },
  { symbol: "GBP/USD", display_name: "British Pound / US Dollar", asset_type: "forex" },
  { symbol: "USD/JPY", display_name: "US Dollar / Japanese Yen", asset_type: "forex" },
  { symbol: "USD/CHF", display_name: "US Dollar / Swiss Franc", asset_type: "forex" },
  { symbol: "AUD/USD", display_name: "Australian Dollar / US Dollar", asset_type: "forex" },
  { symbol: "NAS100", display_name: "NASDAQ 100", asset_type: "index" },
  { symbol: "US30", display_name: "Dow Jones 30", asset_type: "index" },
  { symbol: "SPX500", display_name: "S&P 500", asset_type: "index" },
];
