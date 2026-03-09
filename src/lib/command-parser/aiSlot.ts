import { ParsedCommand } from "./parsers";

const AI_PROVIDER = process.env.AI_PROVIDER ?? "openai";

const SYSTEM_PROMPT = `You are a command parser for a personal OS. Extract structured data from natural language.
Return ONLY valid JSON (no markdown, no explanation):
{
  "intent": "project_update" | "create_project" | "decision" | "rule" | "daily_check" | "unknown",
  "project": "project name if mentioned",
  "content": "main content or description",
  "update_type": "progress" | "blocker" | "decision" | "note",
  "next_actions": "any next steps mentioned",
  "verdict": "enter" | "wait" | "do_not_enter",
  "probability": 0-100,
  "rule_text": "the rule text",
  "severity": 1 | 2 | 3
}`;

export async function parseWithAI(rawInput: string): Promise<ParsedCommand | null> {
  try {
    let text = "";

    if (AI_PROVIDER === "anthropic") {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 500, system: SYSTEM_PROMPT, messages: [{ role: "user", content: rawInput }] }),
      });
      const data = await response.json();
      text = data.content?.[0]?.text ?? "";
    } else {
      const { default: OpenAI } = await import("openai");
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini", max_tokens: 500,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: rawInput }],
      });
      text = response.choices[0]?.message?.content ?? "";
    }

    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean) as ParsedCommand;
  } catch (err) {
    console.error("AI slot error:", err);
    return null;
  }
}