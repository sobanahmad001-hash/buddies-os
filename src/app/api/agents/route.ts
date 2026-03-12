import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

async function userClient() {
  const c = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return c.getAll(); }, setAll(s: any[]) { s.forEach(({ name, value, options }) => c.set(name, value, options)); } } }
  );
}

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/agents?department_id=<uuid>  — list agents in a department
// GET /api/agents?organization_id=<uuid> — list all agents across an org
export async function GET(req: NextRequest) {
  const supabase = await userClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ agents: [] });

  const department_id = req.nextUrl.searchParams.get("department_id");
  const organization_id = req.nextUrl.searchParams.get("organization_id");

  // Must own the workspace to query agents
  const { data: ws } = await admin()
    .from("workspaces")
    .select("id")
    .eq("owner_id", user.id)
    .single();
  if (!ws) return NextResponse.json({ agents: [] });

  let query = admin()
    .from("memberships")
    .select("id, user_id, role, status, department_id, invited_email, departments(id, name, slug)")
    .eq("workspace_id", ws.id)
    .in("role", ["dept_head", "executive", "intern"])
    .neq("status", "suspended");

  if (department_id) {
    query = query.eq("department_id", department_id);
  } else if (organization_id) {
    // Get all dept IDs for this org, then filter by those
    const { data: depts } = await admin()
      .from("departments")
      .select("id")
      .eq("organization_id", organization_id);
    const deptIds = (depts ?? []).map((d: any) => d.id);
    if (!deptIds.length) return NextResponse.json({ agents: [] });
    query = query.in("department_id", deptIds);
  }

  const { data, error } = await query.order("role");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Enrich with profile data where available
  const agents = await Promise.all((data ?? []).map(async (m: any) => {
    if (m.user_id) {
      const { data: profile } = await admin()
        .from("profiles")
        .select("full_name, avatar_url")
        .eq("id", m.user_id)
        .maybeSingle();
      return { ...m, profile };
    }
    return m;
  }));

  return NextResponse.json({ agents });
}

// PATCH /api/agents — update agent role or department
// Body: { membership_id: string, role?: string, department_id?: string }
export async function PATCH(req: NextRequest) {
  const supabase = await userClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { membership_id, role, department_id } = await req.json();
  if (!membership_id) return NextResponse.json({ error: "membership_id required" }, { status: 400 });

  const validRoles = ["dept_head", "executive", "intern", "owner"];
  if (role && !validRoles.includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const { data: ws } = await admin()
    .from("workspaces")
    .select("id")
    .eq("owner_id", user.id)
    .single();
  if (!ws) return NextResponse.json({ error: "Not owner" }, { status: 403 });

  const updates: Record<string, string> = {};
  if (role) updates.role = role;
  if (department_id !== undefined) updates.department_id = department_id;

  const { error } = await admin()
    .from("memberships")
    .update(updates)
    .eq("id", membership_id)
    .eq("workspace_id", ws.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ updated: true });
}

// DELETE /api/agents — remove an agent from department (sets status = suspended)
// Body: { membership_id: string }
export async function DELETE(req: NextRequest) {
  const supabase = await userClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { membership_id } = await req.json();
  if (!membership_id) return NextResponse.json({ error: "membership_id required" }, { status: 400 });

  const { data: ws } = await admin()
    .from("workspaces")
    .select("id")
    .eq("owner_id", user.id)
    .single();
  if (!ws) return NextResponse.json({ error: "Not owner" }, { status: 403 });

  const { error } = await admin()
    .from("memberships")
    .update({ status: "suspended" })
    .eq("id", membership_id)
    .eq("workspace_id", ws.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ removed: true });
}
