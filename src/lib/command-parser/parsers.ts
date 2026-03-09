export type ParsedCommand =
  | { intent: "create_project"; name: string; description: string | null }
  | { intent: "project_update"; project: string | null; content: string; next_actions: string | null; update_type: string }
  | { intent: "decision"; project: string | null; context: string; probability: number | null; verdict: string | null }
  | { intent: "rule"; project: string | null; rule_text: string; domain: string }
  | { intent: "daily_check"; notes: string }
  | { intent: "unknown"; raw: string };

export function parseCommand(input: string, intent: string): ParsedCommand {
  const text = input.trim();

  if (intent === "create_project") {
    const match = text.match(/(?:create project|new project)\s*:\s*(.+)/i);
    const name = match?.[1]?.trim() ?? text;
    return { intent: "create_project", name, description: null };
  }

  if (intent === "project_update") {
    // "update ProjectName: content — next: next action"
    const structured = text.match(/^update\s+(.+?)\s*:\s*(.+)/i);
    let project: string | null = null;
    let content = text;
    let next_actions: string | null = null;
    let update_type = "progress";

    if (structured) {
      project = structured[1].trim();
      content = structured[2].trim();
    }

    // Extract "next: ..." from content
    const nextMatch = content.match(/[-—]\s*next\s*:\s*(.+)$/i) ?? content.match(/\bnext\s*:\s*(.+)$/i);
    if (nextMatch) {
      next_actions = nextMatch[1].trim();
      content = content.replace(nextMatch[0], "").trim();
    }

    if (/\b(blocked|blocker|stuck|issue|bug)\b/i.test(content)) update_type = "blocker";
    else if (/\b(launched|shipped|milestone|completed|done)\b/i.test(content)) update_type = "milestone";

    return { intent: "project_update", project, content, next_actions, update_type };
  }

  if (intent === "decision") {
    const structured = text.match(/^decision\s+(.+?)\s*:\s*(.+)/i);
    let project: string | null = null;
    let context = text;
    let probability: number | null = null;
    let verdict: string | null = null;

    if (structured) {
      project = structured[1].trim();
      context = structured[2].trim();
    }

    const probMatch = context.match(/\bprobability\s+(\d+)/i);
    if (probMatch) {
      probability = parseInt(probMatch[1]);
      context = context.replace(probMatch[0], "").trim();
    }

    const verdictMatch = context.match(/\bverdict\s+(enter|wait|do_not_enter)\b/i) ??
      context.match(/\b(enter|wait|do not enter|do_not_enter)\b/i);
    if (verdictMatch) {
      verdict = verdictMatch[1].toLowerCase().replace(/ /g, "_");
      context = context.replace(verdictMatch[0], "").trim();
    }

    return { intent: "decision", project, context, probability, verdict };
  }

  if (intent === "rule") {
    const structured = text.match(/^rule\s+(.+?)\s*:\s*(.+)/i);
    let project: string | null = null;
    let rule_text = text;
    let domain = "general";

    if (structured) {
      project = structured[1].trim();
      rule_text = structured[2].trim();
    }

    return { intent: "rule", project, rule_text, domain };
  }

  if (intent === "daily_check") {
    return { intent: "daily_check", notes: text };
  }

  return { intent: "unknown", raw: text };
}
