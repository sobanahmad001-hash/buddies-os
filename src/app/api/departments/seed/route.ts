import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_WORKSPACE_DEPARTMENTS } from "@/lib/departments";

async function userClient() {
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

const adminClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

// POST /api/departments/seed
// Body: { workspace_id: string }
// Seeds the default departments for a workspace the authenticated user owns.
export async function POST(req: NextRequest) {
  const supabase = await userClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { workspace_id } = await req.json();
  if (!workspace_id) return NextResponse.json({ error: "workspace_id required" }, { status: 400 });

  // Verify the caller owns this workspace
  const { data: ws } = await supabase
    .from("workspaces")
    .select("id")
    .eq("id", workspace_id)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!ws) return NextResponse.json({ error: "Workspace not found or access denied" }, { status: 403 });

  const admin = adminClient();
  const results: Record<string, string> = {};

  for (const dept of DEFAULT_WORKSPACE_DEPARTMENTS) {
    // Check if already exists
    const { data: existing } = await admin
      .from("departments")
      .select("id")
      .eq("workspace_id", workspace_id)
      .eq("slug", dept.slug)
      .maybeSingle();

    if (existing) {
      results[dept.slug] = "already_exists";
      continue;
    }

    const { error } = await admin.from("departments").insert({
      workspace_id,
      name: dept.name,
      slug: dept.slug,
      color: dept.color,
    });

    results[dept.slug] = error ? `error: ${error.message}` : "created";
  }

  return NextResponse.json({ seeded: true, results });
}
