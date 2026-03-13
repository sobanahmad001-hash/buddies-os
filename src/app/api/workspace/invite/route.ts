import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

async function getSupabase() {
  const c = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return c.getAll(); }, setAll(s: any[]) { s.forEach(({ name, value, options }) => c.set(name, value, options)); } } }
  );
}

export async function POST(req: NextRequest) {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { email, role = "agent", workspace_id } = await req.json();
  if (!email?.trim()) return NextResponse.json({ error: "email required" }, { status: 400 });
  if (!workspace_id) return NextResponse.json({ error: "workspace_id required" }, { status: 400 });

  const { data, error } = await supabase.from("workspace_invites").insert({
    workspace_id, invited_by: user.id, email: email.trim(), role
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://buddies-os.vercel.app"}/join?token=${data.token}`;
  return NextResponse.json({ invite: data, inviteUrl });
}

export async function GET(req: NextRequest) {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ invites: [] });
  const wsId = req.nextUrl.searchParams.get("workspace_id");
  if (!wsId) return NextResponse.json({ invites: [] });
  const { data } = await supabase.from("workspace_invites").select("*")
    .eq("workspace_id", wsId).order("created_at", { ascending: false });
  return NextResponse.json({ invites: data ?? [] });
}

export async function DELETE(req: NextRequest) {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const inviteId = req.nextUrl.searchParams.get("id");
  if (!inviteId) return NextResponse.json({ error: "invite id required" }, { status: 400 });

  // Only allow the user who created the invite (or workspace owner) to revoke it
  const { data: invite } = await supabase.from("workspace_invites").select("invited_by, workspace_id")
    .eq("id", inviteId).single();
  if (!invite) return NextResponse.json({ error: "Invite not found" }, { status: 404 });

  const { data: ws } = await supabase.from("workspaces").select("id")
    .eq("id", invite.workspace_id).eq("owner_id", user.id).maybeSingle();

  if (!ws && invite.invited_by !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await supabase.from("workspace_invites").update({ status: "cancelled" }).eq("id", inviteId);
  return NextResponse.json({ revoked: true });
}
