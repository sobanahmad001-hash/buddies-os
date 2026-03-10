import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

async function sb() {
  const c = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll() { return c.getAll(); }, setAll(s: any[]) { s.forEach(({ name, value, options }) => c.set(name, value, options)); } }
  });
}

export async function GET() {
  const supabase = await sb();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ invites: [] });

  const { data: ws } = await supabase.from("workspaces").select("id").eq("owner_id", user.id).single();
  if (!ws) return NextResponse.json({ invites: [] });

  const { data } = await supabase.from("workspace_invites").select("*").eq("workspace_id", ws.id).order("created_at", { ascending: false });
  return NextResponse.json({ invites: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await sb();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { email, role = "agent" } = await req.json();
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

  const { data: ws } = await supabase.from("workspaces").select("id,name").eq("owner_id", user.id).single();
  if (!ws) return NextResponse.json({ error: "No workspace found" }, { status: 400 });

  const { data, error } = await supabase.from("workspace_invites").insert({
    workspace_id: ws.id, invited_by: user.id, email, role
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://buddies-os.vercel.app"}/join?token=${data.token}`;
  return NextResponse.json({ invite: data, inviteUrl });
}

export async function DELETE(req: NextRequest) {
  const supabase = await sb();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await req.json();
  await supabase.from("workspace_invites").delete().eq("id", id);
  return NextResponse.json({ deleted: true });
}
