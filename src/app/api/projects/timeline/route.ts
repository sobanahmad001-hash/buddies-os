import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

async function sb() {
  const c = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return c.getAll(); }, setAll(s: any[]) { s.forEach(({ name, value, options }) => c.set(name, value, options)); } } }
  );
}

export async function GET(req: NextRequest) {
  const supabase = await sb();
  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ timeline: [] });
  const { data } = await supabase.from("projects").select("timeline_json").eq("id", projectId).single();
  return NextResponse.json({ timeline: data?.timeline_json ?? [] });
}

export async function POST(req: NextRequest) {
  // Add a node to the project timeline
  const supabase = await sb();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, node } = await req.json();
  // node: { type: "research"|"decision"|"task_batch"|"document"|"pivot", label: string, detail?: string }

  const { data: project } = await supabase.from("projects")
    .select("timeline_json").eq("id", projectId).eq("user_id", user.id).single();
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const existing: any[] = project.timeline_json ?? [];
  const newNode = {
    id: `node_${Date.now()}`,
    ...node,
    timestamp: new Date().toISOString(),
    index: existing.length,
  };

  await supabase.from("projects").update({
    timeline_json: [...existing, newNode],
  }).eq("id", projectId);

  return NextResponse.json({ added: true, node: newNode });
}
