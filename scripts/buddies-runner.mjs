#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const appUrl = (process.env.BUDDIES_APP_URL ?? "").replace(/\/$/, "");
const token = process.env.CODING_AGENT_RUNNER_TOKEN ?? "";
const root = path.resolve(process.env.BUDDIES_RUNNER_WORKSPACE ?? path.join(process.cwd(), ".buddies-runner"));
const runnerId = process.env.BUDDIES_RUNNER_ID ?? `runner-${process.env.COMPUTERNAME ?? "personal"}`;
const codex = process.env.CODEX_BIN ?? "codex";
const pollMs = Math.max(2_000, Number(process.env.BUDDIES_RUNNER_POLL_MS ?? 5_000));
const maxOutput = 500_000;

if (!appUrl || !token) {
  console.error("Set BUDDIES_APP_URL and CODING_AGENT_RUNNER_TOKEN before starting the runner.");
  process.exit(1);
}

await mkdir(root, { recursive: true });
console.log(`Buddies Runner ${runnerId} is online. Workspace: ${root}`);

while (true) {
  try {
    const response = await api(`/api/coding-agent/runner?runnerId=${encodeURIComponent(runnerId)}`);
    if (response.job) await execute(response.job);
  } catch (error) {
    console.error(`[runner] ${error instanceof Error ? error.message : String(error)}`);
  }
  await new Promise((resolve) => setTimeout(resolve, pollMs));
}

async function execute(job) {
  const repoSlug = String(job.repository);
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repoSlug)) throw new Error("Runner rejected an invalid repository name");
  const repoDir = path.join(root, "repositories", repoSlug.replace("/", "--"));
  const worktreeDir = path.join(root, "jobs", job.id);
  const branch = `buddies/${job.id.slice(0, 8)}`;
  await api("/api/coding-agent/runner", { method: "PATCH", body: { id: job.id, status: "running" } });
  let stdout = "";
  let stderr = "";
  try {
    await mkdir(path.dirname(repoDir), { recursive: true });
    await mkdir(path.dirname(worktreeDir), { recursive: true });
    if (!(await gitOk(["-C", repoDir, "rev-parse", "--git-dir"]))) {
      const clone = await run("git", ["clone", `https://github.com/${repoSlug}.git`, repoDir], root, 15 * 60_000);
      stdout += clone.stdout; stderr += clone.stderr;
      if (clone.exitCode !== 0) throw new Error("Repository clone failed");
    }
    const fetchResult = await run("git", ["-C", repoDir, "fetch", "origin", job.base_branch, "--prune"], root, 5 * 60_000);
    stdout += fetchResult.stdout; stderr += fetchResult.stderr;
    if (fetchResult.exitCode !== 0) throw new Error("Repository fetch failed");
    const worktree = await run("git", ["-C", repoDir, "worktree", "add", "-b", branch, worktreeDir, `origin/${job.base_branch}`], root, 60_000);
    stdout += worktree.stdout; stderr += worktree.stderr;
    if (worktree.exitCode !== 0) throw new Error("Could not create isolated worktree; remove an earlier job with the same id and retry");

    const prompt = [
      "You are the Buddies Coding Agent working in an isolated Git worktree.",
      "Implement the requested change completely. Inspect the repository first, edit only relevant files, and run appropriate tests/typechecks/build checks.",
      "Do not commit, push, open a pull request, reveal secrets, or access paths outside this worktree.",
      "Conclude with a concise summary of changes and verification performed.",
      "",
      `USER REQUEST:\n${job.prompt}`,
    ].join("\n");
    const agent = await run(codex, ["exec", "--json", "--sandbox", "workspace-write", "--skip-git-repo-check", "-C", worktreeDir, prompt], worktreeDir, 60 * 60_000);
    stdout = trim(stdout + agent.stdout); stderr = trim(stderr + agent.stderr);

    const diffResult = await run("git", ["-C", worktreeDir, "diff", "--no-ext-diff", "--binary", "HEAD"], root, 60_000);
    const namesResult = await run("git", ["-C", worktreeDir, "status", "--porcelain=v1"], root, 60_000);
    const changedFiles = await collectChangedFiles(worktreeDir, namesResult.stdout);
    const verificationResults = await verify(worktreeDir, job.verification_commands ?? []);
    const verificationFailed = verificationResults.some((result) => result.status === "failed");
    const succeeded = agent.exitCode === 0 && !verificationFailed;
    await api("/api/coding-agent/runner", { method: "PATCH", body: {
      id: job.id, status: succeeded ? "succeeded" : "failed", exitCode: agent.exitCode,
      stdout, stderr, diff: trim(diffResult.stdout, 1_000_000), changedFiles,
      verificationResults, workBranch: branch,
      error: succeeded ? "" : verificationFailed ? "One or more verification checks failed" : "Codex execution failed",
    } });
    console.log(`[runner] ${job.id} ${succeeded ? "completed" : "failed"} (${changedFiles.length} changed files)`);
  } catch (error) {
    await api("/api/coding-agent/runner", { method: "PATCH", body: {
      id: job.id, status: "failed", exitCode: 1, stdout: trim(stdout), stderr: trim(stderr),
      changedFiles: [], verificationResults: [], workBranch: branch,
      error: error instanceof Error ? error.message : String(error),
    } });
  }
}

async function verify(cwd, requested) {
  const packageJson = await jsonFile(path.join(cwd, "package.json"));
  const scripts = packageJson?.scripts ?? {};
  const manager = await fileExists(path.join(cwd, "pnpm-lock.yaml")) ? "pnpm" : await fileExists(path.join(cwd, "yarn.lock")) ? "yarn" : "npm";
  const allowed = new Set(["test", "typecheck", "lint", "build"]);
  const selected = requested.length ? requested.filter((name) => allowed.has(String(name))) : ["typecheck", "test", "build"].filter((name) => scripts[name]);
  const results = [];
  for (const name of selected) {
    if (!scripts[name]) { results.push({ name, status: "skipped", summary: "Script is not defined" }); continue; }
    const args = manager === "npm" ? ["run", name] : [name];
    const result = await run(manager, args, cwd, name === "build" ? 15 * 60_000 : 10 * 60_000);
    results.push({ name, command: `${manager} ${args.join(" ")}`, status: result.exitCode === 0 ? "passed" : "failed", exitCode: result.exitCode, output: trim(result.stdout + result.stderr, 100_000) });
  }
  return results;
}

async function collectChangedFiles(cwd, porcelain) {
  const files = [];
  let total = 0;
  for (const line of porcelain.split(/\r?\n/).filter(Boolean).slice(0, 200)) {
    const status = line.slice(0, 2).trim() || "M";
    const relative = line.slice(3).split(" -> ").pop();
    if (!relative || relative.includes("..") || path.isAbsolute(relative)) continue;
    let content = null;
    try {
      const buffer = await readFile(path.join(cwd, relative));
      if (!buffer.includes(0) && total + buffer.length <= 750_000) { content = buffer.toString("utf8"); total += buffer.length; }
    } catch {}
    files.push({ path: relative.replace(/\\/g, "/"), status, content });
  }
  return files;
}

async function api(url, options = {}) {
  const response = await fetch(`${appUrl}${url}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(options.headers ?? {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? `Buddies API returned ${response.status}`);
  return data;
}

function run(program, args, cwd, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(program, args, { cwd, shell: false, windowsHide: true, env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" } });
    let stdout = "", stderr = "", settled = false;
    child.stdout?.on("data", (chunk) => { stdout = trim(stdout + chunk); });
    child.stderr?.on("data", (chunk) => { stderr = trim(stderr + chunk); });
    const timer = setTimeout(() => { child.kill(); stderr = trim(`${stderr}\nTimed out after ${Math.round(timeoutMs / 1000)} seconds`); }, timeoutMs);
    const finish = (exitCode) => { if (settled) return; settled = true; clearTimeout(timer); resolve({ stdout, stderr, exitCode }); };
    child.on("error", (error) => { stderr = trim(`${stderr}\n${error.message}`); finish(1); });
    child.on("close", (code) => finish(code ?? 1));
  });
}

async function gitOk(args) { return (await run("git", args, root, 30_000)).exitCode === 0; }
async function fileExists(file) { try { await readFile(file); return true; } catch { return false; } }
async function jsonFile(file) { try { return JSON.parse(await readFile(file, "utf8")); } catch { return null; } }
function trim(value, limit = maxOutput) { return String(value ?? "").slice(-limit); }

