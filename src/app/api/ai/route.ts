import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll(s) { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await req.json();
  // Support both old format { messages } and new format { message, history }
  const messages = body.messages ?? [...(body.history ?? []), { role: "user", content: body.message }];
  const lastMessage = messages[messages.length - 1]?.content ?? "";
  const contextEnabled = body.contextEnabled !== false;

  const [  
    { data: projects }, { data: updates }, { data: decisions },
    { data: rules }, { data: logs }, { data: recentSessions }
  ] = contextEnabled ? await Promise.all([
    supabase.from("projects").select("id, name, description, status, memory").eq("user_id", user.id).eq("status", "active"),
    supabase.from("project_updates").select("content, next_actions, update_type, created_at, project_id").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
    supabase.from("decisions").select("context, verdict, probability, outcome_rating, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10),
    supabase.from("rules").select("rule_text, severity, active").eq("user_id", user.id).eq("active", true),
    supabase.from("behavior_logs").select("mood_tag, stress, sleep_hours, notes, timestamp").eq("user_id", user.id).order("timestamp", { ascending: false }).limit(7),
    supabase.from("ai_sessions").select("messages, updated_at").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(3),
  ]) : [
    { data: null }, { data: null }, { data: null },
    { data: null }, { data: null }, { data: null },
  ];

  // Fetch client context for owner
  const clientContextBlock = contextEnabled ? await (async () => {
    try {
      const { data: ws } = await supabase.from("workspaces").select("id").eq("owner_id", user.id).maybeSingle();
      if (!ws) return "";
      const { data: clients } = await supabase.from("clients").select("id, name, status").eq("workspace_id", ws.id).eq("status", "active");
      if (!clients?.length) return "";
      const summaries = await Promise.all(clients.map(async (c: any) => {
        const { data: stages } = await supabase.from("client_stages").select("stage_name, status, department").eq("client_id", c.id);
        const done = stages?.filter((s: any) => s.status === "done").length ?? 0;
        const inProgress = stages?.filter((s: any) => s.status === "in_progress") ?? [];
        return `${c.name}: ${done}/${stages?.length ?? 14} stages done${inProgress.length > 0 ? ". In progress: " + inProgress.map((s: any) => s.stage_name).join(", ") : ""}`;
      }));
      return "\nACTIVE CLIENTS:\n" + summaries.join("\n");
    } catch { return ""; }
  })() : "";

  // Fetch team context (owner sees all depts, team member sees own dept)
  const teamContextBlock = contextEnabled ? await (async () => {
    try {
      const { data: ws } = await supabase.from("workspaces").select("id").eq("owner_id", user.id).maybeSingle();
      if (!ws) return "";
      const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      const [{ data: depts }, { data: teamTasks }, { data: teamActivity }] = await Promise.all([
        supabase.from("departments").select("id, name, slug").eq("workspace_id", ws.id),
        supabase.from("project_tasks").select("title, status, department_id").neq("status", "cancelled").limit(20),
        supabase.from("department_activity").select("title, activity_type, created_at, department_id").gte("created_at", since).order("created_at", { ascending: false }).limit(30),
      ]);
      const deptMap: Record<string, string> = {};
      (depts ?? []).forEach((d: any) => { deptMap[d.id] = d.name; });
      if (!teamTasks?.length && !teamActivity?.length) return "";
      return `TEAM ACTIVITY (last 48hrs):\n${(teamActivity ?? []).map((a: any) => `- [${deptMap[a.department_id] ?? "?"}] ${a.activity_type}: ${a.title}`).join("\n") || "none"}\nTEAM TASKS:\n${(teamTasks ?? []).map((t: any) => `- [${deptMap[t.department_id] ?? "?"}] ${t.status}: ${t.title}`).join("\n") || "none"}`;
    } catch { return ""; }
  })() : "";

  const projectMap: Record<string, string> = {};
  const projectMemory: Record<string, string> = {};
  (projects ?? []).forEach(p => {
    projectMap[(p as any).id] = (p as any).name;
    if ((p as any).memory) projectMemory[(p as any).name] = (p as any).memory;
  });

  const sessionHistory = (recentSessions ?? [])
    .flatMap((s: any) => (s.messages ?? []).slice(-4))
    .slice(-12)
    .map((m: any) => `[${m.role}]: ${m.content}`)
    .join("\n");

  const projectNames = (projects ?? []).map(p => p.name);

  const contextBlock = `
ACTIVE PROJECTS: ${projectNames.join(", ") || "none"}

RECENT UPDATES:
${(updates ?? []).map(u => `- [${projectMap[u.project_id] ?? "unknown"}] ${u.update_type}: ${u.content}`).join("\n")}

DECISIONS:
${(decisions ?? []).map(d => `- ${d.verdict?.toUpperCase() ?? "?"} (${d.probability ?? "?"}%) [outcome: ${d.outcome_rating ?? "open"}]: ${d.context}`).join("\n")}

ACTIVE RULES:
${(rules ?? []).map(r => `- [severity ${r.severity}] ${r.rule_text}`).join("\n")}

BEHAVIOR (last 7 days):
${(logs ?? []).map(l => `- mood: ${l.mood_tag ?? "?"}, stress: ${l.stress ?? "?"}/10, sleep: ${l.sleep_hours ?? "?"}h`).join("\n")}

${sessionHistory ? `RECENT CONVERSATION HISTORY:\n${sessionHistory}` : ""}`.trim();

  const systemPrompt = contextEnabled
    ? `You are the AI core of Buddies OS — a personal operating system for an entrepreneur named Soban.

PHILOSOPHY: Capture → Understand → Analyze → Suggest → Human decides.
You are an advisor, not a governor. Surface intelligence, let the human decide.

Respond naturally in markdown. Never output JSON or structured data.

RESPONSE RULES:
- Factual questions: answer directly
- Patterns detected: "Observation: [what data shows]. [supporting data]. You decide."
- Never say "you should" — say "the data suggests" or "worth considering"
- Use markdown — bold key terms, bullets for lists
- Tight responses. No padding. No flattery.
- For live data (prices, news, events) — use web search

CURRENT CONTEXT:
${contextBlock}${clientContextBlock ? `\n\nCLIENT STATUS:${clientContextBlock}` : ""}${teamContextBlock ? `\n\nTEAM CONTEXT:\n${teamContextBlock}` : ""}`
    : `You are the AI core of Buddies OS — a personal operating system for an entrepreneur named Soban.

PHILOSOPHY: Capture → Understand → Analyze → Suggest → Human decides.
You are an advisor, not a governor. Surface intelligence, let the human decide.

Respond naturally in markdown. Never output JSON or structured data.

RESPONSE RULES:
- Factual questions: answer directly
- Patterns detected: "Observation: [what data shows]. [supporting data]. You decide."
- Never say "you should" — say "the data suggests" or "worth considering"
- Use markdown — bold key terms, bullets for lists
- Tight responses. No padding. No flattery.
- For live data (prices, news, events) — use web search

Note: Context mode is OFF. Respond based on this conversation only.`;

  try {
    // ── PRIMARY: Claude ──────────────────────────────────────────
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-5",
          max_tokens: 16000,
          system: systemPrompt,
          messages: messages.map((m: any) => ({ role: m.role, content: m.content })),
        });
        const text = response.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("") || "No response.";
        return NextResponse.json({ response: text, text, provider: "claude", contextUsed: contextEnabled });
      } catch (claudeErr: any) {
        console.error("Claude error, falling back to OpenAI:", claudeErr.message);
      }
    }

    // ── FALLBACK: OpenAI ─────────────────────────────────────────
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Try Responses API with web search first
    try {
      const response = await (openai as any).responses.create({
        model: "gpt-4o-mini",
        tools: [{ type: "web_search_preview" }],
        input: [
          { role: "system", content: systemPrompt },
          ...messages.map((m: any) => ({ role: m.role, content: m.content })),
        ],
      });

      const text = response.output
        ?.filter((o: any) => o.type === "message")
        ?.flatMap((o: any) => o.content ?? [])
        ?.filter((c: any) => c.type === "output_text")
        ?.map((c: any) => c.text)
        ?.join("") ?? "";

      return NextResponse.json({ response: text, text, provider: "openai", contextUsed: contextEnabled });
    } catch {
      // Fallback to chat completions
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 16000,
        messages: [{ role: "system", content: systemPrompt }, ...messages],
      });
      const text = response.choices[0]?.message?.content ?? "No response.";
      return NextResponse.json({ response: text, text, provider: "openai-fallback", contextUsed: contextEnabled });
    }
  } catch (err: any) {
    return NextResponse.json({ text: `Error: ${err.message}` });
  }
}
