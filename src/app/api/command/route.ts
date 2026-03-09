import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { detectIntent } from "@/lib/command-parser/detectIntent";
import { parseCommand } from "@/lib/command-parser/parsers";
import { parseWithAI } from "@/lib/command-parser/aiSlot";

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        },
      },
    }
  );

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json();

  // If parsed already provided by client (confirmed preview), skip parsing
  let { parsed, projectId, raw_input } = body;

  // If this is a parse-only request (no confirmed parsed), run parser
  if (!parsed && raw_input) {
    const intent = detectIntent(raw_input);
    parsed = parseCommand(raw_input, intent);
    let source: "rule_parser" | "claude" | "unknown" = "rule_parser";

    // Fallback to AI if rule parser returns unknown
    if (parsed.intent === "unknown") {
      try {
        parsed = await parseWithAI(raw_input);
        source = parsed.intent !== "unknown" ? "claude" : "unknown";
      } catch (err) {
        console.error("AI slot error:", err);
        source = "unknown";
      }
    }
    // Return parsed result without saving (parse-only mode)
    return NextResponse.json({ parsed, source });
  }

  // Save confirmed parsed command
  try {
    if (parsed.intent === "create_project") {
      const { error } = await supabase.from("projects").insert({
        user_id: userId, name: parsed.name, description: parsed.description, status: "active",
      });
      if (error) throw error;
    }
    else if (parsed.intent === "project_update") {
      if (!projectId) return NextResponse.json({ error: "project_id required" }, { status: 400 });
      const { error } = await supabase.from("project_updates").insert({
        user_id: userId, project_id: projectId, update_type: parsed.update_type,
        content: parsed.content, next_actions: parsed.next_actions,
      });
      if (error) throw error;
    }
    else if (parsed.intent === "decision") {
      const { error } = await supabase.from("decisions").insert({
        user_id: userId, project_id: projectId || null, context: parsed.context,
        probability: parsed.probability, verdict: parsed.verdict, domain: "general",
      });
      if (error) throw error;
    }
    else if (parsed.intent === "rule") {
      const { error } = await supabase.from("rules").insert({
        user_id: userId, project_id: projectId || null, rule_text: parsed.rule_text,
        domain: parsed.domain, severity: 2, active: true,
      });
      if (error) throw error;
    }

    // Log to training_logs
    await supabase.from("training_logs").insert({
      user_id: userId,
      raw_input: raw_input,
      parsed_output: parsed,
      was_confirmed: true,
      final_output: parsed,
      source: body.source ?? "rule_parser",
      intent_detected: parsed.intent,
      confidence_score: parsed.intent !== "unknown" ? 0.92 : 0.2,
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
