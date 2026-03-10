import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll(s: any[]) { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { projectId } = await req.json();
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  // Load project + all its data
  const [{ data: project }, { data: updates }, { data: decisions }, { data: rules }] = await Promise.all([
    supabase.from("projects").select("name, description, memory").eq("id", projectId).eq("user_id", user.id).single(),
    supabase.from("project_updates").select("content, update_type, next_actions, created_at").eq("project_id", projectId).eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
    supabase.from("decisions").select("context, verdict, outcome_rating, actual_outcome, created_at").eq("project_id", projectId).eq("user_id", user.id).order("created_at", { ascending: false }).limit(10),
    supabase.from("rules").select("rule_text, severity").eq("project_id", projectId).eq("user_id", user.id).eq("active", true),
  ]);

  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const dataBlock = `
PROJECT: ${project.name}
DESCRIPTION: ${project.description ?? "none"}
EXISTING MEMORY: ${project.memory ?? "none"}

UPDATES (${updates?.length ?? 0} total, most recent first):
${(updates ?? []).map(u => `- [${u.update_type}] ${u.content}${u.next_actions ? " → next: " + u.next_actions : ""}`).join("\n")}

DECISIONS:
${(decisions ?? []).map(d => `- ${d.verdict} [${d.outcome_rating ?? "open"}]: ${d.context}${d.actual_outcome ? " → outcome: " + d.actual_outcome : ""}`).join("\n")}

RULES:
${(rules ?? []).map(r => `- [${r.severity}] ${r.rule_text}`).join("\n")}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 500,
    messages: [
      {
        role: "system",
        content: `Generate a concise living memory summary for a project. This will be injected as context for every AI conversation about this project.

Format exactly like this:
Goal: [what this project is trying to achieve]
Status: [active/stalled/blocked/progressing]
Current focus: [what is being worked on right now]
Recent progress: [last 2-3 meaningful updates]
Open decisions: [any unresolved decisions]
Blockers: [current blockers if any]
Rules: [key rules if any]
Next actions: [what needs to happen next]

Be specific. Use data from the updates. Keep each section to 1-2 lines max.`
      },
      { role: "user", content: dataBlock }
    ],
  });

  const memory = response.choices[0]?.message?.content ?? "";

  await supabase.from("projects").update({
    memory,
    memory_updated_at: new Date().toISOString(),
  }).eq("id", projectId).eq("user_id", user.id);

  return NextResponse.json({ memory });
}
