import { resolveRuntimeCwd, validateRuntimeCommand } from "@/lib/coding-agent/runtime-policy";

describe("Coding Agent runtime policy", () => {
  test("allows read-only git operations", () => {
    expect(validateRuntimeCommand({ program: "git", args: ["diff", "--stat"] }).ok).toBe(true);
  });
  test("blocks mutating git and arbitrary programs", () => {
    expect(validateRuntimeCommand({ program: "git", args: ["push"] }).ok).toBe(false);
    expect(validateRuntimeCommand({ program: "powershell", args: ["-Command", "echo ok"] }).ok).toBe(false);
  });
  test("allows only verification package scripts", () => {
    expect(validateRuntimeCommand({ program: "pnpm", args: ["test"] }).ok).toBe(true);
    expect(validateRuntimeCommand({ program: "pnpm", args: ["publish"] }).ok).toBe(false);
  });
  test("prevents cwd escape", () => {
    expect(() => resolveRuntimeCwd("C:/workspace/project", "../outside")).toThrow();
  });
});
