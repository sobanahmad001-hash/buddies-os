import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";

const execAsync = promisify(exec);

// Patterns that are unconditionally blocked — catastrophic/irreversible only
const BLOCKED_PATTERNS = [
  /rm\s+-rf\s+\/\s*$/,                          // rm -rf /
  /rm\s+-rf\s+~\s*$/,                           // rm -rf ~
  /:\(\)\{.*:\|:&\};:/,                          // fork bomb
  /mkfs\b/,                                      // filesystem format
  /dd\s+.*of=\/dev\/(sd|hd|nvme|xvd)/i,         // dd to block device
  />\s*\/dev\/(sd|hd|nvme|xvd)/i,               // redirect to block device
  /format\s+[a-zA-Z]:\\/i,                       // Windows format drive
];

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { cmd, cwd } = body;

    if (!cmd || typeof cmd !== "string" || cmd.trim().length === 0) {
      return NextResponse.json({ error: "cmd is required" }, { status: 400 });
    }

    // Block dangerous patterns
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(cmd)) {
        return NextResponse.json(
          { error: "Command blocked — matches a dangerous pattern" },
          { status: 400 }
        );
      }
    }

    // Resolve working directory — must stay within the project root
    const projectRoot = process.cwd();
    const resolvedCwd = cwd
      ? path.resolve(projectRoot, String(cwd))
      : projectRoot;

    if (!resolvedCwd.startsWith(projectRoot)) {
      return NextResponse.json(
        { error: "cwd must be within the project directory" },
        { status: 400 }
      );
    }

    try {
      const { stdout, stderr } = await execAsync(cmd, {
        cwd: resolvedCwd,
        timeout: 30_000,
        maxBuffer: 1024 * 1024, // 1 MB
        env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
      });
      return NextResponse.json({ stdout, stderr, exitCode: 0 });
    } catch (execErr: any) {
      // child_process rejects on non-zero exit — this is expected behaviour
      return NextResponse.json({
        stdout: execErr.stdout ?? "",
        stderr: execErr.stderr ?? execErr.message ?? "",
        exitCode: typeof execErr.code === "number" ? execErr.code : 1,
      });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Internal error" }, { status: 500 });
  }
}
