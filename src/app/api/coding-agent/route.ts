import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function getGithubHeaders(supabase: any, userId: string, repoName: string) {
  const { data: integrations } = await supabase
    .from("integrations")
    .select("config")
    .eq("user_id", userId)
    .eq("type", "github")
    .eq("status", "active");

  // Find integration matching this repo
  const integration = integrations?.find((i: any) =>
    i.config?.repo_url?.includes(repoName.split("/")[0]) ||
    i.config?.org_or_user === repoName.split("/")[0]
  ) ?? integrations?.[0];

  if (!integration?.config?.access_token) return null;
  return {
    Authorization: `token ${integration.config.access_token}`,
    Accept: "application/vnd.github.v3+json",
    "Content-Type": "application/json",
  };
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { action, repo, branch, files, prTitle, prBody, taskId } = body;

    const headers = await getGithubHeaders(supabase, user.id, repo);
    if (!headers) return NextResponse.json({ error: "GitHub not configured" }, { status: 400 });

    // ── Get file content ──────────────────────────────────────────────────────
    if (action === "get_file") {
      const { path } = body;
      const res = await fetch(
        `https://api.github.com/repos/${repo}/contents/${path}`,
        { headers, signal: AbortSignal.timeout(5000) }
      );
      if (!res.ok) return NextResponse.json({ error: `File not found: ${path}` }, { status: 404 });
      const data = await res.json();
      const content = Buffer.from(data.content, "base64").toString("utf-8");
      return NextResponse.json({ content, sha: data.sha, path });
    }

    if (action === "create_pr_with_files") {
      // 1. Get default branch
      const repoRes = await fetch(`https://api.github.com/repos/${repo}`, { headers });
      const repoData = await repoRes.json();
      const defaultBranch = repoData.default_branch ?? "main";

      // 2. Get SHA of default branch
      const refRes = await fetch(
        `https://api.github.com/repos/${repo}/git/ref/heads/${defaultBranch}`,
        { headers }
      );
      const refData = await refRes.json();
      const baseSha = refData.object?.sha;
      if (!baseSha) return NextResponse.json({ error: "Could not get branch SHA" }, { status: 500 });

      // 3. Create new branch
      const branchRes = await fetch(`https://api.github.com/repos/${repo}/git/refs`, {
        method: "POST",
        headers,
        body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseSha }),
      });

      if (!branchRes.ok) {
        const errData = await branchRes.json();
        // Branch may already exist — try to continue
        if (!errData.message?.includes("already exists")) {
          return NextResponse.json({ error: `Failed to create branch: ${errData.message}` }, { status: 500 });
        }
      }

      // 4. Write each file to the branch
      const writtenFiles: string[] = [];
      for (const file of (files ?? [])) {
        // Get current file SHA if it exists (needed for update)
        let existingSha: string | undefined;
        try {
          const existingRes = await fetch(
            `https://api.github.com/repos/${repo}/contents/${file.path}?ref=${branch}`,
            { headers }
          );
          if (existingRes.ok) {
            const existing = await existingRes.json();
            existingSha = existing.sha;
          }
        } catch {}

        const writeRes = await fetch(
          `https://api.github.com/repos/${repo}/contents/${file.path}`,
          {
            method: "PUT",
            headers,
            body: JSON.stringify({
              message: `fix: ${file.path} — ${prTitle}`,
              content: Buffer.from(file.content, "utf-8").toString("base64"),
              branch,
              ...(existingSha ? { sha: existingSha } : {}),
            }),
          }
        );

        if (writeRes.ok) {
          writtenFiles.push(file.path);
        } else {
          const errData = await writeRes.json();
          console.error(`Failed to write ${file.path}:`, errData.message);
        }
      }

      if (writtenFiles.length === 0) {
        return NextResponse.json({ error: "No files were written successfully" }, { status: 500 });
      }

      // 5. Create PR
      const prRes = await fetch(`https://api.github.com/repos/${repo}/pulls`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          title: prTitle,
          body: `${prBody ?? ""}\n\n---\n**Files changed:** ${writtenFiles.join(", ")}\n**Created by:** Buddies OS Coding Agent`,
          head: branch,
          base: defaultBranch,
        }),
      });

      const prData = await prRes.json();
      if (!prData.html_url) {
        return NextResponse.json({ error: prData.message ?? "PR creation failed" }, { status: 500 });
      }

      // 6. Save PR link back to task if provided
      if (taskId) {
        await supabase.from("project_tasks")
          .update({ description: `PR: ${prData.html_url}` })
          .eq("id", taskId);
      }

      return NextResponse.json({
        pr_url: prData.html_url,
        pr_number: prData.number,
        branch,
        files_written: writtenFiles,
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
