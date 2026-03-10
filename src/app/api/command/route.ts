import { createClient } from "@/lib/supabase/client";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json();
  const { parsed, projectId } = body;

  try {
    if (parsed.intent === "create_project") {
      const { error } = await supabase.from("projects").insert({
        user_id: userId,
        name: parsed.name,
        description: parsed.description,
        status: "active",
      });
      if (error) throw error;
    }

    else if (parsed.intent === "project_update") {
      if (!projectId) return NextResponse.json({ error: "project_id required" }, { status: 400 });
      const { error } = await supabase.from("project_updates").insert({
        user_id: userId,
        project_id: projectId,
        update_type: parsed.update_type,
        content: parsed.content,
        next_actions: parsed.next_actions,
      });
      if (error) throw error;
    }

    else if (parsed.intent === "decision") {
      const { error } = await supabase.from("decisions").insert({
        user_id: userId,
        project_id: projectId || null,
        context: parsed.context,
        probability: parsed.probability,
        verdict: parsed.verdict,
        domain: "general",
      });
      if (error) throw error;
    }

    else if (parsed.intent === "rule") {
      const { error } = await supabase.from("rules").insert({
        user_id: userId,
        project_id: projectId || null,
        rule_text: parsed.rule_text,
        domain: parsed.domain,
        severity: 2,
        active: true,
      });
      if (error) throw error;
    }

    // Log to training_logs
    await supabase.from("training_logs").insert({
      user_id: userId,
      raw_input: body.raw_input,
      parsed_output: parsed,
      was_confirmed: true,
      final_output: parsed,
      source: "rule_parser",
      intent_detected: parsed.intent,
      confidence_score: parsed.intent !== "unknown" ? 0.85 : 0.2,
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
