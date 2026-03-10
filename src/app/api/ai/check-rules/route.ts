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
  if (!user) return NextResponse.json({ violations: [] });

  const { message } = await req.json();
  if (!message) return NextResponse.json({ violations: [] });

  const { data: rules } = await supabase
    .from("rules")
    .select("id, rule_text, severity, domain")
    .eq("user_id", user.id)
    .eq("active", true);

  if (!rules || rules.length === 0) return NextResponse.json({ violations: [] });

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 400,
    messages: [
      {
        role: "system",
        content: `You check if a message violates any of the user's personal rules.

Rules to check:
${rules.map((r, i) => `${i + 1}. [severity ${r.severity}] ${r.rule_text}`).join("\n")}

Return ONLY a JSON array. If no violations return [].
If violations found:
[{
  "rule_id": "the rule id from the list",
  "rule_text": "the rule text",
  "severity": number,
  "violation_note": "brief explanation of how the message violates this rule"
}]

Only flag clear violations. When in doubt, return [].
Return ONLY valid JSON.`
      },
      { role: "user", content: `Message: "${message}"` }
    ],
  });

  const raw = response.choices[0]?.message?.content ?? "[]";
  const clean = raw.replace(/```json|```/g, "").trim();
  let violations: any[] = [];
  try { violations = JSON.parse(clean); } catch { violations = []; }

  // Map rule_text back to actual rule ids
  const ruleMap = Object.fromEntries(rules.map(r => [r.rule_text.slice(0, 40), r.id]));
  violations = violations.map(v => ({
    ...v,
    rule_id: rules.find(r => r.rule_text === v.rule_text)?.id ?? v.rule_id,
  }));

  // Log violations to DB
  for (const v of violations) {
    if (v.rule_id) {
      await supabase.from("rule_violations").insert({
        user_id: user.id,
        rule_id: v.rule_id,
        notes: v.violation_note,
        timestamp: new Date().toISOString(),
      });
    }
  }

  return NextResponse.json({ violations });
}
