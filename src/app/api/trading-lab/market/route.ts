import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getLabSnapshot } from "@/lib/trading-lab/market-data";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const symbol = req.nextUrl.searchParams.get("symbol") ?? "XAU/USD";
    return NextResponse.json(await getLabSnapshot(user.id, symbol, true));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Market data failed" }, { status: 500 });
  }
}
