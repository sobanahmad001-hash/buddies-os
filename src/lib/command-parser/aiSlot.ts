import { ParsedCommand } from "./parsers";
import { callAIProvider } from "@/lib/ai/providers";
import { resolveAISelection } from "@/lib/ai/config";

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
    const selection = resolveAISelection({ provider: process.env.AI_PROVIDER, workload: "chat" });
    const result = await callAIProvider({
      ...selection,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: rawInput }],
      maxTokens: 500,
    });
    const text = result.text;

    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean) as ParsedCommand;
  } catch (err) {
    console.error("AI slot error:", err);
    return null;
  }
}
