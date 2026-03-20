import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const vercelToken = process.env.VERCEL_TOKEN;
    const vercelProjectId = process.env.VERCEL_PROJECT_ID;

    if (!vercelToken || !vercelProjectId) {
      // Return cached logs from DB if no token
      const { data } = await supabase
        .from("vercel_logs")
        .select("*")
        .eq("user_id", user.id)
        .eq("level", "error")
        .order("occurred_at", { ascending: false })
        .limit(20);
      return NextResponse.json({ logs: data ?? [], source: "cache", configured: false });
    }

    // Fetch latest deployment
    const deploymentsRes = await fetch(
      `https://api.vercel.com/v6/deployments?projectId=${vercelProjectId}&limit=1&state=READY`,
      {
        headers: { Authorization: `Bearer ${vercelToken}` },
        signal: AbortSignal.timeout(5000),
      }
    ).catch(() => null);

    if (!deploymentsRes?.ok) {
      return NextResponse.json({ logs: [], source: "api_error", configured: true });
    }

    const deploymentsData = await deploymentsRes.json();
    const latestDeployment = deploymentsData?.deployments?.[0];
    if (!latestDeployment) return NextResponse.json({ logs: [], configured: true });

    // Fetch function logs for latest deployment
    const logsRes = await fetch(
      `https://api.vercel.com/v2/deployments/${latestDeployment.uid}/events?direction=backward&limit=100`,
      {
        headers: { Authorization: `Bearer ${vercelToken}` },
        signal: AbortSignal.timeout(8000),
      }
    ).catch(() => null);

    if (!logsRes?.ok) return NextResponse.json({ logs: [], configured: true });

    const logsData = await logsRes.json();
    const events = Array.isArray(logsData) ? logsData : (logsData?.events ?? []);

    // Filter to errors only
    const errors = events
      .filter((e: any) =>
        e.type === "stderr" ||
        (e.type === "response" && e.payload?.statusCode >= 500) ||
        (e.text && (e.text.includes("Error:") || e.text.includes("error") || e.text.includes("TypeError")))
      )
      .slice(0, 30)
      .map((e: any) => ({
        deployment_id: latestDeployment.uid,
        function_path: e.payload?.path ?? e.path ?? null,
        level: "error",
        message: e.text ?? e.payload?.statusMessage ?? JSON.stringify(e).slice(0, 500),
        occurred_at: e.created ? new Date(e.created).toISOString() : new Date().toISOString(),
      }));

    // Cache in DB
    if (errors.length > 0) {
      // Clear old logs for this user
      await supabase.from("vercel_logs").delete().eq("user_id", user.id);
      await supabase.from("vercel_logs").insert(
        errors.map((e: any) => ({ ...e, user_id: user.id }))
      );
    }

    return NextResponse.json({
      logs: errors,
      deployment: latestDeployment.url,
      deployment_id: latestDeployment.uid,
      configured: true,
      source: "api",
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
