import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { buildProjectMemory } from "@/lib/ai/project-memory";
import { callAIProvider } from "@/lib/ai/providers";

async function getSupabase() {
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

export type PlanStep = {
  step_number: number;
  title: string;
  description: string;
  type: "research" | "code" | "command" | "decision" | "review";
  estimated_effort: "small" | "medium" | "large";
};

export async function POST(req: NextRequest) {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, taskId, taskTitle, taskDescription } = await req.json();
  if (!projectId || !taskTitle) {
    return NextResponse.json({ error: "projectId and taskTitle are required" }, { status: 400 });
  }

  // Fetch project data for memory context
  const [{ data: project }, { data: tasks }, { data: decisions }, { data: rules }, { data: research }] =
    await Promise.all([
      supabase.from("projects").select("id,name,description,memory,status").eq("id", projectId).single(),
      supabase.from("project_tasks").select("title,status,priority,due_date").eq("project_id", projectId),
      supabase.from("project_decisions").select("title,context,verdict,created_at").eq("project_id", projectId),
      supabase.from("project_rules").select("rule_text,severity,active").eq("project_id", projectId),
      supabase.from("project_research").select("topic,notes,created_at").eq("project_id", projectId),
    ]);

  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  // Build project memory context
  const projectMemory = buildProjectMemory({
    project,
    tasks: tasks ?? [],
    decisions: decisions ?? [],
    rules: rules ?? [],
    research: research ?? [],
  });

  // Fetch the full task if taskId provided
  let fullTask = { title: taskTitle, description: taskDescription ?? "" };
  if (taskId) {
    const { data } = await supabase
      .from("project_tasks")
      .select("title, description, priority, status")
      .eq("id", taskId)
      .single();
    if (data) fullTask = { title: data.title, description: data.description ?? "" };
  }

  const systemPrompt = `You are a senior engineering and product planning assistant embedded in Buddies OS.
Your job is to decompose a task into a clear, ordered execution plan that a developer (and a coding agent) can follow step-by-step.

${projectMemory}

RULES:
- Return a JSON object with a single key "steps" containing an array of plan steps.
- Each step has: step_number (int, 1-based), title (short, action-oriented), description (detailed instructions), type ("research"|"code"|"command"|"decision"|"review"), estimated_effort ("small"|"medium"|"large").
- Produce between 3 and 10 steps depending on task complexity.
- Be specific and technical — mention filenames, APIs, function names where relevant.
- type "command" = shell/CLI operations; type "code" = writing/editing source files; type "research" = investigate/gather info; type "decision" = requires human judgment; type "review" = test/verify.
- Return ONLY valid JSON, no prose before or after.`;

  const userMessage = `Generate an execution plan for this task:

Title: ${fullTask.title}
${fullTask.description ? `Description: ${fullTask.description}` : ""}

Break it down into ordered, actionable steps.`;

  const result = await callAIProvider({
    provider: (process.env.AI_PROVIDER as any) ?? "anthropic",
    model: process.env.AI_MODEL ?? "claude-haiku-4-5-20251001",
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
    maxTokens: 2000,
  });

  // Parse the JSON from the AI response
  let steps: PlanStep[] = [];
  try {
    const parsed = JSON.parse(result.text);
    steps = Array.isArray(parsed) ? parsed : (parsed.steps ?? []);
  } catch {
    // Try extracting JSON object from the response
    const match = result.text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        steps = parsed.steps ?? [];
      } catch {
        return NextResponse.json({ error: "Failed to parse plan from AI" }, { status: 500 });
      }
    } else {
      return NextResponse.json({ error: "Failed to parse plan from AI" }, { status: 500 });
    }
  }

  return NextResponse.json({ steps, taskTitle: fullTask.title, taskDescription: fullTask.description });
}
