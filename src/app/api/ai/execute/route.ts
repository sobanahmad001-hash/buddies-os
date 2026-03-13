import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

async function sb() {
  const c = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return c.getAll(); },
        setAll(s: any[]) { s.forEach(({ name, value, options }) => c.set(name, value, options)); },
      },
    }
  );
}

// POST /api/ai/execute
// Body: { type, params } — called after user approves an action proposal
export async function POST(req: NextRequest) {
  const supabase = await sb();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { type, params } = await req.json();
  if (!type || !params) return NextResponse.json({ error: "type and params required" }, { status: 400 });

  // ── In-app actions (fully executable) ────────────────────────────────────────

  if (type === "app.create_task") {
    const { title, project_id, priority, due_date } = params;
    if (!title?.trim()) return NextResponse.json({ error: "title required" }, { status: 400 });

    // Resolve project: either passed directly or find the user's first project
    let pid = project_id ?? null;
    if (!pid) {
      const { data: proj } = await supabase.from("projects")
        .select("id").eq("user_id", user.id).limit(1).single();
      pid = proj?.id ?? null;
    }
    if (!pid) return NextResponse.json({ error: "No project found to add task to" }, { status: 404 });

    const { data, error } = await supabase.from("project_tasks").insert({
      title: title.trim(),
      project_id: pid,
      user_id: user.id,
      priority: priority ?? 3,
      status: "todo",
      due_date: due_date ?? null,
    }).select("id, title, status").single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({
      success: true,
      result: `✅ Task created: **${data.title}**`,
      data,
    });
  }

  if (type === "app.create_decision") {
    const { context, verdict, probability } = params;
    if (!context?.trim()) return NextResponse.json({ error: "context required" }, { status: 400 });

    const { data, error } = await supabase.from("decisions").insert({
      user_id: user.id,
      context: context.trim(),
      verdict: verdict ?? null,
      probability: probability ?? null,
    }).select("id, context, verdict").single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({
      success: true,
      result: `✅ Decision logged: **${verdict?.toUpperCase() ?? "OPEN"}** — ${context.slice(0, 80)}${context.length > 80 ? "…" : ""}`,
      data,
    });
  }

  if (type === "app.update_project") {
    const { project_id, status, description } = params;
    if (!project_id) return NextResponse.json({ error: "project_id required" }, { status: 400 });

    const updates: Record<string, unknown> = {};
    if (status)      updates.status      = status;
    if (description) updates.description = description;

    const { data, error } = await supabase.from("projects")
      .update(updates)
      .eq("id", project_id)
      .eq("user_id", user.id)
      .select("id, name, status").single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({
      success: true,
      result: `✅ Project **${data.name}** updated → status: ${data.status}`,
      data,
    });
  }

  if (type === "app.add_project_update") {
    const { project_id, content, update_type } = params;
    if (!project_id || !content?.trim()) return NextResponse.json({ error: "project_id and content required" }, { status: 400 });

    const { data, error } = await supabase.from("project_updates").insert({
      project_id,
      user_id: user.id,
      content: content.trim(),
      update_type: update_type ?? "progress",
    }).select("id").single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({
      success: true,
      result: `✅ Project update added (${update_type ?? "progress"})`,
      data,
    });
  }

  // ── External actions (GitHub / Supabase) ─────────────────────────────────────
  // Since tokens are masked at storage time, we attempt the call — if it fails,
  // we return the equivalent command for the user to run manually.

  if (type === "github.create_issue") {
    const { repo, title, body, labels } = params;
    if (!repo || !title) return NextResponse.json({ error: "repo and title required" }, { status: 400 });

    // Try to get the stored access token from integrations
    const { data: integration } = await supabase
      .from("integrations").select("config").eq("user_id", user.id).eq("type", "github").limit(1).single();
    const token = integration?.config?.access_token;

    // If token is masked (contains ****) we can't use it, return CLI equivalent
    if (!token || token.includes("****")) {
      return NextResponse.json({
        success: false,
        needsToken: true,
        result: `⚠️ **GitHub token is masked** — cannot execute automatically.\n\nRun this command instead:\n\`\`\`bash\ngh issue create --repo ${repo} --title "${title}" --body "${(body ?? "").replace(/"/g, '\\"')}"\`\`\`\nOr visit: https://github.com/${repo}/issues/new`,
      });
    }

    try {
      const ghRes = await fetch(`https://api.github.com/repos/${repo}/issues`, {
        method: "POST",
        headers: { Authorization: `token ${token}`, "Content-Type": "application/json", Accept: "application/vnd.github.v3+json" },
        body: JSON.stringify({ title, body: body ?? "", labels: labels ?? [] }),
      });
      const ghData = await ghRes.json();
      if (!ghRes.ok) throw new Error(ghData.message ?? "GitHub API error");
      return NextResponse.json({
        success: true,
        result: `✅ GitHub issue created: [#${ghData.number} ${title}](${ghData.html_url})`,
        data: { number: ghData.number, url: ghData.html_url },
      });
    } catch (e: any) {
      return NextResponse.json({
        success: false,
        result: `❌ GitHub error: ${e.message}\n\nRun manually:\n\`\`\`bash\ngh issue create --repo ${repo} --title "${title}"\`\`\``,
      });
    }
  }

  if (type === "github.create_branch") {
    const { repo, branch, from } = params;
    return NextResponse.json({
      success: false,
      needsToken: true,
      result: `⚠️ **Run manually** — GitHub token is masked:\n\`\`\`bash\ngit checkout ${from ?? "main"} && git checkout -b ${branch} && git push origin ${branch}\`\`\``,
    });
  }

  if (type === "supabase.run_sql") {
    const { sql, description } = params;
    if (!sql?.trim()) return NextResponse.json({ error: "sql required" }, { status: 400 });

    // Only allow SELECT for safety — no DDL/DML via AI
    const normalized = sql.trim().toUpperCase();
    if (!normalized.startsWith("SELECT")) {
      return NextResponse.json({
        success: false,
        result: `⚠️ For safety, only **SELECT** queries are executed automatically.\n\nRun this in Supabase SQL Editor:\n\`\`\`sql\n${sql}\n\`\`\``,
      });
    }

    try {
      // Run via rpc or raw query using the client (RLS applies — only user's data)
      const { data, error } = await supabase.rpc("execute_read_query", { query_text: sql });
      if (error) throw error;
      const preview = JSON.stringify(data ?? [], null, 2).slice(0, 1000);
      return NextResponse.json({
        success: true,
        result: `✅ Query executed. Results:\n\`\`\`json\n${preview}${preview.length >= 1000 ? "\n…(truncated)" : ""}\n\`\`\``,
        data,
      });
    } catch (e: any) {
      return NextResponse.json({
        success: false,
        result: `❌ Query failed: ${e.message}\n\nRun in Supabase SQL Editor:\n\`\`\`sql\n${sql}\n\`\`\``,
      });
    }
  }

  return NextResponse.json({ error: `Unknown action type: ${type}` }, { status: 400 });
}
