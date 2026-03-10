import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import OpenAI from "openai";

const EXTRACT_PROMPT = `You are an extraction engine for a personal OS.
Extract ALL actionable items from the entrepreneur's message.
Return ONLY a valid JSON array. Empty array [] if nothing to extract.

STEP 1 — CLASSIFY TYPE (check in this exact order, stop at first match):
1. Contains "add task" / "create task" / "task to" / "task:" / "todo:" / "to-do" → "task"
2. Contains "blocked on" / "waiting on" / "stuck on" / "can't proceed" → "blocker"
3. Contains "need to decide" / "deciding between" / "should I" + options → "decision"
4. Contains "I should always/never" / "rule:" / "from now on" → "rule"
5. Contains "slept" / "feeling" / "mood is" / "stress level" → "daily_check"
6. Anything else about work or projects → "project_update"

STEP 2 — BUILD JSON using the matching shape:

task: {"type":"task","project":"project name or null","content":"task title","due_date":"YYYY-MM-DD or null","priority":2}
project_update: {"type":"project_update","project":"name","content":"what was done","update_type":"progress","next_actions":"next steps or null"}
blocker: {"type":"blocker","project":"name","content":"what is blocked","next_actions":"null"}
decision: {"type":"decision","project":"name or null","content":"what to decide","verdict":"open","probability":null}
rule: {"type":"rule","content":"the rule text","domain":"trading or business or behavior"}
daily_check: {"type":"daily_check","mood":"calm|focused|rushed|bored|anxious|fearful|angry|frustrated|overconfident|exhausted","stress":5,"sleep_hours":7,"confidence":7,"impulse":3}

RULES:
- A message saying "add task to X" → type is ALWAYS "task"
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
    const items = JSON.parse(clean);
    return NextResponse.json({ items: Array.isArray(items) ? items : [] });
  } catch (err: any) {
    return NextResponse.json({ items: [] });
  }
}
