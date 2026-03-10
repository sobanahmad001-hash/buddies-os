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

  let projectId: string | null = null;
  if (item.project) {
    const { data: proj } = await supabase
      .from("projects")
      .select("id")
      .eq("user_id", user.id)
      .ilike("name", `%${item.project}%`)
      .limit(1);
    projectId = proj?.[0]?.id ?? null;
    // NO auto-create — if project not found, save without project_id
  }

  try {
    if (item.type === "project_update" || item.type === "blocker") {
      await supabase.from("project_updates").insert({
        user_id: user.id,
        project_id: projectId,
        content: item.content,
        update_type: item.type === "blocker" ? "blocker" : (item.update_type ?? "progress"),
        next_actions: item.next_actions ?? null,
        source_message_id: msgId,
      });
    } else if (item.type === "decision") {
      await supabase.from("decisions").insert({
        user_id: user.id,
        project_id: projectId,
        context: item.context ?? item.content,
        verdict: item.verdict ?? "wait",
        probability: item.probability ?? null,
        domain: "general",
        source_message_id: msgId,
      });
    } else if (item.type === "rule") {
      await supabase.from("rules").insert({
        user_id: user.id,
        project_id: projectId,
        rule_text: item.rule_text ?? item.content,
        severity: item.severity ?? 2,
        active: true,
        domain: "general",
        source_message_id: msgId,
      });
    } else if (item.type === "daily_check") {
      const validMoods = ["calm","focused","rushed","bored","anxious","fearful","angry","frustrated","overconfident","exhausted"];
      await supabase.from("behavior_logs").insert({
        user_id: user.id,
        mood_tag: validMoods.includes(item.mood ?? "") ? item.mood : null,
        sleep_hours: item.sleep_hours ?? null,
        stress: item.stress ?? null,
        notes: item.notes ?? null,
        timestamp: new Date().toISOString(),
        source_message_id: msgId,
      });
    }

    // Log to training_logs
    await supabase.from("training_logs").insert({
      user_id: user.id,
      raw_input: item.content,
      parsed_output: item,
      was_confirmed: true,
      final_output: item,
      source: "gpt4o",
      intent_detected: item.type,
      confidence_score: 0.9,
    });

    return NextResponse.json({ saved: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
