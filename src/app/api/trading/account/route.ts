import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Exness doesn't have a public REST API for account data.
// They use MT4/MT5 FIX API or proprietary protocols.
// This route handles manual account setup + future MT5 bridge sync.

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: accounts } = await supabase
      .from("trading_accounts")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("created_at");

    return NextResponse.json({ accounts: accounts ?? [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { action } = body;

    if (action === "add_account") {
      const { account_number, account_type, server, currency, broker, balance } = body;

      if (!account_number) {
        return NextResponse.json({ error: "account_number is required" }, { status: 400 });
      }

      const { data, error } = await supabase
        .from("trading_accounts")
        .upsert(
          {
            user_id: user.id,
            broker: broker ?? "exness",
            account_number,
            account_type: account_type ?? "demo",
            server: server ?? "Exness-Trial",
            currency: currency ?? "USD",
            balance: balance ?? 0,
            equity: balance ?? 0,
            is_active: true,
          },
          { onConflict: "user_id,account_number" }
        )
        .select()
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ account: data });
    }

    if (action === "update_balance") {
      const { account_id, balance, equity, margin } = body;
      await supabase
        .from("trading_accounts")
        .update({
          balance,
          equity,
          margin,
          last_synced_at: new Date().toISOString(),
        })
        .eq("id", account_id)
        .eq("user_id", user.id);
      return NextResponse.json({ ok: true });
    }

    if (action === "remove_account") {
      await supabase
        .from("trading_accounts")
        .update({ is_active: false })
        .eq("id", body.account_id)
        .eq("user_id", user.id);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
