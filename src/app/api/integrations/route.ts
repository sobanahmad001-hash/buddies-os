import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

async function sb() {
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

/** Mask a secret string: show first 4 + last 4, hide the rest */
function maskSecret(val: string): string {
  if (!val || val.length <= 8) return "****";
  return val.slice(0, 4) + "****" + val.slice(-4);
}

/** Return copy of config with all *_key, *_token, *_secret fields masked */
function maskConfig(config: Record<string, string>): Record<string, string> {
  const masked: Record<string, string> = {};
  for (const [k, v] of Object.entries(config)) {
    if (typeof v === "string" && /key|token|secret|password/i.test(k)) {
      masked[k] = maskSecret(v);
    } else {
      masked[k] = v;
    }
  }
  return masked;
}

// GET /api/integrations[?type=]
// Tokens are stored raw in the DB (RLS protects them server-side).
// We mask secrets in the response so they're never exposed to the browser.
export async function GET(req: NextRequest) {
  const supabase = await sb();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let query = supabase
    .from("integrations")
    .select("id, type, name, config, status, user_id, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const typeFilter = req.nextUrl.searchParams.get("type");
  if (typeFilter) query = query.eq("type", typeFilter);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Mask secrets in response — raw tokens stay in DB only
  const safe = (data ?? []).map((row: any) => ({
    ...row,
    config: maskConfig(row.config ?? {}),
  }));

  return NextResponse.json({ integrations: safe });
}

// POST /api/integrations
// Body: { type, name, config: { ... raw secrets ... } }
// Raw tokens are stored in DB (protected by RLS + server-side only).
// The GET response masks them — they are never returned to the browser.
export async function POST(req: NextRequest) {
  const supabase = await sb();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { type, name, config = {} } = body;

  if (!type?.trim() || !name?.trim()) {
    return NextResponse.json({ error: "type and name are required" }, { status: 400 });
  }

  // Store raw config — tokens are usable by server-side execute route.
  // RLS ensures only this user can read their own integrations.
  const { data, error } = await supabase
    .from("integrations")
    .insert({ user_id: user.id, type: type.trim(), name: name.trim(), config })
    .select("id, type, name, config, status, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Return masked config to client
  return NextResponse.json({
    integration: { ...data, config: maskConfig(data.config ?? {}) },
  }, { status: 201 });
}
