import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

/**
 * POST /api/ai/summarize-session
 * Body: { messages: { role, content }[] }
 * Returns: { summary: string }
 *
 * Called in the background every 10 messages to build a compact summary
 * that keeps the AI in context for the whole conversation even when older
 * messages are truncated from the history window.
 */
export async function POST(req: NextRequest) {
  const { messages } = await req.json();
  if (!messages?.length || !process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ summary: "" });
  }

  const transcript = messages
    .filter((m: any) => m.role !== "system" && !m.content?.startsWith("_(Response"))
    .map((m: any) => `${m.role === "user" ? "User" : "AI"}: ${(m.content ?? "").slice(0, 400)}`)
    .join("\n\n")
    .slice(0, 6000);

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 350,
      messages: [
        {
          role: "user",
          content: `Extract the key context from this conversation into compact bullet points so an AI can continue helping without re-reading everything.

Cover:
- Key topics or projects discussed
- Decisions made or being considered
- Tasks / action items mentioned
- Important facts or constraints established
- Any blockers or unresolved questions

Rules: Max 8 bullets. Each bullet under 15 words. No intro text—just bullets starting with "-".

CONVERSATION:
${transcript}`,
        },
      ],
    });

    const summary = response.content
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("")
      .trim();

    return NextResponse.json({ summary });
  } catch {
    return NextResponse.json({ summary: "" });
  }
}
