import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

function createSupabaseClient(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(s: any[]) {
          s.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        },
      },
    }
  );
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const agentType = searchParams.get("agent_type") || "project_assistant";

  const cookieStore = await cookies();
  const supabase = createSupabaseClient(cookieStore);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("ai_chats")
    .select("role, content")
    .eq("user_id", user.id)
    .eq("agent_type", agentType)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ messages: data || [] });
}

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createSupabaseClient(cookieStore);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { agent_type, messages } = await req.json();

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "messages array required" }, { status: 400 });
  }

  const records = messages.map((msg: { role: string; content: string }) => ({
    user_id: user.id,
    agent_type: agent_type || "project_assistant",
    role: msg.role,
    content: msg.content,
    created_at: new Date().toISOString(),
  }));

  const { error } = await supabase.from("ai_chats").insert(records);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
