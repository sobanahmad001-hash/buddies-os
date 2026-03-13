import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { ensureDefaultWorkspaceDepartments } from "@/lib/departments";

async function sb() {
  const c = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll() { return c.getAll(); }, setAll(s: any[]) { s.forEach(({ name, value, options }) => c.set(name, value, options)); } }
  });
}

// Use service role when available so broken/missing RLS policies never block reads
function admin() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceKey) return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey);
  return null;
}

export async function GET(req: NextRequest) {
  const supabase = await sb();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ departments: [] });

  // Prefer service role client for reads so RLS policy issues don't block the app
  const reader = admin() ?? supabase;

  async function seedIfOwner(workspaceId: string, onlySlug?: string) {
    const { data: owned } = await reader
      .from("workspaces")
      .select("id")
      .eq("id", workspaceId)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (!owned) return;
    await ensureDefaultWorkspaceDepartments(reader, workspaceId, onlySlug ? [onlySlug] : undefined);
  }

  // Lookup by workspace_id + optional slug (used by dept pages)
  const workspace_id = req.nextUrl.searchParams.get("workspace_id");
  const slug = req.nextUrl.searchParams.get("slug");
  if (workspace_id && slug) {
    try { await seedIfOwner(workspace_id, slug); } catch {}
    const { data } = await reader.from("departments").select("*")
      .eq("workspace_id", workspace_id).eq("slug", slug).maybeSingle();
    return NextResponse.json({ department: data ?? null });
  }
  if (workspace_id) {
    try { await seedIfOwner(workspace_id); } catch {}
    const { data } = await reader.from("departments").select("*")
      .eq("workspace_id", workspace_id).order("name");
    return NextResponse.json({ departments: data ?? [] });
  }

  // organization_id lookup
  const organization_id = req.nextUrl.searchParams.get("organization_id");
  if (organization_id) {
    const { data, error } = await reader
      .from("departments")
      .select("id, name, organization_id, created_at")
      .eq("organization_id", organization_id)
      .order("name");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ departments: data ?? [] });
  }

  // Legacy: look up via workspace membership
  const { data: mem } = await reader.from("memberships").select("workspace_id").eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (!mem) return NextResponse.json({ departments: [] });
  const { data } = await reader.from("departments").select("*").eq("workspace_id", mem.workspace_id).order("name");
  return NextResponse.json({ departments: data ?? [] });
}

  const body = await req.json();
  const { organization_id, name } = body;
  if (!organization_id || !name?.trim()) {
    return NextResponse.json({ error: "organization_id and name are required" }, { status: 400 });
  }

  // Verify the caller owns the organization
  const { data: org } = await supabase
    .from("organizations")
    .select("id")
    .eq("id", organization_id)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!org) return NextResponse.json({ error: "Organization not found or access denied" }, { status: 403 });

  const { data, error } = await supabase
    .from("departments")
    .insert({ organization_id, name: name.trim() })
    .select("id, name, organization_id, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ department: data }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const supabase = await sb();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { member_id, department_id } = await req.json();
  const { error } = await supabase.from("memberships").update({ department_id }).eq("id", member_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ updated: true });
}
