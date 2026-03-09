import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll(s) { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { item } = await req.json();

  try {
    // Resolve project name to ID if provided
    let projectId: string | null = null;
    if (item.project) {
      const { data: projects } = await supabase
        .from("projects")
        .select("id, name")
        .eq("user_id", user.id)
        .ilike("name", `%${item.project}%`)
        .limit(1);
      projectId = projects?.[0]?.id ?? null;

      // Create project if it doesn't exist and type is project_update
      if (!projectId && item.type === "project_update") {
        const { data: newProject } = await supabase
          .from("projects")
          .insert({ user_id: user.id, name: item.project, status: "active" })
          .select("id")
          .single();
        projectId = newProject?.id ?? null;
      }
    }

    switch (item.type) {
      case "project_update": {
        if (!projectId) return NextResponse.json({ error: "No project found" }, { status: 400 });
        await supabase.from("project_updates").insert({
          user_id: user.id,
          project_id: projectId,
          content: item.content,
          update_type: item.update_type ?? "note",
          next_actions: item.next_actions ?? null,
        });
        // Update project updated_at
        await supabase.from("projects").update({ updated_at: new Date().toISOString() }).eq("id", projectId);
        break;
      }
      case "blocker": {
        if (!projectId) return NextResponse.json({ error: "No project found" }, { status: 400 });
        await supabase.from("project_updates").insert({
          user_id: user.id,
          project_id: projectId,
          content: item.content,
          update_type: "blocker",
          next_actions: item.next_actions ?? null,
        });
        break;
      }
      case "decision": {
        await supabase.from("decisions").insert({
          user_id: user.id,
          project_id: projectId,
          context: item.context ?? item.content,
          verdict: item.verdict ?? null,
          probability: item.probability ?? null,
        });
        break;
      }
      case "rule": {
        await supabase.from("rules").insert({
          user_id: user.id,
          project_id: projectId,
          rule_text: item.rule_text ?? item.content,
          severity: item.severity ?? 2,
          domain: "general",
          active: true,
        });
        break;
      }
      case "daily_check": {
        await supabase.from("behavior_logs").insert({
          user_id: user.id,
          timestamp: new Date().toISOString(),
          mood_tag: item.mood ?? null,
          sleep_hours: item.sleep_hours ?? null,
          stress: item.stress ?? null,
          notes: item.notes ?? null,
        });
        break;
      }
      default:
        return NextResponse.json({ error: "Unknown item type" }, { status: 400 });
    }

    return NextResponse.json({ saved: true, type: item.type });
  } catch (err: any) {
    console.error("Save error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
