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

const DEPT_CONTEXT: Record<string, string> = {
  design:      "UI/UX design, brand identity, visual systems, prototyping, and creative direction",
  development: "software engineering, code architecture, infrastructure, debugging, and technical implementation",
  marketing:   "campaigns, content strategy, SEO, social media, growth, and market analysis",
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await getClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const deptId = req.nextUrl.searchParams.get("deptId");
  if (!deptId) return NextResponse.json({ messages: [] });

  const { data } = await supabase.from("dept_chat_messages")
    .select("id, role, content, created_at")
    .eq("dept_id", deptId).eq("user_id", user.id)
    .order("created_at", { ascending: true }).limit(80);

  return NextResponse.json({ messages: data ?? [] });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await getClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { message, deptId } = await req.json();
  if (!message?.trim() || !deptId) return NextResponse.json({ error: "message and deptId required" }, { status: 400 });

  // Load dept context: projects, tasks, team
  const [projRes, taskRes, memRes, historyRes] = await Promise.all([
    supabase.from("dept_projects").select("name, status, description").eq("dept_id", deptId).eq("status", "active").limit(10),
    supabase.from("dept_project_tasks").select("title, status, priority").eq("dept_id", deptId).neq("status", "cancelled").limit(20),
    supabase.from("memberships").select("role, profiles(full_name)").eq("department_id", deptId).eq("status", "active"),
    supabase.from("dept_chat_messages").select("role, content").eq("dept_id", deptId).eq("user_id", user.id).order("created_at", { ascending: true }).limit(40),
  ]);

  const projects = projRes.data ?? [];
  const tasks    = taskRes.data ?? [];
  const members  = memRes.data ?? [];
  const history  = historyRes.data ?? [];

  const context = `
Department: ${slug.charAt(0).toUpperCase() + slug.slice(1)}
Focus: ${DEPT_CONTEXT[slug] ?? slug}

Active Projects (${projects.length}):
${projects.map(p => `- ${p.name}${p.description ? `: ${p.description}` : ""}`).join("\n") || "No active projects"}

Tasks:
- Todo: ${tasks.filter(t => t.status === "todo").length}
- In Progress: ${tasks.filter(t => t.status === "in_progress").length}
- Done: ${tasks.filter(t => t.status === "done").length}

Team (${members.length} members):
${members.map((m: any) => `- ${(m.profiles as any)?.full_name || "Member"} (${m.role})`).join("\n") || "No members assigned"}
`.trim();

  const systemPrompt = `You are the dedicated AI assistant for the ${slug} department. You help the team with ${DEPT_CONTEXT[slug] ?? slug}.

Current department context:
${context}

Be concise, helpful, and focused on ${slug} department work. When discussing projects or tasks, reference what you know about the team's current work. Help team members think through problems, plan work, and make decisions relevant to the ${slug} department.`;

  // Save user message
  await supabase.from("dept_chat_messages").insert({ dept_id: deptId, user_id: user.id, role: "user", content: message.trim() });

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
    reply = "I'm having trouble connecting right now. Please try again in a moment.";
  }

  // Save assistant reply
  await supabase.from("dept_chat_messages").insert({ dept_id: deptId, user_id: user.id, role: "assistant", content: reply });

  return NextResponse.json({ reply });
}
