import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const AI_PROVIDER = process.env.AI_PROVIDER ?? "openai";

async function callAI(prompt: string) {
  if (AI_PROVIDER === "anthropic") {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 1024, messages: [{ role: "user", content: prompt }] }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message ?? "Anthropic error");
    return data.content?.[0]?.text ?? "No response.";
  } else {
    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
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

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: projects }, { data: updates }, { data: decisions }, { data: rules }, { data: violations }] = await Promise.all([
    supabase.from("projects").select("id, name, status").eq("user_id", user.id),
    supabase.from("project_updates").select("content, update_type, next_actions, created_at, project_id").eq("user_id", user.id).gte("created_at", sevenDaysAgo).order("created_at", { ascending: false }),
    supabase.from("decisions").select("context, verdict, probability, created_at").eq("user_id", user.id).gte("created_at", sevenDaysAgo),
    supabase.from("rules").select("rule_text, severity").eq("user_id", user.id).eq("active", true),
    supabase.from("rule_violations").select("notes, timestamp, rule_id").eq("user_id", user.id).gte("timestamp", sevenDaysAgo),
  ]);

  const projectMap: Record<string, string> = {};
  (projects ?? []).forEach(p => { projectMap[p.id] = p.name; });

  const prompt = `Generate a weekly digest for an entrepreneur. Be direct and sharp. No fluff.

PROJECTS: ${(projects ?? []).map(p => p.name).join(", ")}

UPDATES THIS WEEK (${(updates ?? []).length} total):
${(updates ?? []).map(u => `- [${projectMap[u.project_id] ?? "?"}] ${u.update_type}: ${u.content}`).join("\n")}

DECISIONS THIS WEEK:
${(decisions ?? []).map(d => `- ${d.verdict}: ${d.context}`).join("\n")}

ACTIVE RULES:
${(rules ?? []).map(r => r.rule_text).join("\n")}

RULE VIOLATIONS THIS WEEK:
${(violations ?? []).length > 0 ? (violations ?? []).map(v => v.notes).join("\n") : "None logged"}

Write a weekly digest with these sections:
1. MOMENTUM — what moved, what shipped
2. STALLED — what had no updates (be direct)
3. DECISIONS — quick summary of what was decided
4. WATCH — rules at risk based on pattern of work
5. NEXT WEEK — 3 specific things to focus on

Keep it under 400 words. Blunt advisor, not a cheerleader.`;

  try {
    const summary = await callAI(prompt);
    return NextResponse.json({ summary });
  } catch (err: any) {
    return NextResponse.json({ summary: `Error: ${err.message}` });
  }
}
