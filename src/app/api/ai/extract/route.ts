import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import OpenAI from "openai";

const EXTRACT_PROMPT = `You are an extraction engine for a personal OS.
Extract ALL actionable items from the entrepreneur's message.
Return ONLY a valid JSON array. Empty array [] if nothing to extract.

STEP 1 — CLASSIFY TYPE (check in this exact order, stop at first match):
1. The word "task" appears ANYWHERE in the message → "task"
2. Contains "todo:" / "to-do" / "remind me" → "task"
3. Contains "blocked on" / "waiting on" / "stuck on" / "can't proceed" → "blocker"
4. Contains "need to decide" / "deciding between" / "should I" + options → "decision"
5. Contains "I should always/never" / "rule:" / "from now on" → "rule"
6. Contains "slept" / "feeling" / "mood is" / "stress level" → "daily_check"
7. Anything else about work or projects → "project_update"

STEP 2 — BUILD JSON using the matching shape:

task: {"type":"task","project":"project name or null","content":"task title","due_date":"YYYY-MM-DD or null","priority":2}
project_update: {"type":"project_update","project":"name","content":"what was done","update_type":"progress","next_actions":"next steps or null"}
blocker: {"type":"blocker","project":"name","content":"what is blocked","next_actions":"null"}
decision: {"type":"decision","project":"name or null","content":"what to decide","verdict":"open","probability":null}
rule: {"type":"rule","content":"the rule text","domain":"trading or business or behavior"}
daily_check: {"type":"daily_check","mood":"calm|focused|rushed|bored|anxious|fearful|angry|frustrated|overconfident|exhausted","stress":5,"sleep_hours":7,"confidence":7,"impulse":3}

RULES:
- If the word "task" appears anywhere → type is ALWAYS "task", never "project_update"
- Extract due_date from phrases like "8 am 11 march" → "2026-03-11", "tomorrow" → next day, "friday" → next friday
- Extract exact time mentions into due_date as full ISO date (e.g. "8 am 11 march" → "2026-03-11T08:00:00")
- Extract project name from "in X" / "for X" / "on X project"
- A message about adding/creating/setting up a project → type is "new_project" with content as name
- For daily_check mood use ONLY the exact values listed above
- Return ONLY valid JSON array, nothing else
\``;

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll(s) { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ items: [] });

  const { message } = await req.json();
  if (!message?.trim()) return NextResponse.json({ items: [] });

  // Deterministic pre-classification — never trust LLM for this
  const lower = message.toLowerCase();
  const forceTask = /\btask\b/.test(lower);
  const forceBlocker = !forceTask && /(blocked on|waiting on|stuck on|can't proceed)/.test(lower);

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", max_tokens: 800,
      messages: [
        { role: "system", content: EXTRACT_PROMPT },
        { role: "user", content: message }
      ],
    });
    const text = response.choices[0]?.message?.content ?? "[]";
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    const items = Array.isArray(parsed) ? parsed : [];

    // Override: if message contains "task", force type to "task" on any project_update items
    const corrected = items.map((item: any) => {
      if (forceTask && item.type !== "task") return { ...item, type: "task" };
      if (forceBlocker && item.type === "project_update") return { ...item, type: "blocker" };
      return item;
    });

    return NextResponse.json({ items: corrected });
  } catch (err: any) {
    return NextResponse.json({ items: [] });
  }
}
