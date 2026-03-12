import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll(s: any[]) { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } } }
  );
}

// ── Semantic / AI-powered search ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const supabase = await getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { query, filterType, dateRange } = await req.json();
  if (!query?.trim()) return NextResponse.json({ results: [], intent: "", count: 0 });

  // Fetch project names for the AI prompt
  const { data: projects } = await supabase
    .from("projects").select("id, name").eq("user_id", user.id);
  const projectNames = (projects ?? []).map((p: any) => p.name).join(", ") || "none";

  // Ask Claude to parse the natural-language query into structured filters
  let searchParams: any;
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const aiRes = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      temperature: 0,
      messages: [{
        role: "user",
        content: `Convert this search query into structured database filters. Return ONLY valid JSON.

User query: "${query}"
Available projects: ${projectNames}

Return this exact JSON shape:
{
  "tables": ["projects"|"project_tasks"|"decisions"|"project_updates"|"behavior_logs"|"rules"],
  "filters": {
    "project": "name or null",
    "status": "string or null",
    "type": "string or null",
    "verdict": "string or null",
    "date_range": "last_week"|"last_month"|"today"|null,
    "keywords": ["word1"]
  },
  "intent": "one-line description of what they want"
}

Examples:
"Show REL blockers" → {"tables":["project_updates"],"filters":{"project":"REL","type":"blocker","project":null,"status":null,"verdict":null,"date_range":null,"keywords":[]},"intent":"Blockers for REL project"}
"decisions I'm waiting on" → {"tables":["decisions"],"filters":{"verdict":"WAIT","project":null,"status":null,"type":null,"date_range":null,"keywords":[]},"intent":"Pending WAIT decisions"}
"CRM tasks" → {"tables":["project_tasks"],"filters":{"project":"CRM","status":null,"type":null,"verdict":null,"date_range":null,"keywords":[]},"intent":"Tasks for CRM project"}
"exhausted logs last week" → {"tables":["behavior_logs"],"filters":{"date_range":"last_week","keywords":["exhausted"],"project":null,"status":null,"type":null,"verdict":null},"intent":"Exhaustion logs from last week"}`
      }],
    });
    const raw = (aiRes.content[0] as any).text ?? "";
    const match = raw.match(/\{[\s\S]*\}/);
    searchParams = JSON.parse(match ? match[0] : raw);
  } catch (e) {
    // Fall back to simple keyword search across all tables
    searchParams = {
      tables: ["projects", "project_tasks", "decisions", "project_updates", "behavior_logs", "rules"],
      filters: { keywords: [query.trim()], project: null, status: null, type: null, verdict: null, date_range: null },
      intent: `Keyword search for "${query}"`,
    };
  }

  // Override AI-detected tables if a manual filter type was specified
  const tableMap: Record<string, string> = {
    tasks: "project_tasks",
    updates: "project_updates",
    decisions: "decisions",
    behavior_logs: "behavior_logs",
    rules: "rules",
  };
  if (filterType && tableMap[filterType]) {
    searchParams.tables = [tableMap[filterType]];
  }

  // Override AI-detected date range if a manual date filter was specified
  if (dateRange) {
    searchParams.filters = { ...(searchParams.filters ?? {}), date_range: dateRange };
  }

  const dateFrom = (range: string | null): string | null => {
    if (!range) return null;
    const d = new Date();
    if (range === "today") { d.setHours(0, 0, 0, 0); return d.toISOString(); }
    if (range === "last_week") { d.setDate(d.getDate() - 7); return d.toISOString(); }
    if (range === "last_month") { d.setMonth(d.getMonth() - 1); return d.toISOString(); }
    return null;
  };

  const since = dateFrom(searchParams.filters?.date_range ?? null);
  const projectId = searchParams.filters?.project
    ? (projects ?? []).find((p: any) =>
        p.name.toLowerCase().includes(searchParams.filters.project.toLowerCase()) ||
        searchParams.filters.project.toLowerCase().includes(p.name.toLowerCase())
      )?.id ?? null
    : null;

  const items: any[] = [];
  const tables: string[] = searchParams.tables ?? [];

  // Projects
  if (tables.includes("projects")) {
    let q = supabase.from("projects").select("id,name,description,status").eq("user_id", user.id);
    if (projectId) q = q.eq("id", projectId);
    else if (searchParams.filters?.project) q = q.ilike("name", `%${searchParams.filters.project}%`);
    if (searchParams.filters?.status) q = q.eq("status", searchParams.filters.status);
    const { data } = await q.limit(10);
    (data ?? []).forEach((r: any) => items.push({ ...r, _type: "project" }));
  }

  // Tasks
  if (tables.includes("project_tasks")) {
    let q = supabase.from("project_tasks").select("id,title,status,priority,project_id,projects(name)").eq("user_id", user.id);
    if (projectId) q = q.eq("project_id", projectId);
    if (searchParams.filters?.status) q = q.eq("status", searchParams.filters.status);
    if (since) q = q.gte("created_at", since);
    const kws: string[] = searchParams.filters?.keywords ?? [];
    if (kws.length) q = q.ilike("title", `%${kws[0]}%`);
    const { data } = await q.order("created_at", { ascending: false }).limit(15);
    (data ?? []).forEach((r: any) => items.push({ ...r, _type: "task" }));
  }

  // Decisions
  if (tables.includes("decisions")) {
    let q = supabase.from("decisions").select("id,context,verdict,probability,created_at,project_id,projects(name)").eq("user_id", user.id);
    if (projectId) q = q.eq("project_id", projectId);
    if (searchParams.filters?.verdict) q = q.eq("verdict", searchParams.filters.verdict.toUpperCase());
    if (since) q = q.gte("created_at", since);
    const kws: string[] = searchParams.filters?.keywords ?? [];
    if (kws.length) q = q.ilike("context", `%${kws[0]}%`);
    const { data } = await q.order("created_at", { ascending: false }).limit(15);
    (data ?? []).forEach((r: any) => items.push({ ...r, _type: "decision" }));
  }

  // Project updates / blockers
  if (tables.includes("project_updates")) {
    let q = supabase.from("project_updates").select("id,content,update_type,created_at,project_id,projects(name)").eq("user_id", user.id);
    if (projectId) q = q.eq("project_id", projectId);
    if (searchParams.filters?.type) q = q.eq("update_type", searchParams.filters.type);
    if (since) q = q.gte("created_at", since);
    const kws: string[] = searchParams.filters?.keywords ?? [];
    if (kws.length) q = q.ilike("content", `%${kws[0]}%`);
    const { data } = await q.order("created_at", { ascending: false }).limit(15);
    (data ?? []).forEach((r: any) => items.push({ ...r, _type: "update" }));
  }

  // Behavior logs
  if (tables.includes("behavior_logs")) {
    let q = supabase.from("behavior_logs").select("id,mood_tag,stress,sleep_hours,notes,timestamp").eq("user_id", user.id);
    const kws: string[] = searchParams.filters?.keywords ?? [];
    if (kws.length) q = q.ilike("mood_tag", `%${kws[0]}%`);
    if (since) q = q.gte("timestamp", since);
    const { data } = await q.order("timestamp", { ascending: false }).limit(15);
    (data ?? []).forEach((r: any) => items.push({ ...r, _type: "behavior_log" }));
  }

  // Rules
  if (tables.includes("rules")) {
    let q = supabase.from("rules").select("id,rule_text,severity,active").eq("user_id", user.id);
    if (searchParams.filters?.status === "active") q = q.eq("active", true);
    const kws: string[] = searchParams.filters?.keywords ?? [];
    if (kws.length) q = q.ilike("rule_text", `%${kws[0]}%`);
    const { data } = await q.limit(10);
    (data ?? []).forEach((r: any) => items.push({ ...r, _type: "rule" }));
  }

  return NextResponse.json({ query, intent: searchParams.intent ?? "", results: items, count: items.length });
}

// ── Simple keyword GET search (existing) ─────────────────────────────────────
export async function GET(req: NextRequest) {
  const supabase = await getSupabase();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.toLowerCase().trim();
  if (!q || q.length < 2) return NextResponse.json({ projects: [], updates: [], decisions: [], rules: [] });

  const [{ data: projects }, { data: updates }, { data: decisions }, { data: rules }] = await Promise.all([
    supabase.from("projects").select("id, name, description, status").eq("user_id", user.id).ilike("name", `%${q}%`).limit(5),
    supabase.from("project_updates").select("id, content, update_type, created_at, project_id").eq("user_id", user.id).ilike("content", `%${q}%`).order("created_at", { ascending: false }).limit(5),
    supabase.from("decisions").select("id, context, verdict, created_at").eq("user_id", user.id).ilike("context", `%${q}%`).order("created_at", { ascending: false }).limit(5),
    supabase.from("rules").select("id, rule_text, severity, active").eq("user_id", user.id).ilike("rule_text", `%${q}%`).limit(5),
  ]);

  return NextResponse.json({ projects: projects ?? [], updates: updates ?? [], decisions: decisions ?? [], rules: rules ?? [] });
}
