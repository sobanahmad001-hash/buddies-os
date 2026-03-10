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

  const { item, source_message_id } = await req.json();
  const msgId = source_message_id ?? `msg_${Date.now()}`;

  // Use assignedProjectId first (from selector), fall back to fuzzy name match
  let projectId: string | null = item.assignedProjectId ?? null;

  if (!projectId && item.project) {
    const { data: proj } = await supabase
      .from("projects")
      .select("id")
      .eq("user_id", user.id)
      .ilike("name", `%${item.project}%`)
      .limit(1);
    projectId = proj?.[0]?.id ?? null;
  }

  try {
    if (item.type === "project_update" || item.type === "blocker") {
      const { error } = await supabase.from("project_updates").insert({
        user_id: user.id,
        project_id: projectId,
        content: item.content,
        update_type: item.type === "blocker" ? "blocker" : (item.update_type ?? "progress"),
        next_actions: item.next_actions ?? null,
        source_message_id: msgId,
      });
      if (error) throw error;

      // Update project updated_at so momentum tracking stays fresh
      if (projectId) {
        await supabase.from("projects").update({ updated_at: new Date().toISOString() }).eq("id", projectId);
      }
    } else if (item.type === "decision") {
      const { error } = await supabase.from("decisions").insert({
        user_id: user.id,
        project_id: projectId,
        context: item.context ?? item.content,
        verdict: item.verdict ?? "wait",
        probability: item.probability ?? null,
        domain: "general",
        source_message_id: msgId,
      });
      if (error) throw error;
    } else if (item.type === "rule") {
      const { error } = await supabase.from("rules").insert({
        user_id: user.id,
        project_id: projectId,
        rule_text: item.rule_text ?? item.content,
        severity: item.severity ?? 2,
        active: true,
        domain: "general",
        source_message_id: msgId,
      });
      if (error) throw error;
    } else if (item.type === "daily_check") {
      const validMoods = ["calm","focused","rushed","bored","anxious","fearful","angry","frustrated","overconfident","exhausted"];
      const { error } = await supabase.from("behavior_logs").insert({
        user_id: user.id,
        mood_tag: validMoods.includes(item.mood ?? "") ? item.mood : null,
        sleep_hours: item.sleep_hours ?? null,
        stress: item.stress ?? null,
        notes: item.notes ?? null,
        timestamp: new Date().toISOString(),
        source_message_id: msgId,
      });
      if (error) throw error;
    }

    // Log to training_logs
    await supabase.from("training_logs").insert({
      user_id: user.id,
      raw_input: item.content,
      parsed_output: item,
      was_confirmed: true,
      final_output: { ...item, resolvedProjectId: projectId },
      source: "gpt4o",
      intent_detected: item.type,
      confidence_score: 0.9,
    });

    return NextResponse.json({ saved: true, projectId });
  } catch (err: any) {
    console.error("Save error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
