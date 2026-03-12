import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(s) { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); }
      }
    }
  );
}

export async function GET(req: NextRequest) {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ projects: [] });

  const { searchParams } = new URL(req.url);
  const organizationId = searchParams.get("organization_id");

  let q = supabase
    .from("projects")
    .select("id, name, status, updated_at, organization_id")
    .eq("user_id", user.id);
  if (organizationId) q = q.eq("organization_id", organizationId);
  const { data } = await q.order("updated_at", { ascending: false });
  return NextResponse.json({ projects: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json();
  const name = body.name?.trim();
  const description = body.description?.trim() ?? null;
  const department_id = body.department_id ?? null;
  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });

  // Return existing if already exists (same user + name)
  const { data: existing } = await supabase
    .from("projects").select("id, name, status")
    .eq("user_id", user.id).ilike("name", name).limit(1);
  if (existing && existing.length > 0) {
    return NextResponse.json({ project: existing[0], existed: true });
  }

  const organization_id = body.organization_id ?? null;
  const { data, error } = await supabase
    .from("projects")
    .insert({ user_id: user.id, name, description, status: "active", tags: [], department_id, organization_id })
    .select("id, name, status, department_id, organization_id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ project: data });
}
