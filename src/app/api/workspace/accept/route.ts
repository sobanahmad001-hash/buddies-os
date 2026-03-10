import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const c = await cookies();
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll() { return c.getAll(); }, setAll(s: any[]) { s.forEach(({ name, value, options }) => c.set(name, value, options)); } }
  });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { token } = await req.json();
  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });

  const { data: invite } = await supabase.from("workspace_invites").select("*")
    .eq("token", token).eq("status", "pending").single();

  if (!invite) return NextResponse.json({ error: "Invalid or expired invite" }, { status: 404 });
  if (new Date(invite.expires_at) < new Date()) return NextResponse.json({ error: "Invite expired" }, { status: 410 });

  // Create membership
  const { error } = await supabase.from("memberships").insert({
    workspace_id: invite.workspace_id, user_id: user.id, role: invite.role,
    invited_by: invite.invited_by, invited_email: invite.email, status: "active"
  });
  if (error && !error.message.includes("duplicate")) return NextResponse.json({ error: error.message }, { status: 500 });

  // Mark invite accepted
  await supabase.from("workspace_invites").update({ status: "accepted" }).eq("id", invite.id);

  return NextResponse.json({ success: true, workspace_id: invite.workspace_id, role: invite.role });
}
