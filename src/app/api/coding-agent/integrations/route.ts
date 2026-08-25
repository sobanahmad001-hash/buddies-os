import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: integrations } = await supabase.from("integrations")
    .select("id,type,name,status,config,created_at")
    .eq("user_id", user.id)
    .in("type", ["github", "supabase", "vercel"]);

  const active = (integrations ?? []).filter((item: any) => item.status === "active");
  const repositories = active.filter((item: any) => item.type === "github").map((item: any) => ({
    id: item.id,
    name: item.name,
    repository: item.config?.repo_url?.replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "") ?? null,
  })).filter((item: any) => item.repository);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  let databaseReachable = false;
  if (supabaseUrl) {
    const { error } = await supabase.from("coding_agent_jobs").select("id", { head: true }).limit(1);
    databaseReachable = !error;
  }

  const githubToken = process.env.GITHUB_TOKEN;
  let githubReachable = false;
  if (githubToken) {
    const response = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${githubToken}`, Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(5000), cache: "no-store",
    }).catch(() => null);
    githubReachable = response?.ok === true;
  }

  const vercelToken = process.env.VERCEL_TOKEN;
  const vercelProjectId = process.env.VERCEL_PROJECT_ID;
  let deployment: null | { id: string; url: string | null; state: string; createdAt: number | null } = null;
  if (vercelToken && vercelProjectId) {
    const response = await fetch(`https://api.vercel.com/v6/deployments?projectId=${encodeURIComponent(vercelProjectId)}&limit=1`, {
      headers: { Authorization: `Bearer ${vercelToken}` },
      signal: AbortSignal.timeout(6000), cache: "no-store",
    }).catch(() => null);
    if (response?.ok) {
      const payload = await response.json();
      const latest = payload?.deployments?.[0];
      if (latest) deployment = { id: latest.uid, url: latest.url ?? null, state: latest.state ?? "UNKNOWN", createdAt: latest.createdAt ?? null };
    }
  }

  let supabaseHost: string | null = null;
  try { supabaseHost = supabaseUrl ? new URL(supabaseUrl).hostname : null; } catch {}

  return NextResponse.json({
    tools: {
      github: { configured: Boolean(githubToken), reachable: githubReachable, repositories },
      supabase: { configured: Boolean(supabaseUrl && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY), reachable: databaseReachable, host: supabaseHost },
      vercel: { configured: Boolean(vercelToken && vercelProjectId), reachable: Boolean(deployment), projectId: vercelProjectId ?? null, deployment },
    },
  });
}

