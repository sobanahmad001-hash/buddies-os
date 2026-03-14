import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { tavily } from "@tavily/core";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll(s: any[]) { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { topic, variables, project_id } = await req.json();
  if (!topic) return NextResponse.json({ error: "Topic is required" }, { status: 400 });

  // Create session row immediately
  const { data: session, error: insertErr } = await supabase
    .from("research_sessions")
    .insert({ user_id: user.id, topic, variables: variables ?? [], status: "running", project_id: project_id || null })
    .select("id")
    .single();

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  try {
    // Step 1: Web search via Tavily for each variable
    const searchResults: Record<string, any> = {};

    if (process.env.TAVILY_API_KEY) {
      const client = tavily({ apiKey: process.env.TAVILY_API_KEY });
      const queries = (variables ?? [topic]).map((v: string) => `${topic} ${v}`);
      const results = await Promise.all(
        queries.slice(0, 6).map(async (q: string) => {
          try {
            const res = await client.search(q, { maxResults: 3, searchDepth: "basic", includeAnswer: true });
            return { query: q, answer: res.answer ?? "", sources: (res.results ?? []).map((r: any) => ({ title: r.title, url: r.url, content: r.content?.slice(0, 500) })) };
          } catch { return { query: q, answer: "", sources: [] }; }
        })
      );
      results.forEach(r => { searchResults[r.query] = r; });
    }

    // Step 2: AI synthesis
    const searchContext = Object.entries(searchResults)
      .map(([q, r]) => `QUERY: ${q}\nAnswer: ${(r as any).answer}\nSources:\n${((r as any).sources ?? []).map((s: any) => `- ${s.title}: ${s.content?.slice(0, 300)}`).join("\n")}`)
      .join("\n\n");

    const aiPrompt = `You are a research analyst for Buddies OS. Synthesize the following web search results into a structured research report.

TOPIC: ${topic}
VARIABLES TO ANALYZE: ${(variables ?? []).join(", ")}

WEB SEARCH DATA:
${searchContext || "(no web results available)"}

OUTPUT FORMAT:
1. **Executive Summary** — 2-3 sentences
2. **Key Findings** per variable — bullet points with data
3. **Sources** — list URLs
4. **Recommended Actions** — what the user could do next

Be specific, data-driven, concise. No fluff.`;

    let analysis = "";
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        const res = await anthropic.messages.create({
          model: "claude-sonnet-4-5", max_tokens: 4000,
          messages: [{ role: "user", content: aiPrompt }],
        });
        analysis = res.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
      } catch { /* fall through to OpenAI */ }
    }

    if (!analysis && process.env.OPENAI_API_KEY) {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const res = await openai.chat.completions.create({
        model: "gpt-4o-mini", max_tokens: 4000,
        messages: [{ role: "user", content: aiPrompt }],
      });
      analysis = res.choices[0]?.message?.content ?? "";
    }

    if (!analysis) analysis = "No AI provider configured. Raw search data:\n\n" + searchContext;

    const result = {
      analysis,
      searchResults: Object.values(searchResults),
      variables: variables ?? [],
      sources: Object.values(searchResults).flatMap((r: any) => (r.sources ?? []).map((s: any) => s.url)).filter(Boolean),
    };

    // Update session with result
    await supabase
      .from("research_sessions")
      .update({ result, status: "complete" })
      .eq("id", session.id);

    return NextResponse.json({ id: session.id, topic, status: "complete", result, created_at: new Date().toISOString() });
  } catch (err: any) {
    await supabase.from("research_sessions").update({ status: "failed" }).eq("id", session.id);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
