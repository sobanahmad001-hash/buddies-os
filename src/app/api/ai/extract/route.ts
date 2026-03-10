import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import OpenAI from "openai";

const EXTRACT_PROMPT = `You are an extraction engine for a personal OS.
Extract ALL actionable items from the entrepreneur's message.

Return ONLY a valid JSON array. Empty array [] if nothing to extract.

IMPORTANT TYPE RULES:
- "blocked on X" / "waiting on X" / "stuck on X" → type MUST be "blocker" not "project_update"
- "need to decide X" / "deciding between X and Y" → type is "decision"  
- "I should always/never X" / "rule: X" → type is "rule"
- "slept X hours" / "feeling X" / "mood is X" → type is "daily_check"
- "add task" / "create task" / "task to" / "task:" / "todo:" → type MUST be "task", NEVER "project_update"
- Everything else about work progress → type is "project_update"
- For decisions: only set probability if explicitly stated as a number. Otherwise leave null.
- For daily_check mood: ONLY use these exact values: calm, focused, rushed, bored, anxious, fearful, angry, frustrated, overconfident, exhausted

Shapes:

{"type":"project_update","project":"name","content":"what was done","update_type":"progress","next_actions":"next steps or null"}
{"type":"task","project":"project name or null","content":"task title","due_date":"YYYY-MM-DD or null","priority":2}
{"type":"blocker","project":"name","content":"what is blocked","next_actions":"null"}
{"type":"decision","project":"name or null","content":"decision summary","context":"full context","verdict":null,"probability":null}
{"type":"rule","content":"rule statement","rule_text":"rule as imperative statement","severity":2}
{"type":"daily_check","mood":"exact value from list or null","sleep_hours":number or null,"stress":null,"notes":"context"}`;

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
