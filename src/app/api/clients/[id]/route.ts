import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

async function sb() {
  const c = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return c.getAll(); }, setAll(s: any[]) { s.forEach(({ name, value, options }) => c.set(name, value, options)); } } }
  );
}

// GET /api/clients/[id]
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await sb();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;

  // Owner check
  const { data: ws } = await supabase.from("workspaces").select("id").eq("owner_id", user.id).maybeSingle();
  if (ws) {
    const { data, error } = await supabase.from("clients").select("*").eq("id", id).eq("workspace_id", ws.id).maybeSingle();
    if (error || !data) return NextResponse.json({ error: "Client not found" }, { status: 404 });
    return NextResponse.json({ client: data });
  }

  // Member — check client_access
  const { data: access } = await supabase.from("client_access").select("client_id").eq("client_id", id).eq("user_id", user.id).maybeSingle();
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { data, error } = await supabase.from("clients").select("*").eq("id", id).maybeSingle();
  if (error || !data) return NextResponse.json({ error: "Client not found" }, { status: 404 });
  return NextResponse.json({ client: data });
}

// PUT /api/clients/[id]
// Body: { name?, industry?, website?, contact_email?, status? }
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await sb();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;

  // Only workspace owners may update clients
  const { data: ws } = await supabase.from("workspaces").select("id").eq("owner_id", user.id).maybeSingle();
  if (!ws) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  // Whitelist updatable fields
  const allowed: Record<string, unknown> = {};
  for (const key of ["name", "industry", "website", "contact_email", "status", "notes"]) {
    if (key in body) allowed[key] = body[key];
  }
  if (!Object.keys(allowed).length) {
    return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("clients")
    .update(allowed)
    .eq("id", id)
    .eq("workspace_id", ws.id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ client: data });
}

// DELETE /api/clients/[id]
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await sb();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;

  const { data: ws } = await supabase.from("workspaces").select("id").eq("owner_id", user.id).maybeSingle();
  if (!ws) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { error } = await supabase.from("clients").delete().eq("id", id).eq("workspace_id", ws.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
