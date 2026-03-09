import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll(s) { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } } }
  );

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
