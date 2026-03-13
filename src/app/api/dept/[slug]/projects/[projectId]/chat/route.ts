import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function getClient() {
  const c = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return c.getAll(); }, setAll(s: any[]) { s.forEach(({ name, value, options }) => c.set(name, value, options)); } } }
  );
}

async function resolveDept(supabase: any, slug: string, userId: string) {
  const { data: ownedWs } = await supabase.from("workspaces").select("id").eq("owner_id", userId).maybeSingle();
  if (ownedWs) {
    const { data: dept } = await supabase.from("departments").select("*").eq("workspace_id", ownedWs.id).eq("slug", slug).maybeSingle();
    return { dept, workspaceId: ownedWs.id };
  }
  const { data: mem } = await supabase
    .from("memberships")
    .select("workspace_id, department_id, departments(id, slug, name, workspace_id)")
    .eq("user_id", userId).eq("status", "active").maybeSingle();
  if (!mem) return { dept: null, workspaceId: null };
  const dept = (mem as any).departments;
  if (!dept || dept.slug !== slug) return { dept: null, workspaceId: null };
  return { dept, workspaceId: mem.workspace_id };
}

const DEPT_CONTEXT: Record<string, string> = {
  design:      "UI/UX design, brand identity, visual systems, and creative direction",
  development: "software engineering, code architecture, infrastructure, and technical implementation",
  marketing:   "campaigns, content strategy, SEO, social media, and growth",
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string; projectId: string }> }) {
  const { slug, projectId } = await params;
  const supabase = await getClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { dept } = await resolveDept(supabase, slug, user.id);
  if (!dept) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data } = await supabase.from("dept_project_chat_messages")
    .select("id, role, content, created_at")
    .eq("dept_project_id", projectId).eq("user_id", user.id)
    .order("created_at", { ascending: true }).limit(80);

  return NextResponse.json({ messages: data ?? [] });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string; projectId: string }> }) {
  const { slug, projectId } = await params;
  const supabase = await getClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { dept } = await resolveDept(supabase, slug, user.id);
  if (!dept) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { message } = await req.json();
  if (!message?.trim()) return NextResponse.json({ error: "message required" }, { status: 400 });

  // Load project context in parallel
  const [projRes, taskRes, decisionsRes, rulesRes, researchRes, historyRes] = await Promise.all([
    supabase.from("dept_projects").select("name, description, status").eq("id", projectId).single(),
    supabase.from("dept_project_tasks").select("title, status, priority").eq("dept_project_id", projectId).neq("status", "cancelled").limit(20),
    supabase.from("dept_project_decisions").select("title, verdict").eq("dept_project_id", projectId).order("created_at", { ascending: false }).limit(5),
    supabase.from("dept_project_rules").select("rule_text, severity").eq("dept_project_id", projectId).eq("active", true).limit(10),
    supabase.from("dept_project_research").select("topic, notes").eq("dept_project_id", projectId).order("created_at", { ascending: false }).limit(5),
    supabase.from("dept_project_chat_messages").select("role, content").eq("dept_project_id", projectId).eq("user_id", user.id).order("created_at", { ascending: true }).limit(40),
  ]);

  const project  = projRes.data;
  const tasks    = taskRes.data ?? [];
  const decisions = decisionsRes.data ?? [];
  const rules    = rulesRes.data ?? [];
  const research = researchRes.data ?? [];
  const history  = historyRes.data ?? [];

  const systemPrompt = `You are the AI assistant for the project "${project?.name}" in the ${slug} department (${DEPT_CONTEXT[slug] ?? slug}).

Project: ${project?.name} — ${project?.description ?? "No description"} (Status: ${project?.status})

Tasks:
${tasks.map(t => `- [${t.status}] ${t.title} (${t.priority})`).join("\n") || "No tasks yet"}

Active Rules:
${rules.map((r, i) => `${i + 1}. [Severity ${r.severity}] ${r.rule_text}`).join("\n") || "No rules"}

Recent Decisions:
${decisions.map(d => `- ${d.title}${d.verdict ? `: ${d.verdict}` : ""}`).join("\n") || "No decisions"}

Research Notes:
${research.map(r => `- ${r.topic}: ${r.notes.slice(0, 100)}`).join("\n") || "None"}

Help the team with project planning, technical questions, decision-making, and problem-solving for this project.`;

  // Save user message
  await supabase.from("dept_project_chat_messages").insert({
    dept_project_id: projectId,
    user_id: user.id,
    role: "user",
    content: message.trim(),
  });

  let reply = "";
  try {
    const aiMessages = [
      ...history.map((h: any) => ({ role: h.role as "user" | "assistant", content: h.content })),
      { role: "user" as const, content: message.trim() },
    ];
    const response = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 1024,
      system: systemPrompt,
      messages: aiMessages,
    });
    reply = (response.content[0] as any).text ?? "";
  } catch {
    reply = "I'm having trouble connecting right now. Please try again.";
  }

  await supabase.from("dept_project_chat_messages").insert({
    dept_project_id: projectId,
    user_id: user.id,
    role: "assistant",
    content: reply,
  });

  return NextResponse.json({ reply });
}
