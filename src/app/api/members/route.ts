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
        setAll(s: any[]) { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); },
      },
    }
  );
}

// GET /api/members?department_id=<uuid>  — list members of a department
export async function GET(req: NextRequest) {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const department_id = req.nextUrl.searchParams.get("department_id");
  if (!department_id) return NextResponse.json({ error: "department_id is required" }, { status: 400 });

  const { data, error } = await supabase
    .from("team_members")
    .select("id, user_id, department_id, role, created_at")
    .eq("department_id", department_id)
    .order("created_at");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ members: data ?? [] });
}

// POST /api/members — add a team member to a department
// Body: { user_id: string, department_id: string, role?: string }
export async function POST(req: NextRequest) {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json();
  const { user_id, department_id, role = "member" } = body;
  if (!user_id || !department_id) {
    return NextResponse.json({ error: "user_id and department_id are required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("team_members")
    .insert({ user_id, department_id, role })
    .select("id, user_id, department_id, role, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ member: data }, { status: 201 });
}

// DELETE /api/members — remove a team member from a department
// Body: { user_id: string, department_id: string }
export async function DELETE(req: NextRequest) {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json();
  const { user_id, department_id } = body;
  if (!user_id || !department_id) {
    return NextResponse.json({ error: "user_id and department_id are required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("team_members")
    .delete()
    .eq("user_id", user_id)
    .eq("department_id", department_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
