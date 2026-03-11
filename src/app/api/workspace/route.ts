import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

async function getSupabase() {
  const c = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return c.getAll(); },
        setAll(s: any[]) { s.forEach(({ name, value, options }) => c.set(name, value, options)); }
      }
    }
  );
}

export async function GET() {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ workspace: null });

  // Check if owner
  const { data: owned } = await supabase
    .from("workspaces").select("*").eq("owner_id", user.id).maybeSingle();
  if (owned) return NextResponse.json({ workspace: owned, role: "owner" });

  // Check if member
  const { data: mem } = await supabase
    .from("memberships").select("role, workspace_id")
    .eq("user_id", user.id).eq("status", "active").maybeSingle();
  
  if (mem) {
    const { data: ws } = await supabase
      .from("workspaces").select("*").eq("id", mem.workspace_id).maybeSingle();
    if (ws) return NextResponse.json({ workspace: ws, role: mem.role });
  }

  return NextResponse.json({ workspace: null });
}

export async function POST(req: NextRequest) {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const name = body?.name?.trim();
  if (!name) return NextResponse.json({ error: "Workspace name required" }, { status: 400 });

  // Check already has workspace
  const { data: existing } = await supabase
    .from("workspaces").select("id, name").eq("owner_id", user.id).maybeSingle();
  if (existing) return NextResponse.json({ workspace: existing, role: "owner", already_exists: true });

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
    + "-" + Math.random().toString(36).slice(2, 7);

  // Create workspace
  const { data: ws, error: wsErr } = await supabase
    .from("workspaces")
    .insert({ name, owner_id: user.id, slug })
    .select().single();

  if (wsErr) {
    console.error("WS create error:", JSON.stringify(wsErr));
    return NextResponse.json({ error: wsErr.message, code: wsErr.code }, { status: 500 });
  }

  // Add owner as member
  const { error: memErr } = await supabase
    .from("memberships")
    .insert({ workspace_id: ws.id, user_id: user.id, role: "owner", status: "active" });

  if (memErr) {
    console.error("Membership error:", JSON.stringify(memErr));
    // Don't fail — workspace created, membership is secondary
  }

  return NextResponse.json({ workspace: ws, role: "owner" });
}
