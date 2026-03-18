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

  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: sessions } = await supabase
    .from("project_chat_sessions")
    .select("id, title, created_at, updated_at")
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(100);

  return NextResponse.json({ sessions: sessions ?? [] });
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

  const { projectId, title } = await req.json();
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const sessionTitle = typeof title === "string" && title.trim() ? title.trim().slice(0, 120) : "New chat";

  const { data: session } = await supabase
    .from("project_chat_sessions")
    .insert({
      project_id: projectId,
      user_id: user.id,
      title: sessionTitle,
    })
    .select("id, title, created_at, updated_at")
    .single();

  return NextResponse.json({ session });
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

  const projectId = req.nextUrl.searchParams.get("projectId");
  const sessionId = req.nextUrl.searchParams.get("id");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });
  if (!sessionId) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { data: session } = await supabase
    .from("project_chat_sessions")
    .select("id")
    .eq("id", sessionId)
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .single();
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  await supabase.from("project_chat_messages").delete().eq("project_id", projectId).eq("session_id", sessionId);
  await supabase.from("project_chat_sessions").delete().eq("id", sessionId).eq("project_id", projectId).eq("user_id", user.id);

  return NextResponse.json({ success: true });
}
