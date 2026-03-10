import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll(s) { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { messages } = await req.json();

  const [
    { data: projects }, { data: updates }, { data: decisions },
    { data: rules }, { data: logs }, { data: recentSessions }
  ] = await Promise.all([
    supabase.from("projects").select("id, name, description, status").eq("user_id", user.id).eq("status", "active"),
    supabase.from("project_updates").select("content, next_actions, update_type, created_at, project_id").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
    supabase.from("decisions").select("context, verdict, probability, outcome_rating, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10),
    supabase.from("rules").select("rule_text, severity, active").eq("user_id", user.id).eq("active", true),
    supabase.from("behavior_logs").select("mood_tag, stress, sleep_hours, notes, timestamp").eq("user_id", user.id).order("timestamp", { ascending: false }).limit(7),
    supabase.from("ai_sessions").select("messages, updated_at").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(3),
  ]);

  const projectMap: Record<string, string> = {};
  (projects ?? []).forEach(p => { projectMap[p.id] = p.name; });

  const sessionHistory = (recentSessions ?? [])
    .flatMap((s: any) => (s.messages ?? []).slice(-4))
    .slice(-12)
    .map((m: any) => `[${m.role}]: ${m.content}`)
    .join("\n");

  const contextBlock = `
ACTIVE PROJECTS:
${(projects ?? []).map(p => `- ${p.name}: ${p.description ?? "no description"}`).join("\n")}

RECENT UPDATES:
${(updates ?? []).map(u => `- [${projectMap[u.project_id] ?? "unknown"}] ${u.update_type}: ${u.content}${u.next_actions ? ` → next: ${u.next_actions}` : ""}`).join("\n")}

DECISIONS:
${(decisions ?? []).map(d => `- ${d.verdict?.toUpperCase() ?? "?"} (${d.probability ?? "?"}%) [outcome: ${d.outcome_rating ?? "open"}]: ${d.context}`).join("\n")}

ACTIVE RULES:
${(rules ?? []).map(r => `- [severity ${r.severity}] ${r.rule_text}`).join("\n")}

BEHAVIOR (last 7 days):
${(logs ?? []).map(l => `- mood: ${l.mood_tag ?? "?"}, stress: ${l.stress ?? "?"}/10, sleep: ${l.sleep_hours ?? "?"}h`).join("\n")}

${sessionHistory ? `RECENT CONVERSATION HISTORY:\n${sessionHistory}` : ""}`.trim();

  const systemPrompt = `You are the AI core of Buddies OS — a personal operating system for an entrepreneur named Soban.

PHILOSOPHY:
Capture → Understand → Analyze → Suggest → Human decides.
You are an advisor, not a governor. Surface intelligence, let the human decide.

RESPONSE RULES:
- Answer factual questions directly and concisely
- When you detect a pattern: "Observation: [what data shows]. [supporting data]. You decide."
- Never say "you should" — say "the data suggests" or "worth considering"
- Use markdown — bold key terms, bullets for lists
- Keep responses tight. No padding. No flattery.
- For live data questions (prices, news, current events) — use web search automatically

CURRENT CONTEXT:
${contextBlock}`;

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Use Responses API which natively supports web_search_preview
    const response = await (openai as any).responses.create({
      model: "gpt-4o-mini",
      tools: [{ type: "web_search_preview" }],
      input: [
        { role: "system", content: systemPrompt },
        ...messages.map((m: any) => ({ role: m.role, content: m.content })),
      ],
    });

    // Extract text from response output
    const text = response.output
      ?.filter((o: any) => o.type === "message")
      ?.flatMap((o: any) => o.content ?? [])
      ?.filter((c: any) => c.type === "output_text")
      ?.map((c: any) => c.text)
      ?.join("") ?? "No response.";

    return NextResponse.json({ text, provider: "openai" });
  } catch (err: any) {
    // Fallback to standard chat completions without web search
    try {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 1024,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
      });
      const text = response.choices[0]?.message?.content ?? "No response.";
      return NextResponse.json({ text, provider: "openai-fallback" });
    } catch (fallbackErr: any) {
      return NextResponse.json({ text: `Error: ${fallbackErr.message}` });
    }
  }
}
