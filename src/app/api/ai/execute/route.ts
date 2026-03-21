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

export async function POST(req: NextRequest) {
  const supabase = await sb();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { type, params } = await req.json();
  if (!type || !params) return NextResponse.json({ error: "type and params required" }, { status: 400 });

  // ── Generic app actions ─────────────────────────────────────────────────────

  if (type === "app.generate_document") {
    const { title, content } = params;
    if (!title?.trim()) return NextResponse.json({ error: "title required" }, { status: 400 });
    return NextResponse.json({
      success: true,
      result: `📄 Document ready: **${title}**`,
      document: { title: String(title).trim(), content: String(content ?? "") },
    });
  }

  if (type === "app.create_project") {
    const { name, description } = params;
    if (!name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });

    const { data: existing } = await supabase.from("projects")
      .select("id, name, status")
      .eq("user_id", user.id)
      .ilike("name", name.trim())
      .limit(1);

    if (existing?.length) {
      return NextResponse.json({
        success: true,
        result: `ℹ️ Project **${existing[0].name}** already exists`,
        data: existing[0],
      });
    }

    const { data, error } = await supabase.from("projects").insert({
      user_id: user.id,
      name: name.trim(),
      description: description?.trim() ?? null,
      status: "active",
      tags: [],
    }).select("id, name, status").single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      success: true,
      result: `✅ Project **${data.name}** created`,
      data,
    });
  }

  if (type === "app.complete_task") {
    const { task_id, title } = params;
    if (!task_id) return NextResponse.json({ error: "task_id required" }, { status: 400 });

    const { data, error } = await supabase.from("project_tasks")
      .update({ status: "done", updated_at: new Date().toISOString() })
      .eq("id", task_id)
      .eq("user_id", user.id)
      .select("id, title, status")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      success: true,
      result: `✅ Task marked complete: **${data.title ?? title ?? task_id}**`,
      data,
    });
  }

  if (type === "app.create_task") {
    const { title, project_id, priority, due_date } = params;
    if (!title?.trim()) return NextResponse.json({ error: "title required" }, { status: 400 });

    let pid = project_id ?? null;
    if (!pid) {
      const { data: proj } = await supabase.from("projects")
        .select("id")
        .eq("user_id", user.id)
        .limit(1)
        .single();
      pid = proj?.id ?? null;
    }

    if (!pid) return NextResponse.json({ error: "No project found to add task to" }, { status: 404 });

    // Idempotency: prevent duplicate tasks created within the last 60 seconds
    const since = new Date(Date.now() - 60_000).toISOString();
    const { data: duplicate } = await supabase.from("project_tasks")
      .select("id, title, status")
      .eq("project_id", pid)
      .eq("user_id", user.id)
      .ilike("title", title.trim())
      .gte("created_at", since)
      .limit(1)
      .maybeSingle();

    if (duplicate) {
      return NextResponse.json({
        success: true,
        result: `✅ Task already created: **${duplicate.title}**`,
        data: duplicate,
      });
    }

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
    if (status) updates.status = status;
    if (description) updates.description = description;

    const { data, error } = await supabase.from("projects")
      .update(updates)
      .eq("id", project_id)
      .eq("user_id", user.id)
      .select("id, name, status")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      success: true,
      result: `✅ Project **${data.name}** updated → status: ${data.status}`,
      data,
    });
  }

  if (type === "app.add_project_update") {
    const { project_id, content, update_type, next_actions } = params;
    if (!project_id || !content?.trim()) {
      return NextResponse.json({ error: "project_id and content required" }, { status: 400 });
    }

    const { data, error } = await supabase.from("project_updates").insert({
      project_id,
      user_id: user.id,
      content: content.trim(),
      update_type: update_type ?? "progress",
      next_actions: next_actions ?? null,
    }).select("id").single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      success: true,
      result: `✅ Project update logged (${update_type ?? "progress"})${next_actions ? `\n→ Next: ${next_actions}` : ""}`,
      data,
    });
  }

  // ── Project-scoped approval-backed actions ──────────────────────────────────

  if (type === "project.create_task") {
    const { project_id, title, priority, due_date } = params;
    if (!project_id || !title?.trim()) {
      return NextResponse.json({ error: "project_id and title required" }, { status: 400 });
    }

    const { data: project } = await supabase.from("projects")
      .select("id, name")
      .eq("id", project_id)
      .eq("user_id", user.id)
      .single();

    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const { data, error } = await supabase.from("project_tasks").insert({
      project_id,
      user_id: user.id,
      title: title.trim(),
      priority: priority ?? 3,
      status: "todo",
      due_date: due_date ?? null,
    }).select("id, title").single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      success: true,
      result: `✅ Task created in **${project.name}**: **${data.title}**`,
      data,
    });
  }

  if (type === "project.create_decision") {
    const { project_id, title, context, verdict } = params;
    if (!project_id || !title?.trim() || !context?.trim()) {
      return NextResponse.json({ error: "project_id, title, and context required" }, { status: 400 });
    }

    const { data: project } = await supabase.from("projects")
      .select("id, name")
      .eq("id", project_id)
      .eq("user_id", user.id)
      .single();

    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const { data, error } = await supabase.from("project_decisions").insert({
      project_id,
      user_id: user.id,
      title: title.trim(),
      context: context.trim(),
      verdict: verdict ?? null,
    }).select("id, title, verdict").single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      success: true,
      result: `✅ Decision logged in **${project.name}**: **${data.title}**${data.verdict ? ` → ${data.verdict}` : ""}`,
      data,
    });
  }

  if (type === "project.create_rule") {
    const { project_id, rule_text, severity } = params;
    if (!project_id || !rule_text?.trim()) {
      return NextResponse.json({ error: "project_id and rule_text required" }, { status: 400 });
    }

    const { data: project } = await supabase.from("projects")
      .select("id, name")
      .eq("id", project_id)
      .eq("user_id", user.id)
      .single();

    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const { data, error } = await supabase.from("project_rules").insert({
      project_id,
      user_id: user.id,
      rule_text: rule_text.trim(),
      severity: severity ?? 2,
      active: true,
    }).select("id, rule_text, severity").single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      success: true,
      result: `✅ Constraint added to **${project.name}**: **${data.rule_text}**`,
      data,
    });
  }

  if (type === "project.create_research") {
    const { project_id, topic, notes } = params;
    if (!project_id || !topic?.trim() || !notes?.trim()) {
      return NextResponse.json({ error: "project_id, topic, and notes required" }, { status: 400 });
    }

    const { data: project } = await supabase.from("projects")
      .select("id, name")
      .eq("id", project_id)
      .eq("user_id", user.id)
      .single();

    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const { data, error } = await supabase.from("project_research").insert({
      project_id,
      user_id: user.id,
      topic: topic.trim(),
      notes: notes.trim(),
    }).select("id, topic").single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      success: true,
      result: `✅ Research note added to **${project.name}**: **${data.topic}**`,
      data,
    });
  }

  if (type === "project.create_document") {
    const { project_id, title, content } = params;
    if (!project_id || !title?.trim()) {
      return NextResponse.json({ error: "project_id and title required" }, { status: 400 });
    }

    const { data: project } = await supabase.from("projects")
      .select("id, name")
      .eq("id", project_id)
      .eq("user_id", user.id)
      .single();

    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const { data, error } = await supabase.from("project_documents").insert({
      project_id,
      user_id: user.id,
      title: title.trim(),
      content: String(content ?? ""),
    }).select("id, title, content").single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      success: true,
      result: `✅ Document created in **${project.name}**: **${data.title}**`,
      data,
      document: data,
    });
  }

  if (type === "project.add_update") {
    const { project_id, content, update_type, next_actions } = params;
    if (!project_id || !content?.trim()) {
      return NextResponse.json({ error: "project_id and content required" }, { status: 400 });
    }

    const { data: project } = await supabase.from("projects")
      .select("id, name")
      .eq("id", project_id)
      .eq("user_id", user.id)
      .single();

    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const { data, error } = await supabase.from("project_updates").insert({
      project_id,
      user_id: user.id,
      content: content.trim(),
      update_type: update_type ?? "progress",
      next_actions: next_actions ?? null,
    }).select("id").single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      success: true,
      result: `✅ Update added to **${project.name}**${next_actions ? `\n→ Next: ${next_actions}` : ""}`,
      data,
    });
  }

  // ── External actions ────────────────────────────────────────────────────────

  if (type === "github.create_issue") {
    const { repo, title, body, labels } = params;
    if (!repo || !title) return NextResponse.json({ error: "repo and title required" }, { status: 400 });

    const { data: integration } = await supabase
      .from("integrations")
      .select("config")
      .eq("user_id", user.id)
      .eq("type", "github")
      .limit(1)
      .single();

    const token = integration?.config?.access_token;

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
        headers: {
          Authorization: `token ${token}`,
          "Content-Type": "application/json",
          Accept: "application/vnd.github.v3+json",
        },
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
    const { branch, from } = params;
    return NextResponse.json({
      success: false,
      needsToken: true,
      result: `⚠️ **Run manually** — GitHub token is masked:\n\`\`\`bash\ngit checkout ${from ?? "main"} && git checkout -b ${branch} && git push origin ${branch}\`\`\``,
    });
  }

  if (type === "supabase.run_sql") {
    const { sql } = params;
    if (!sql?.trim()) return NextResponse.json({ error: "sql required" }, { status: 400 });

    const normalized = sql.trim().toUpperCase();
    if (!normalized.startsWith("SELECT")) {
      return NextResponse.json({
        success: false,
        result: `⚠️ For safety, only **SELECT** queries are executed automatically.\n\nRun this in Supabase SQL Editor:\n\`\`\`sql\n${sql}\n\`\`\``,
      });
    }

    try {
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
