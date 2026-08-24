import path from "path";

const SAFE_GIT_ACTIONS = new Set(["status", "diff", "log", "show", "branch", "rev-parse"]);
const SAFE_PNPM_ACTIONS = new Set(["test", "build", "lint", "typecheck"]);

export type RuntimeCommand = { program: string; args: string[]; cwd?: string };

export function validateRuntimeCommand(command: RuntimeCommand) {
  if (!command || typeof command.program !== "string" || !Array.isArray(command.args)) {
    return { ok: false as const, error: "A structured program and args array are required" };
  }
  if (command.args.length > 30 || command.args.some((arg) => typeof arg !== "string" || arg.length > 500)) {
    return { ok: false as const, error: "Command arguments exceed policy limits" };
  }
  const program = command.program.toLowerCase();
  if (program === "git" && SAFE_GIT_ACTIONS.has(command.args[0] ?? "")) return { ok: true as const, program };
  if (program === "pnpm" && SAFE_PNPM_ACTIONS.has(command.args[0] ?? "")) return { ok: true as const, program };
  return { ok: false as const, error: "Command is not allowed by the Coding Agent runtime policy" };
}

export function resolveRuntimeCwd(root: string, requested = ".") {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, requested);
  const relative = path.relative(resolvedRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Working directory must remain inside the configured workspace");
  return resolved;
}
