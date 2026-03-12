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

// GET /api/marketing/calendar?client_id=<uuid>&status=<status>
export async function GET(req: NextRequest) {
  const supabase = await sb();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const client_id = req.nextUrl.searchParams.get("client_id");
  const status    = req.nextUrl.searchParams.get("status");
  if (!client_id) return NextResponse.json({ error: "client_id is required" }, { status: 400 });

  let q = supabase
    .from("content_calendar")
    .select("id, client_id, title, content_type, platform, scheduled_date, status, notes, created_at")
    .eq("client_id", client_id)
    .order("scheduled_date", { ascending: true });

  if (status) q = q.eq("status", status);

  const { data, error } = await q.limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ events: data ?? [] });
}

// POST /api/marketing/calendar
// Body: { client_id, title, content_type?, platform?, scheduled_date, notes? }
export async function POST(req: NextRequest) {
  const supabase = await sb();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json();
  const { client_id, title, content_type, platform, scheduled_date, notes } = body;
  if (!client_id || !title?.trim() || !scheduled_date) {
    return NextResponse.json({ error: "client_id, title, and scheduled_date are required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("content_calendar")
    .insert({
      client_id,
      title: title.trim(),
      content_type: content_type ?? "blog",
      platform: platform ?? null,
      scheduled_date,
      notes: notes ?? null,
      status: "pending",
      created_by: user.id,
    })
    .select("id, client_id, title, content_type, platform, scheduled_date, status, notes")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ event: data }, { status: 201 });
}

// PATCH /api/marketing/calendar — update status or details
// Body: { id, ...fields }
export async function PATCH(req: NextRequest) {
  const supabase = await sb();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id, ...updates } = await req.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { error } = await supabase.from("content_calendar").update(updates).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ updated: true });
}

// DELETE /api/marketing/calendar — Body: { id }
export async function DELETE(req: NextRequest) {
  const supabase = await sb();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { error } = await supabase.from("content_calendar").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
