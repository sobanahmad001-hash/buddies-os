import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll(s) { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const sessionId = req.nextUrl.searchParams.get("id");
  const agentType = req.nextUrl.searchParams.get("agent_type") ?? "main";

  if (sessionId) {
    const { data } = await supabase.from("ai_sessions").select("*").eq("id", sessionId).eq("user_id", user.id).single();
    return NextResponse.json({ session: data });
  }

  const { data } = await supabase.from("ai_sessions")
    .select("id, title, created_at, updated_at, agent_type")
    .eq("user_id", user.id)
    .eq("agent_type", agentType)
    .order("updated_at", { ascending: false })
    .limit(60);
  return NextResponse.json({ sessions: data ?? [] });
}

export async function DELETE(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll(s) { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  await supabase.from("ai_sessions").delete().eq("id", id).eq("user_id", user.id);
  return NextResponse.json({ deleted: true });
}

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll(s) { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { sessionId, messages, title, agent_type } = await req.json();

  if (sessionId) {
    await supabase.from("ai_sessions").update({ messages, updated_at: new Date().toISOString() }).eq("id", sessionId).eq("user_id", user.id);
    return NextResponse.json({ saved: true });
  }

  const { data } = await supabase.from("ai_sessions").insert({
    user_id: user.id,
    messages,
    title: title ?? messages[0]?.content?.slice(0, 60) ?? "New session",
    agent_type: agent_type ?? "main",
  }).select("id").single();

  return NextResponse.json({ sessionId: data?.id });
}
