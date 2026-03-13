import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

async function getClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll(s) { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } } }
  );
}

async function verifyOwner(supabase: any, projectId: string, userId: string) {
  const { data } = await supabase.from("projects").select("id").eq("id", projectId).eq("user_id", userId).single();
  return !!data;
}

export async function GET(req: NextRequest) {
  const supabase = await getClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });
  if (!await verifyOwner(supabase, projectId, user.id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data } = await supabase
    .from("project_decisions")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  return NextResponse.json({ decisions: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await getClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { projectId, title, context, verdict } = await req.json();
  if (!projectId || !title || !context) return NextResponse.json({ error: "projectId, title, context required" }, { status: 400 });
  if (!await verifyOwner(supabase, projectId, user.id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data, error } = await supabase.from("project_decisions").insert({
    project_id: projectId,
    user_id: user.id,
    title,
    context,
    verdict: verdict || null,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ decision: data }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const supabase = await getClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id, outcome } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { data, error } = await supabase
    .from("project_decisions")
    .update({ outcome })
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ decision: data });
}
