import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

async function sb() {
  const c = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll() { return c.getAll(); }, setAll(s: any[]) { s.forEach(({ name, value, options }) => c.set(name, value, options)); } }
  });
}

export async function GET(req: NextRequest) {
  const supabase = await sb();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ departments: [] });

  // Lookup by workspace_id + optional slug (used by dept pages — bypasses client RLS)
  const workspace_id = req.nextUrl.searchParams.get("workspace_id");
  const slug = req.nextUrl.searchParams.get("slug");
  if (workspace_id && slug) {
    const { data } = await supabase.from("departments").select("*")
      .eq("workspace_id", workspace_id).eq("slug", slug).maybeSingle();
    return NextResponse.json({ department: data ?? null });
  }
  if (workspace_id) {
    const { data } = await supabase.from("departments").select("*")
      .eq("workspace_id", workspace_id).order("name");
    return NextResponse.json({ departments: data ?? [] });
  }

  // Phase 2: if organization_id query param provided, list departments for that org
  const organization_id = req.nextUrl.searchParams.get("organization_id");
  if (organization_id) {
    const { data, error } = await supabase
      .from("departments")
      .select("id, name, organization_id, created_at")
      .eq("organization_id", organization_id)
      .order("name");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ departments: data ?? [] });
  }

  // Legacy: look up via workspace membership
  const { data: mem } = await supabase.from("memberships").select("workspace_id").eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (!mem) return NextResponse.json({ departments: [] });
  const { data } = await supabase.from("departments").select("*").eq("workspace_id", mem.workspace_id).order("name");
  return NextResponse.json({ departments: data ?? [] });
}

// POST /api/departments — create a department inside an organization
// Body: { organization_id: string, name: string }
export async function POST(req: NextRequest) {
  const supabase = await sb();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

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
