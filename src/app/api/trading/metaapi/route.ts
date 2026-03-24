import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { provisionAndDeploy, getLiveAccountInfo, getAccountState } from "@/lib/metaapi";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { action } = body;

    // ── Connect: provision MT5 account on MetaAPI, store accountId ────────────
    if (action === "connect") {
      const { token, login, password, server } = body as {
        token: string; login: string; password: string; server: string;
      };

      if (!token || !login || !password || !server) {
        return NextResponse.json(
          { error: "token, login, password, and server are all required" },
          { status: 400 }
        );
      }

      // Provision on MetaAPI — password goes directly to MetaAPI and is never stored here
      const metaapiAccountId = await provisionAndDeploy(token, login, password, server);

      // Upsert into trading_accounts by (user_id, account_number)
      const { data, error } = await supabase
        .from("trading_accounts")
        .upsert(
          {
            user_id: user.id,
            broker: "exness",
            account_number: login,
            account_type: "demo",
            server,
            currency: "USD",
            balance: 0,
            equity: 0,
            margin: 0,
            is_active: true,
            mt_login: login,
            mt_server: server,
            metaapi_token: token,
            metaapi_account_id: metaapiAccountId,
          },
          { onConflict: "user_id,account_number" }
        )
        // Never return the token back to the client
        .select("id, account_number, account_type, server, currency, balance, equity, margin, last_synced_at, metaapi_account_id")
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ account: data });
    }

    // ── Sync: fetch live balance/equity from MetaAPI, update DB ───────────────
    if (action === "sync") {
      const { account_id } = body;
      if (!account_id) return NextResponse.json({ error: "account_id required" }, { status: 400 });

      // Read token server-side only — never from client
      const { data: account } = await supabase
        .from("trading_accounts")
        .select("metaapi_token, metaapi_account_id")
        .eq("id", account_id)
        .eq("user_id", user.id)
        .single();

      if (!account?.metaapi_token || !account?.metaapi_account_id) {
        return NextResponse.json(
          { error: "Account is not connected to MetaAPI" },
          { status: 400 }
        );
      }

      const info = await getLiveAccountInfo(account.metaapi_token, account.metaapi_account_id);
      if ("_error" in info) {
        return NextResponse.json({ error: info._error }, { status: 503 });
      }

      await supabase
        .from("trading_accounts")
        .update({
          balance: info.balance,
          equity: info.equity,
          margin: info.margin,
          last_synced_at: new Date().toISOString(),
        })
        .eq("id", account_id)
        .eq("user_id", user.id);

      return NextResponse.json({
        balance: info.balance,
        equity: info.equity,
        margin: info.margin,
        freeMargin: info.freeMargin,
        leverage: info.leverage,
        currency: info.currency,
      });
    }

    // ── Status: check if the MetaAPI account is deployed and connected ────────
    if (action === "status") {
      const { account_id } = body;
      if (!account_id) return NextResponse.json({ error: "account_id required" }, { status: 400 });

      const { data: account } = await supabase
        .from("trading_accounts")
        .select("metaapi_token, metaapi_account_id")
        .eq("id", account_id)
        .eq("user_id", user.id)
        .single();

      if (!account?.metaapi_token || !account?.metaapi_account_id) {
        return NextResponse.json({ connected: false, state: "NOT_CONFIGURED" });
      }

      const state = await getAccountState(account.metaapi_token, account.metaapi_account_id);
      return NextResponse.json({
        connected: state?.state === "DEPLOYED",
        state: state?.state ?? "UNKNOWN",
        connectionStatus: state?.connectionStatus,
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
