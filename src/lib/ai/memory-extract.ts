/**
 * Extracts memory signals from an AI response and writes them to ai_memory_items.
 * Runs after every response. Non-blocking — errors never surface to user.
 */

interface MemorySignal {
  memory_type: "blocker" | "decision" | "next_step" | "update" | "rule";
  content: string;
  importance: number;
}

function extractSignals(userMessage: string, aiResponse: string): MemorySignal[] {
  const signals: MemorySignal[] = [];

  // Blocker patterns
  const blockerPatterns = [
    /(?:blocked?|blocker|stuck|can't proceed|waiting on|dependency)[^\.\n]{0,120}/gi,
    /(?:issue|problem|error)[^\.\n]{0,100}(?:blocking|stopped?)[^\.\n]{0,80}/gi,
  ];
  for (const pattern of blockerPatterns) {
    const matches = aiResponse.match(pattern) ?? [];
    for (const m of matches.slice(0, 2)) {
      if (m.length > 20) signals.push({ memory_type: "blocker", content: m.trim(), importance: 4 });
    }
  }

  // Decision patterns
  const decisionPatterns = [
    /(?:decided?|decision|chose|going with|will use|confirmed?)[^\.\n]{0,120}/gi,
    /(?:verdict|conclusion)[^\.\n]{0,120}/gi,
  ];
  for (const pattern of decisionPatterns) {
    const matches = aiResponse.match(pattern) ?? [];
    for (const m of matches.slice(0, 2)) {
      if (m.length > 20) signals.push({ memory_type: "decision", content: m.trim(), importance: 4 });
    }
  }

  // Next step patterns
  const nextPatterns = [
    /(?:next step|next action|todo|action item|you should|we need to)[^\.\n]{0,120}/gi,
    /(?:\d+\.\s+(?:build|create|fix|implement|test|deploy|review))[^\.\n]{0,100}/gi,
  ];
  for (const pattern of nextPatterns) {
    const matches = aiResponse.match(pattern) ?? [];
    for (const m of matches.slice(0, 3)) {
      if (m.length > 15) signals.push({ memory_type: "next_step", content: m.trim(), importance: 3 });
    }
  }

  // Deduplicate by content similarity (simple length+prefix check)
  const seen = new Set<string>();
  return signals.filter((s) => {
    const key = s.content.slice(0, 40).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 6); // max 6 signals per response
}

export async function writeMemorySignals(args: {
  userId: string;
  projectId: string | null;
  sessionId: string | null;
  userMessage: string;
  aiResponse: string;
  supabase: any;
}): Promise<void> {
  try {
    const signals = extractSignals(args.userMessage, args.aiResponse);
    if (!signals.length) return;

    await args.supabase.from("ai_memory_items").insert(
      signals.map((s) => ({
        user_id: args.userId,
        project_id: args.projectId,
        session_id: args.sessionId,
        memory_type: s.memory_type,
        content: s.content,
        importance: s.importance,
        status: "active",
        source_kind: "auto_extracted",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }))
    );
  } catch {
    // non-blocking
  }
}
