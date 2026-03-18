import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

async function sb() {
  const c = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return c.getAll(); }, setAll(s: any[]) { s.forEach(({ name, value, options }) => c.set(name, value, options)); } } }
  );
}

export async function POST(req: NextRequest) {
  const supabase = await sb();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, researchId, approve, tasks: approvedTasks } = await req.json();

  // If approving a task batch, create them
  if (approve && approvedTasks?.length) {
    const created = await Promise.all(
      approvedTasks.map((t: any) =>
        supabase.from("project_tasks").insert({
          project_id: projectId,
          user_id: user.id,
          title: t.title,
          description: t.description ?? null,
          priority: t.priority ?? 2,
          status: "todo",
        }).select().single()
      )
    );

    // Add timeline node
    await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/projects/timeline`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        node: { type: "task_batch", label: `${approvedTasks.length} tasks from research`, detail: approvedTasks.map((t: any) => t.title).join(", ") }
      }),
    }).catch(() => {});

    return NextResponse.json({ created: created.length });
  }

  // Otherwise generate task suggestions from research
  const { data: research } = await supabase.from("project_research")
    .select("topic, notes").eq("id", researchId).single();
  if (!research) return NextResponse.json({ error: "Research not found" }, { status: 404 });

  const { data: existing } = await supabase.from("project_tasks")
    .select("title").eq("project_id", projectId).neq("status", "cancelled");

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 800,
    messages: [{
      role: "user",
      content: `Based on this research, suggest actionable tasks for the project.

Research topic: ${research.topic}
Research notes: ${research.notes}

Existing tasks (avoid duplicates): ${(existing ?? []).map((t: any) => t.title).join(", ") || "none"}

Return ONLY valid JSON array:
[{"title": "...", "description": "...", "priority": 1-4}]
Max 6 tasks. Priority: 1=urgent, 2=high, 3=medium, 4=low.
Tasks must be concrete and actionable, not vague.`
    }],
  });

  const text = response.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
  let suggested = [];
  try {
    const clean = text.replace(/```json|```/g, "").trim();
    suggested = JSON.parse(clean);
  } catch {
    suggested = [];
  }

  // Add research timeline node
  await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/projects/timeline`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId,
      node: { type: "research", label: research.topic, detail: `${suggested.length} tasks suggested` }
    }),
  }).catch(() => {});

  return NextResponse.json({ suggested });
}
