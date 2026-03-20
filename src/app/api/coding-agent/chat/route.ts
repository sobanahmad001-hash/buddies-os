import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { callAIProvider } from "@/lib/ai/providers";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Rate limiting: 20 coding agent requests per minute per user
    const rateLimit = checkRateLimit(`coding-agent:${user.id}`, { maxRequests: 20, windowMs: 60000 });
    if (!rateLimit.allowed) {
      return NextResponse.json({
        error: `Rate limit exceeded. Try again in ${Math.ceil(rateLimit.resetInMs / 1000)} seconds.`,
        retryAfterMs: rateLimit.resetInMs,
      }, { status: 429 });
    }

    const {
      message,
      history,
      systemPrompt,
      provider,
      model,
      images,
    } = await req.json();

    if (!message && (!images || images.length === 0)) {
      return NextResponse.json({ error: "message required" }, { status: 400 });
    }

    const effectiveProvider = provider === "anthropic" ? "anthropic" : "openai";
    const effectiveModel = model ?? (effectiveProvider === "anthropic" ? "claude-sonnet-4-5" : "gpt-4.1");

    // Build user content — support images
    let userContent: any = message || "Please analyze the attached image(s).";
    if (images && images.length > 0) {
      userContent = [
        { type: "text", text: message || "Please analyze the attached image(s)." },
        ...images.map((url: string) => ({
          type: "image",
          source: { type: "url", url },
        })),
      ];
    }

    const historyMessages: Array<{ role: "user" | "assistant"; content: string }> =
      (Array.isArray(history) ? history : [])
        .filter((m: any) => m?.content?.trim())
        .slice(-16)
        .map((m: any) => ({ role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant", content: m.content }));

    const result = await callAIProvider({
      provider: effectiveProvider,
      model: effectiveModel,
      system: systemPrompt ?? "You are a senior software engineer and coding agent.",
      messages: [
        ...historyMessages,
        { role: "user", content: userContent },
      ],
      maxTokens: 8192,
    });

    return NextResponse.json({
      response: result.text,
      model: result.model,
      provider: result.provider,
    });
  } catch (err: any) {
    console.error("[coding-agent/chat] error:", err);
    return NextResponse.json({ error: err?.message ?? "Internal server error" }, { status: 500 });
  }
}
