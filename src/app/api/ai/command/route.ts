import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { detectIntent } from "@/lib/command-parser/detectIntent";
import { parseCommand } from "@/lib/command-parser/parsers";

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll(s: any[]) { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { message } = await req.json();
  if (!message) return NextResponse.json({ isCommand: false });

  const text = (message as string).trim();
  const lower = text.toLowerCase();

  // ── Fast-path: explicit quick-action prefixes ─────────────────────────────

  // log mood [mood] stress [0-10] sleep [hours]
  if (/^log\s+mood\b/i.test(text)) {
    const moodMatch = text.match(/mood\s+(\w+)/i);
    const stressMatch = text.match(/stress\s+(\d+)/i);
    const sleepMatch = text.match(/sleep\s+(\d+(?:\.\d+)?)/i);
    const notesMatch = text.match(/notes?\s+(.+)$/i);

    const mood_tag = moodMatch ? moodMatch[1].toLowerCase() : null;
    const stress = stressMatch ? Math.min(10, parseInt(stressMatch[1])) : null;
    const sleep_hours = sleepMatch ? parseFloat(sleepMatch[1]) : null;
    const notes = notesMatch ? notesMatch[1] : null;

    if (!mood_tag && stress === null && sleep_hours === null) {
      return NextResponse.json({ isCommand: false });
    }

    const { error } = await supabase.from("behavior_logs").insert({
      user_id: user.id,
      mood_tag,
      stress,
      sleep_hours,
      notes,
      timestamp: new Date().toISOString(),
    });

    if (error) return NextResponse.json({ isCommand: true, response: `❌ Error saving: ${error.message}` });

    const parts = [
      mood_tag && `mood: ${mood_tag}`,
      stress !== null && `stress: ${stress}/10`,
      sleep_hours !== null && `sleep: ${sleep_hours}h`,
    ].filter(Boolean).join(", ");

    return NextResponse.json({ isCommand: true, response: `✅ Logged — ${parts}` });
  }

  // decision [GO|NO-GO|WAIT] [text] [confidence%]
  if (/^decision\s+(go|no-?go|wait)\b/i.test(text)) {
    const verdictMatch = text.match(/^decision\s+(go|no-?go|wait)\b/i);
    const verdict = (verdictMatch![1] ?? "wait").toUpperCase().replace("NOGO", "NO-GO");
    const confidenceMatch = text.match(/(\d+)%/);
    const probability = confidenceMatch ? parseInt(confidenceMatch[1]) : null;

    let context = text
      .replace(/^decision\s+(go|no-?go|wait)\s*/i, "")
      .replace(/\d+%/, "")
      .trim();

    // Try to resolve a project
    const { data: projects } = await supabase.from("projects").select("id, name").eq("user_id", user.id).eq("status", "active");
    let projectId: string | null = null;
    for (const p of projects ?? []) {
      if (context.toLowerCase().includes(p.name.toLowerCase())) {
        projectId = p.id;
        break;
      }
    }

    const { error } = await supabase.from("decisions").insert({
      user_id: user.id,
      project_id: projectId,
      context: context || text,
      verdict,
      probability,
      domain: "general",
    });

    if (error) return NextResponse.json({ isCommand: true, response: `❌ Error saving: ${error.message}` });

    return NextResponse.json({
      isCommand: true,
      response: `${verdict === "GO" ? "✅" : verdict === "NO-GO" ? "🚫" : "⏳"} Decision logged — **${verdict}**${probability ? ` (${probability}% confidence)` : ""}: "${context}"`,
    });
  }

  // blocker [text]
  if (/^blocker\s+/i.test(text)) {
    let content = text.replace(/^blocker\s+/i, "").trim();
    if (!content) return NextResponse.json({ isCommand: false });

    const { data: projects } = await supabase.from("projects").select("id, name").eq("user_id", user.id).eq("status", "active");
    let projectId: string | null = null;
    for (const p of projects ?? []) {
      if (content.toLowerCase().includes(p.name.toLowerCase())) {
        projectId = p.id;
        break;
      }
    }

    const { error } = await supabase.from("project_updates").insert({
      user_id: user.id,
      project_id: projectId,
      update_type: "blocker",
      content,
    });

    if (error) return NextResponse.json({ isCommand: true, response: `❌ Error saving: ${error.message}` });

    return NextResponse.json({ isCommand: true, response: `🚧 Blocker logged: "${content}"` });
  }

  // task [text]
  if (/^task\s+/i.test(text)) {
    let title = text.replace(/^task\s+/i, "").trim();
    if (!title) return NextResponse.json({ isCommand: false });

    const { data: projects } = await supabase.from("projects").select("id, name").eq("user_id", user.id).eq("status", "active");
    let projectId: string | null = null;
    for (const p of projects ?? []) {
      if (title.toLowerCase().includes(p.name.toLowerCase())) {
        projectId = p.id;
        break;
      }
    }

    if (!projectId) return NextResponse.json({
      isCommand: true,
      response: `⚠️ No matching project found. Use the Projects page to add this task, or include the project name.`,
    });

    const { error } = await supabase.from("project_tasks").insert({
      user_id: user.id,
      project_id: projectId,
      title,
      status: "todo",
      priority: 2,
    });

    if (error) return NextResponse.json({ isCommand: true, response: `❌ Error saving: ${error.message}` });

    return NextResponse.json({ isCommand: true, response: `✅ Task created: "${title}"` });
  }

  // rule [text]
  if (/^rule\s+/i.test(text)) {
    const severityMatch = text.match(/severity\s+([1-3])/i);
    const severity = severityMatch ? parseInt(severityMatch[1]) : 2;
    const rule_text = text
      .replace(/^rule\s+/i, "")
      .replace(/severity\s+[1-3]/i, "")
      .trim();

    if (!rule_text) return NextResponse.json({ isCommand: false });

    const { error } = await supabase.from("rules").insert({
      user_id: user.id,
      rule_text,
      severity,
      active: true,
      domain: "general",
    });

    if (error) return NextResponse.json({ isCommand: true, response: `❌ Error saving: ${error.message}` });

    return NextResponse.json({ isCommand: true, response: `📋 Rule saved (severity ${severity}): "${rule_text}"` });
  }

  // update [project]: [content]
  if (/^update\s+/i.test(text)) {
    const intent = detectIntent(text);
    if (intent === "project_update") {
      const parsed = parseCommand(text, "project_update");
      if (parsed.intent !== "project_update") return NextResponse.json({ isCommand: false });

      let projectId: string | null = null;
      if (parsed.project) {
        const { data: projects } = await supabase.from("projects").select("id, name").eq("user_id", user.id).eq("status", "active");
        for (const p of projects ?? []) {
          if (p.name.toLowerCase().includes(parsed.project.toLowerCase()) || parsed.project.toLowerCase().includes(p.name.toLowerCase())) {
            projectId = p.id;
            break;
          }
        }
      }

      if (!projectId) return NextResponse.json({
        isCommand: true,
        response: `⚠️ Project "${parsed.project}" not found. Check the project name and try again.`,
      });

      const { error } = await supabase.from("project_updates").insert({
        user_id: user.id,
        project_id: projectId,
        update_type: parsed.update_type,
        content: parsed.content,
        next_actions: parsed.next_actions ?? null,
      });

      if (error) return NextResponse.json({ isCommand: true, response: `❌ Error saving: ${error.message}` });

      return NextResponse.json({
        isCommand: true,
        response: `📈 Update logged for **${parsed.project}** (${parsed.update_type}): "${parsed.content}"${parsed.next_actions ? `\nNext: ${parsed.next_actions}` : ""}`,
      });
    }
  }

  // Not a recognised command
  return NextResponse.json({ isCommand: false });
}
