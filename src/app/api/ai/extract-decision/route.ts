import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export async function POST(req: NextRequest) {
  const { message } = await req.json();
  if (!message) return NextResponse.json({ decision_detected: false });

  // Quick pre-filter — skip obvious non-decision messages
  const lower = message.toLowerCase();
  const decisionSignals = ["thinking of", "considering", "probability", "should i", "going to", "planning to", "decide", "test", "launch", "invest", "risk", "bet", "try", "run", "start", "stop", "hire", "fire", "buy", "sell", "move", "switch"];
  const hasSignal = decisionSignals.some(s => lower.includes(s));
  if (!hasSignal) return NextResponse.json({ decision_detected: false });

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 200,
    messages: [
      {
        role: "system",
        content: `You detect decisions embedded in natural language text from an entrepreneur.
A decision is something the person is seriously considering acting on — not just mentioning.

Return ONLY a JSON object:
{
  "decision_detected": true/false,
  "title": "Short decision title (max 8 words)",
  "type": "business|trading|strategy|personal|hiring|marketing",
  "predicted_probability": 0-100,
  "project": "project name if mentioned or null",
  "confidence": 0.0-1.0
}

Only set decision_detected: true if confidence >= 0.7.
If no clear decision, return { "decision_detected": false }.
Return ONLY valid JSON.`
      },
      { role: "user", content: message }
    ],
  });

  const raw = response.choices[0]?.message?.content ?? "{}";
  const clean = raw.replace(/```json|```/g, "").trim();
  try {
    const result = JSON.parse(clean);
    if (!result.decision_detected || result.confidence < 0.7) {
      return NextResponse.json({ decision_detected: false });
    }
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ decision_detected: false });
  }
}
