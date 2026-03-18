/**
 * Sliding window compression for long conversations.
 * When messages exceed the threshold, older turns are summarized
 * and stored in ai_session_memory. Recent turns stay verbatim.
 * This gives Buddies unlimited effective context with controlled token cost.
 */

const COMPRESS_THRESHOLD = 14; // compress when session exceeds this
const KEEP_RECENT = 8;          // always keep this many recent turns verbatim

export interface CompressedContext {
  summary: string | null;
  recentMessages: Array<{ role: "user" | "assistant"; content: string }>;
  wasCompressed: boolean;
}

export async function buildCompressedContext(
  messages: Array<{ role: string; content: string }>,
  sessionId: string | null,
  supabase: any
): Promise<CompressedContext> {
  const valid = messages.filter((m) => m?.content?.trim());

  // Under threshold — just return as-is, no compression needed
  if (valid.length <= COMPRESS_THRESHOLD) {
    return {
      summary: null,
      recentMessages: valid.slice(-COMPRESS_THRESHOLD).map((m) => ({
        role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
        content: m.content,
      })),
      wasCompressed: false,
    };
  }

  // Over threshold — check if we already have a summary for this session
  let existingSummary: string | null = null;
  if (sessionId) {
    const { data } = await supabase
      .from("ai_session_memory")
      .select("summary, updated_at")
      .eq("session_id", sessionId)
      .maybeSingle();
    existingSummary = data?.summary ?? null;
  }

  // Keep recent verbatim
  const recentMessages: Array<{ role: "user" | "assistant"; content: string }> =
    valid.slice(-KEEP_RECENT).map((m) => ({
      role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
      content: m.content,
    }));

  // If we have a summary, use it. Otherwise trigger background compression.
  // We don't await the compression here — it fires async so it doesn't slow the response.
  if (!existingSummary && sessionId) {
    const olderMessages = valid.slice(0, -KEEP_RECENT);
    triggerBackgroundCompression(olderMessages, sessionId).catch(() => {});
  }

  return {
    summary: existingSummary,
    recentMessages,
    wasCompressed: true,
  };
}

async function triggerBackgroundCompression(
  messages: Array<{ role: string; content: string }>,
  sessionId: string
) {
  if (!messages.length) return;
  try {
    await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/ai/summarize-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, sessionId }),
    });
  } catch {
    // non-blocking, silently skip
  }
}
