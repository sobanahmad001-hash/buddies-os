import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

async function userClient() {
  const c = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll() { return c.getAll(); }, setAll(s: any[]) { s.forEach(({ name, value, options }) => c.set(name, value, options)); } }
  });
}
const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET() {
  const supabase = await userClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ members: [] });
  const { data: ws } = await admin().from("workspaces").select("id").eq("owner_id", user.id).single();
  if (!ws) return NextResponse.json({ members: [] });
  const { data } = await admin().from("memberships").select("*, profiles(full_name, avatar_url)").eq("workspace_id", ws.id);
  return NextResponse.json({ members: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  const supabase = await userClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { member_id, role, status } = await req.json();
  const { data: ws } = await admin().from("workspaces").select("id").eq("owner_id", user.id).single();
  if (!ws) return NextResponse.json({ error: "Not owner" }, { status: 403 });
  const updates: any = {};
  if (role) updates.role = role;
  if (status) updates.status = status;
  await admin().from("memberships").update(updates).eq("id", member_id).eq("workspace_id", ws.id);
  return NextResponse.json({ updated: true });
}
