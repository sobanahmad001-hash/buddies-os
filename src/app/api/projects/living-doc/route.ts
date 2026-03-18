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

export async function GET(req: NextRequest) {
  const supabase = await sb();
  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ doc: null });
  const { data } = await supabase.from("project_documents")
    .select("*").eq("project_id", projectId).eq("is_living", true).maybeSingle();
  return NextResponse.json({ doc: data ?? null });
}

export async function POST(req: NextRequest) {
  // Regenerate/update the living product document
  const supabase = await sb();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId } = await req.json();
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  const { data: project } = await supabase.from("projects")
    .select("*").eq("id", projectId).eq("user_id", user.id).single();
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [
    { data: tasks },
    { data: decisions },
    { data: research },
    { data: updates },
    { data: pm },
  ] = await Promise.all([
    supabase.from("project_tasks").select("title, status, priority").eq("project_id", projectId).neq("status", "cancelled"),
    supabase.from("project_decisions").select("title, context, verdict, created_at").eq("project_id", projectId).order("created_at", { ascending: false }).limit(10),
    supabase.from("project_research").select("topic, notes, created_at").eq("project_id", projectId).order("created_at", { ascending: false }).limit(10),
    supabase.from("project_updates").select("content, update_type, created_at").eq("project_id", projectId).order("created_at", { ascending: false }).limit(10),
    supabase.from("ai_project_memory").select("*").eq("project_id", projectId).eq("user_id", user.id).maybeSingle(),
  ]);

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const prompt = `You are updating the Living Product Document for project "${project.name}".

This is a single always-current document that captures what this project is, what's been built, what's been decided, and what's next.

PROJECT DATA:
Name: ${project.name}
Description: ${project.description ?? "n/a"}
Stage: ${pm?.current_stage ?? "active"}
Summary: ${pm?.summary_text ?? "n/a"}

TASKS (${(tasks ?? []).length} total):
Done: ${(tasks ?? []).filter((t: any) => t.status === "done").map((t: any) => t.title).join(", ") || "none"}
In Progress: ${(tasks ?? []).filter((t: any) => t.status === "in_progress").map((t: any) => t.title).join(", ") || "none"}
Todo: ${(tasks ?? []).filter((t: any) => t.status === "todo").map((t: any) => t.title).join(", ") || "none"}

DECISIONS:
${(decisions ?? []).map((d: any) => `- ${d.title ?? d.context}: ${d.verdict ?? "pending"}`).join("\n") || "none"}

RESEARCH:
${(research ?? []).map((r: any) => `- ${r.topic}: ${r.notes?.slice(0, 200)}`).join("\n") || "none"}

RECENT UPDATES:
${(updates ?? []).map((u: any) => `- [${u.update_type}] ${u.content?.slice(0, 150)}`).join("\n") || "none"}

Write a clean, structured Living Product Document in markdown. Sections:
# ${project.name} — Product Document
## What This Is
## Current Stage
## What's Been Built / Done
## Active Decisions
## Research & Insights
## What's Next
## Open Questions

Keep it factual, dense, and current. No padding.`;

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    messages: [{ role: "user", content: prompt }],
  });

  const content = response.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("");

  // Upsert the living doc
  const existing = await supabase.from("project_documents")
    .select("id").eq("project_id", projectId).eq("is_living", true).maybeSingle();

  if (existing.data?.id) {
    await supabase.from("project_documents").update({
      content,
      auto_updated_at: new Date().toISOString(),
    }).eq("id", existing.data.id);
  } else {
    await supabase.from("project_documents").insert({
      project_id: projectId,
      user_id: user.id,
      title: `${project.name} — Living Product Document`,
      content,
      doc_type: "living_product_doc",
      is_living: true,
      source: "ai",
      auto_updated_at: new Date().toISOString(),
    });
  }

  return NextResponse.json({ updated: true, preview: content.slice(0, 300) });
}
