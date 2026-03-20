import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import OpenAI from "openai";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { message, history, projectIds, sessionId } = await req.json();
    if (!message) return NextResponse.json({ error: "message required" }, { status: 400 });

    // Load project context if projects selected
    let projectContext = "";
    if (Array.isArray(projectIds) && projectIds.length > 0) {
      const { data: projects } = await supabase
        .from("projects")
        .select("id, name, description, memory")
        .in("id", projectIds)
        .eq("user_id", user.id);

      if (projects?.length) {
        const projectDetails = await Promise.all(projects.map(async (p: any) => {
          const [{ data: tasks }, { data: decisions }, { data: pm }] = await Promise.all([
            supabase.from("project_tasks").select("title, status").eq("project_id", p.id).neq("status", "cancelled").limit(10),
            supabase.from("project_decisions").select("title, verdict").eq("project_id", p.id).limit(5),
            supabase.from("ai_project_memory").select("summary_text, current_stage, open_blockers").eq("project_id", p.id).eq("user_id", user.id).maybeSingle(),
          ]);

          return `PROJECT: ${p.name}
Stage: ${pm?.current_stage ?? "active"}
Summary: ${pm?.summary_text ?? p.description ?? "n/a"}
Open tasks: ${(tasks ?? []).filter((t: any) => t.status !== "done").map((t: any) => t.title).join(", ") || "none"}
Decisions: ${(decisions ?? []).map((d: any) => `${d.title} (${d.verdict ?? "pending"})`).join(", ") || "none"}
Blockers: ${Array.isArray(pm?.open_blockers) ? pm.open_blockers.join(", ") : "none"}`;
        }));

        projectContext = `\nPROJECT CONTEXT (research is linked to these projects):\n${projectDetails.join("\n\n")}`;
      }
    }

    const systemPrompt = `You are a research analyst for Buddies OS. You use real-time web search to find accurate, current information.

RESEARCH APPROACH:
1. Always search the web for current data — never rely on training knowledge for facts, prices, trends, or news
2. Cite your sources with URLs
3. Be analytical, not just descriptive — connect findings to actionable insights
4. When projects are provided, relate findings directly to those projects
5. Extract concrete tasks, decisions, and opportunities from your research
6. Structure responses clearly: findings first, then implications, then suggested actions

OUTPUT FORMAT:
- Lead with the most important finding
- Use numbered lists for multiple findings
- End with 2-3 specific suggested actions or tasks
- Always include source citations
${projectContext}`;

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const inputMessages = [
      ...(Array.isArray(history) ? history.slice(-10) : []),
      { role: "user" as const, content: message },
    ];

    let replyText = "";
    const citations: Array<{ title: string; url: string }> = [];

    try {
      // Use Responses API with web_search_preview tool for grounded results
      const response = await (openai.responses as any).create({
        model: "gpt-4.1",
        tools: [{ type: "web_search_preview" }],
        instructions: systemPrompt,
        input: inputMessages,
      });

      for (const item of response.output ?? []) {
        if (item.type === "message") {
          for (const block of item.content ?? []) {
            if (block.type === "output_text") {
              replyText += block.text ?? "";
              for (const annotation of block.annotations ?? []) {
                if (annotation.type === "url_citation") {
                  citations.push({
                    title: annotation.title ?? annotation.url,
                    url: annotation.url,
                  });
                }
              }
            }
          }
        }
      }
    } catch {
      // Fallback to Chat Completions if Responses API unavailable
    }

    if (!replyText) {
      const fallback = await openai.chat.completions.create({
        model: "gpt-4.1",
        messages: [
          { role: "system", content: systemPrompt },
          ...inputMessages,
        ],
        max_tokens: 2000,
      });
      replyText = fallback.choices[0]?.message?.content ?? "No response.";
    }

    // Parse suggested tasks from response
    const taskMatches = replyText.match(/(?:suggested action|task|recommend|should)[^\n]*[:\-]\s*([^\n]+)/gi) ?? [];
    const suggestedTasks = taskMatches
      .slice(0, 5)
      .map((t: string) => t.replace(/^(?:suggested action|task|recommend|should)[^\n]*[:\-]\s*/i, "").trim())
      .filter((t: string) => t.length > 10 && t.length < 200);

    // Save to research_sessions
    let activeSessionId = sessionId ?? null;
    if (!activeSessionId) {
      const { data: newSession } = await supabase
        .from("research_sessions")
        .insert({
          user_id: user.id,
          topic: message.slice(0, 100),
          status: "complete",
          result: { reply: replyText, citations, suggestedTasks },
          project_id: Array.isArray(projectIds) && projectIds.length > 0 ? projectIds[0] : null,
        })
        .select("id")
        .single();
      activeSessionId = newSession?.id ?? null;
    } else {
      await supabase
        .from("research_sessions")
        .update({ result: { reply: replyText, citations, suggestedTasks }, status: "complete" })
        .eq("id", activeSessionId);
    }

    return NextResponse.json({ reply: replyText, citations, suggestedTasks, sessionId: activeSessionId });
  } catch (err: any) {
    console.error("[research/chat]", err);
    return NextResponse.json({ error: err.message ?? "Internal error" }, { status: 500 });
  }
}
