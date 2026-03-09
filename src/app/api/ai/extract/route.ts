import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const EXTRACT_PROMPT = `You are an extraction engine for a personal OS. 
Given a message from an entrepreneur, extract ALL actionable items.

Return ONLY a valid JSON array (no markdown, no explanation). Empty array [] if nothing to extract.

Each item must match one of these shapes:

Project Update:
{"type":"project_update","project":"project name","content":"what was done/is happening","update_type":"progress|blocker|note|decision","next_actions":"next steps if mentioned"}

Decision:
{"type":"decision","project":"project name or null","content":"what the decision is about","context":"full context","verdict":"enter|wait|do_not_enter|null","probability":0-100 or null}

Rule:
{"type":"rule","content":"the rule as a clear statement","rule_text":"the rule","severity":1-3}

Daily Check:
{"type":"daily_check","mood":"one of: calm,focused,rushed,bored,anxious,fearful,angry,frustrated,overconfident,exhausted or null","sleep_hours":number or null,"stress":1-10 or null,"notes":"any context"}

Rules for extraction:
- Extract MULTIPLE items if the message contains multiple things
- Be generous — if it sounds like a project update, extract it
- "blocked on X" = project_update with update_type "blocker"
- "need to decide X" = decision
- "I should always/never X" = rule
- "didn't sleep well / feeling X" = daily_check
- Only skip extraction if the message is purely a question with no new information`;

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll(s) { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { message } = await req.json();
  if (!message?.trim()) return NextResponse.json({ items: [] });

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 800,
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
    console.error("Extraction error:", err);
    return NextResponse.json({ items: [] });
  }
}
