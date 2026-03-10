import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll(s: any[]) { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ predictions: [] });

  const { data } = await supabase
    .from("predictions")
    .select("*")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .gte("expires_at", new Date().toISOString())
    .order("confidence", { ascending: false });

  return NextResponse.json({ predictions: data ?? [] });
}
