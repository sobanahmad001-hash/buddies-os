import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createActionFingerprint } from "@/lib/ai/action-fingerprint";

type ActionType =
  | "project.create_task"
  | "project.create_decision"
  | "project.create_rule"
  | "project.create_research"
  | "project.create_document"
  | "project.add_update";

interface ActionRequest {
  type: ActionType;
  description: string;
  warning?: string;
  params: Record<string, any>;
}

function extractActionBlock(content: string): ActionRequest | null {
  const match = content.match(/\[BUDDIES_ACTION\]\s*([\s\S]*?)\s*\[\/BUDDIES_ACTION\]/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]);
    if (!parsed?.type || !parsed?.params) return null;
    return parsed as ActionRequest;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(s) {
            s.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const payload = await req.json();
    const action: ActionRequest = payload?.action?.type ? payload.action : payload;
    const sessionId = typeof payload?.sessionId === "string" ? payload.sessionId : null;

    if (!action?.type || !action?.params) {
      return NextResponse.json(
        { error: "Missing action type or params" },
        { status: 400 }
      );
    }

    const projectId = action.params.project_id;
    if (!projectId) {
      return NextResponse.json(
        { error: "Missing project_id in action params" },
        { status: 400 }
      );
    }

    const fingerprint =
      action.params?._fingerprint ||
      createActionFingerprint(action.type, Object.fromEntries(
        Object.entries(action.params || {}).filter(([k]) => k !== "_fingerprint")
      ));

    let recentQuery = supabase
      .from("project_chat_messages")
      .select("content")
      .eq("project_id", projectId)
      .eq("role", "assistant")
      .order("created_at", { ascending: false })
      .limit(30);

    if (sessionId) {
      recentQuery = recentQuery.eq("session_id", sessionId);
    }

    const { data: recentMessages } = await recentQuery;

    const matchedProposal = (recentMessages ?? []).some((m: any) => {
      const content = String(m.content ?? "");
      if (!content.includes("[BUDDIES_ACTION]")) return false;

      const block = extractActionBlock(content);
      if (!block) return false;

      const blockFingerprint =
        block.params?._fingerprint ||
        createActionFingerprint(
          block.type,
          Object.fromEntries(
            Object.entries(block.params || {}).filter(([k]) => k !== "_fingerprint")
          )
        );

      return String(blockFingerprint) === String(fingerprint);
    });

    if (!matchedProposal) {
      return NextResponse.json(
        {
          ok: false,
          status: "failed",
          type: action.type,
          message: "This action proposal is no longer valid in the current thread.",
        },
        { status: 409 }
      );
    }

    // Verify user owns this project
    const { data: project } = await supabase
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .single();

    if (!project) {
      return NextResponse.json(
        { error: "Project not found or not owned by user" },
        { status: 404 }
      );
    }

    let result: any = null;
    let resultId: string | null = null;

    switch (action.type) {
      case "project.create_task":
        {
          const { title, description, priority, due_date, assigned_to } =
            action.params;
          if (!title) {
            return NextResponse.json(
              { error: "Task title is required" },
              { status: 400 }
            );
          }

          const { data: newTask, error: taskError } = await supabase
            .from("project_tasks")
            .insert({
              project_id: projectId,
              user_id: user.id,
              title,
              description: description || null,
              priority: priority || 3,
              due_date: due_date || null,
              assigned_to: assigned_to || null,
              status: "todo",
            })
            .select("id, title, status")
            .single();

          if (taskError) throw taskError;
          result = newTask;
          resultId = newTask?.id;
        }
        break;

      case "project.create_decision":
        {
          const { title, context, verdict, reasoning } = action.params;
          if (!title) {
            return NextResponse.json(
              { error: "Decision title is required" },
              { status: 400 }
            );
          }

          const { data: newDecision, error: decisionError } = await supabase
            .from("project_decisions")
            .insert({
              project_id: projectId,
              user_id: user.id,
              title,
              context: context || title,
              verdict: verdict || null,
              outcome: null,
              reasoning: reasoning || null,
            })
            .select("id, title, verdict")
            .single();

          if (decisionError) throw decisionError;
          result = newDecision;
          resultId = newDecision?.id;
        }
        break;

      case "project.create_rule":
        {
          const { rule_text, severity, context } = action.params;
          if (!rule_text) {
            return NextResponse.json(
              { error: "Rule text is required" },
              { status: 400 }
            );
          }

          const { data: newRule, error: ruleError } = await supabase
            .from("project_rules")
            .insert({
              project_id: projectId,
              user_id: user.id,
              rule_text,
              severity: severity || 2,
              context: context || null,
              active: true,
            })
            .select("id, rule_text, severity")
            .single();

          if (ruleError) throw ruleError;
          result = newRule;
          resultId = newRule?.id;
        }
        break;

      case "project.create_research":
        {
          const { topic, notes, keywords } = action.params;
          if (!topic || !notes) {
            return NextResponse.json(
              { error: "Research topic and notes are required" },
              { status: 400 }
            );
          }

          const { data: newResearch, error: researchError } = await supabase
            .from("project_research")
            .insert({
              project_id: projectId,
              user_id: user.id,
              topic,
              notes,
              keywords: keywords || [],
            })
            .select("id, topic")
            .single();

          if (researchError) throw researchError;
          result = newResearch;
          resultId = newResearch?.id;
        }
        break;

      case "project.create_document":
        {
          const { title, content, doc_type } = action.params;
          if (!title || !content) {
            return NextResponse.json(
              { error: "Document title and content are required" },
              { status: 400 }
            );
          }

          const { data: newDocument, error: documentError } = await supabase
            .from("project_documents")
            .insert({
              project_id: projectId,
              user_id: user.id,
              title,
              content,
              doc_type: doc_type || "document",
            })
            .select("id, title")
            .single();

          if (documentError) throw documentError;
          result = newDocument;
          resultId = newDocument?.id;
        }
        break;

      case "project.add_update":
        {
          const { content, update_type, next_actions } = action.params;
          if (!content) {
            return NextResponse.json(
              { error: "Update content is required" },
              { status: 400 }
            );
          }

          const { data: newUpdate, error: updateError } = await supabase
            .from("project_updates")
            .insert({
              project_id: projectId,
              user_id: user.id,
              content,
              update_type: update_type || "update",
              next_actions: next_actions || [],
            })
            .select("id, update_type")
            .single();

          if (updateError) throw updateError;
          result = newUpdate;
          resultId = newUpdate?.id;
        }
        break;

      default:
        return NextResponse.json(
          { error: `Unknown action type: ${action.type}` },
          { status: 400 }
        );
    }

    // Refresh project memory since we modified data
    try {
      const { data: tasks } = await supabase
        .from("project_tasks")
        .select("title, status, priority, due_date")
        .eq("project_id", projectId);

      const { data: updates } = await supabase
        .from("project_updates")
        .select("content, update_type, next_actions, created_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(20);

      const { data: decisions } = await supabase
        .from("project_decisions")
        .select("title, context, verdict, created_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(20);

      const { data: rules } = await supabase
        .from("project_rules")
        .select("rule_text, severity, active")
        .eq("project_id", projectId)
        .eq("active", true);

      const { data: research } = await supabase
        .from("project_research")
        .select("topic, notes, created_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(10);

      const { data: projectData } = await supabase
        .from("projects")
        .select("id, name, description, memory, status")
        .eq("id", projectId)
        .single();

      // Import buildProjectMemory inline to avoid circular dependency
      const compact = {
        project_name: projectData?.name,
        purpose: projectData?.memory?.split(",")[0] || null,
        current_stage: projectData?.status || null,
        active_priorities: tasks
          ?.filter((t: any) => t.priority === 1)
          .map((t: any) => t.title) || [],
        open_blockers: tasks
          ?.filter((t: any) => t.status === "blocked")
          .map((t: any) => t.title) || [],
        key_decisions: decisions?.map((d: any) => d.title) || [],
        constraints: rules?.map((r: any) => r.rule_text) || [],
        next_steps: updates
          ?.slice(0, 3)
          .map((u: any) => u.next_actions?.[0]) || [],
        summary_text: projectData?.description || null,
        summary_json: {
          tasksCount: tasks?.length || 0,
          openTasksCount:
            tasks?.filter((t: any) => ["open", "in_progress"].includes(t.status))
              .length || 0,
          decisionsCount: decisions?.length || 0,
          rulesCount: rules?.length || 0,
        },
      };

      await supabase
        .from("ai_project_memory")
        .upsert(
          {
            user_id: user.id,
            project_id: projectId,
            ...compact,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,project_id" }
        );
    } catch (memoryErr: any) {
      console.error("[projects/action] memory update failed:", memoryErr?.message ?? memoryErr);
      // Don't fail the whole request if memory update fails
    }

    return NextResponse.json({
      success: true,
      action: action.type,
      result,
      resultId,
      message: `${action.type} action approved and executed successfully.`,
    });
  } catch (err: any) {
    console.error("[projects/action] error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Internal server error" },
      { status: 500 }
    );
  }
}
