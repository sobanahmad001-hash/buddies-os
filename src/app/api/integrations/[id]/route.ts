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

// DELETE /api/integrations/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await sb();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const { error } = await supabase
    .from("integrations")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id); // extra safety on top of RLS

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

/** Mask a secret string: show first 4 + last 4, hide the rest */
function maskSecret(val: string): string {
  if (!val || val.length <= 8) return "****";
  return val.slice(0, 4) + "****" + val.slice(-4);
}
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

// PATCH /api/integrations/[id]  — update name, status, or re-save config with fresh tokens
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await sb();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const updates: Record<string, unknown> = {};
  if (body.name !== undefined)   updates.name   = body.name;
  if (body.status !== undefined) updates.status = body.status;
  // Allow re-saving config (e.g. to update a token) — stored raw, masked in response
  if (body.config !== undefined) updates.config = body.config;

  const { data, error } = await supabase
    .from("integrations")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, type, name, config, status, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ integration: { ...data, config: maskConfig(data.config ?? {}) } });
}
