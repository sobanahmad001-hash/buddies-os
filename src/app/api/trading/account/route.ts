import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Paper account management. Broker connectivity is intentionally unsupported.

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: accounts } = await supabase
      .from("trading_accounts")
      .select("id, broker, account_number, account_type, server, currency, balance, equity, margin, is_active, created_at")
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
      const { account_number, server, currency, balance } = body;

      if (!account_number) {
        return NextResponse.json({ error: "account_number is required" }, { status: 400 });
      }

      const { data, error } = await supabase
        .from("trading_accounts")
        .upsert(
          {
            user_id: user.id,
            broker: "paper",
            account_number,
            account_type: "demo",
            server: server ?? "Buddies-Paper",
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

    if (action === "add_to_watchlist") {
      const { symbol, display_name, asset_type } = body;
      if (!symbol || !display_name) {
        return NextResponse.json({ error: "symbol and display_name are required" }, { status: 400 });
      }

      // sort_order = current max + 1
      const { data: existing } = await supabase
        .from("trading_watchlist")
        .select("sort_order")
        .eq("user_id", user.id)
        .order("sort_order", { ascending: false })
        .limit(1)
        .single();

      const nextOrder = ((existing as any)?.sort_order ?? -1) + 1;

      const { data, error } = await supabase
        .from("trading_watchlist")
        .upsert(
          {
            user_id: user.id,
            symbol,
            display_name,
            asset_type: asset_type ?? "commodity",
            sort_order: nextOrder,
            is_active: true,
          },
          { onConflict: "user_id,symbol" }
        )
        .select()
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ item: data });
    }

    if (action === "remove_from_watchlist") {
      const { watchlist_id } = body;
      if (!watchlist_id) return NextResponse.json({ error: "watchlist_id required" }, { status: 400 });

      await supabase
        .from("trading_watchlist")
        .delete()
        .eq("id", watchlist_id)
        .eq("user_id", user.id);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
