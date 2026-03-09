export type Intent =
  | "create_project"
  | "project_update"
  | "decision"
  | "rule"
  | "daily_check"
  | "unknown";

export function detectIntent(input: string): Intent {
  const text = input.toLowerCase().trim();

  if (/^(create project|new project)\s*:/.test(text)) return "create_project";
  if (/^update\s+\w.+:/.test(text) || /\b(worked on|finished|completed|shipped|fixed|built)\b/.test(text)) return "project_update";
  if (/^decision\s+\w.+:/.test(text) || /\b(decided|verdict|probability)\b/.test(text)) return "decision";
  if (/^rule\s+\w.+:/.test(text) || /\b(never|always|rule:|must not|must always)\b/.test(text)) return "rule";
  if (/\b(slept|sleep|mood|stress|daily check)\b/.test(text)) return "daily_check";

  return "unknown";
}
