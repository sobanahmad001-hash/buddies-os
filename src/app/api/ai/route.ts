import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const AI_PROVIDER = process.env.AI_PROVIDER ?? "openai"; // switch to "anthropic" when ready

async function callAI(systemPrompt: string, messages: {role: string; content: string}[]) {
  if (AI_PROVIDER === "anthropic") {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 1024, system: systemPrompt, messages }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message ?? "Anthropic error");
    return data.content?.[0]?.text ?? "No response.";
  } else {
    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 1024,
      messages: [{ role: "system", content: systemPrompt }, ...messages] as any,
    });
    return response.choices[0]?.message?.content ?? "No response.";
  }
}

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

  const [{ data: projects }, { data: updates }, { data: decisions }, { data: rules }, { data: logs }] = await Promise.all([
    supabase.from("projects").select("id, name, description, status").eq("user_id", user.id).eq("status", "active"),
    supabase.from("project_updates").select("content, next_actions, update_type, created_at, project_id").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
    supabase.from("decisions").select("context, verdict, probability, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10),
    supabase.from("rules").select("rule_text, severity, active").eq("user_id", user.id).eq("active", true),
    supabase.from("behavior_logs").select("mood_tag, stress, sleep_hours, notes, timestamp").eq("user_id", user.id).order("timestamp", { ascending: false }).limit(7),
  ]);

  const projectMap: Record<string, string> = {};
  (projects ?? []).forEach(p => { projectMap[p.id] = p.name; });

  const contextBlock = `
ACTIVE PROJECTS:
${(projects ?? []).map(p => `- ${p.name}: ${p.description ?? "no description"}`).join("\n")}

RECENT UPDATES (last 20):
${(updates ?? []).map(u => `- [${projectMap[u.project_id] ?? "unknown"}] ${u.update_type}: ${u.content}${u.next_actions ? ` → next: ${u.next_actions}` : ""}`).join("\n")}

DECISIONS (last 10):
${(decisions ?? []).map(d => `- ${d.verdict?.toUpperCase() ?? "?"} (${d.probability ?? "?"}%): ${d.context}`).join("\n")}

ACTIVE RULES:
${(rules ?? []).map(r => `- [severity ${r.severity}] ${r.rule_text}`).join("\n")}

RECENT BEHAVIOR LOGS:
${(logs ?? []).map(l => `- mood: ${l.mood_tag ?? "?"}, stress: ${l.stress ?? "?"}, sleep: ${l.sleep_hours ?? "?"}h — ${l.notes ?? ""}`).join("\n")}
`.trim();

  const systemPrompt = `You are the AI core of Buddies OS — a personal operating system for an entrepreneur.
You have full context of the user's work, decisions, rules, and behavior patterns.
Be direct, blunt, systems-thinking. No pleasantries. No flattery. Push back when warranted.
Answer questions about their work, identify patterns, flag risks, surface what they're missing.
Keep answers concise but complete. Use bullet points only when listing multiple items.

CURRENT CONTEXT:
${contextBlock}`;

  try {
    const text = await callAI(systemPrompt, messages);
    return NextResponse.json({ text, provider: AI_PROVIDER });
  } catch (err: any) {
    return NextResponse.json({ text: `Error: ${err.message}` });
  }
}
