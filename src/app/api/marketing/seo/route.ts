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

// GET /api/marketing/seo?client_id=<uuid>&keyword=<text>
export async function GET(req: NextRequest) {
  const supabase = await sb();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const client_id = req.nextUrl.searchParams.get("client_id");
  const keyword   = req.nextUrl.searchParams.get("keyword");
  if (!client_id) return NextResponse.json({ error: "client_id is required" }, { status: 400 });

  let q = supabase
    .from("seo_metrics")
    .select("id, client_id, keyword, ranking, url, date, created_at")
    .eq("client_id", client_id)
    .order("date", { ascending: false });

  if (keyword) q = q.ilike("keyword", `%${keyword}%`);

  const { data, error } = await q.limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ metrics: data ?? [] });
}

// POST /api/marketing/seo
// Body: { client_id, keyword, ranking?, url? }
export async function POST(req: NextRequest) {
  const supabase = await sb();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json();
  const { client_id, keyword, ranking, url, date } = body;
  if (!client_id || !keyword?.trim()) {
    return NextResponse.json({ error: "client_id and keyword are required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("seo_metrics")
    .insert({ client_id, keyword: keyword.trim(), ranking: ranking ?? null, url: url ?? null, date: date ?? new Date().toISOString() })
    .select("id, client_id, keyword, ranking, url, date")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ metric: data }, { status: 201 });
}

// DELETE /api/marketing/seo  — Body: { id }
export async function DELETE(req: NextRequest) {
  const supabase = await sb();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { error } = await supabase.from("seo_metrics").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
