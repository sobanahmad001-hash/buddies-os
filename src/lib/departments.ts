type AnySupabase = any;

export const DEFAULT_WORKSPACE_DEPARTMENTS = [
  { name: "Design", slug: "design", color: "#8B5CF6" },
  { name: "Development", slug: "development", color: "#3B82F6" },
  { name: "Marketing", slug: "marketing", color: "#10B981" },
] as const;

export async function ensureDefaultWorkspaceDepartments(
  supabase: AnySupabase,
  workspaceId: string,
  slugs?: string[]
) {
  const targets = DEFAULT_WORKSPACE_DEPARTMENTS.filter((d) =>
    slugs?.length ? slugs.includes(d.slug) : true
  );
  if (targets.length === 0) return;

  for (const dept of targets) {
    // Try upsert with unique constraint first
    const { error } = await supabase.from("departments").upsert(
      [{ workspace_id: workspaceId, name: dept.name, slug: dept.slug, color: dept.color }],
      { onConflict: "workspace_id,slug", ignoreDuplicates: true }
    );

    if (error) {
      // Constraint may not exist yet — fall back to check-then-insert
      const { data: existing } = await supabase
        .from("departments")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("slug", dept.slug)
        .maybeSingle();
      if (!existing) {
        await supabase.from("departments").insert({
          workspace_id: workspaceId,
          name: dept.name,
          slug: dept.slug,
          color: dept.color,
        });
      }
    }
  }
}

export async function resolveDeptForUser(
  supabase: AnySupabase,
  slug: string,
  userId: string,
  workspaceIdHint?: string
) {
  if (workspaceIdHint) {
    const { data: ownerWs } = await supabase
      .from("workspaces")
      .select("id")
      .eq("id", workspaceIdHint)
      .eq("owner_id", userId)
      .maybeSingle();

    if (!ownerWs) {
      const { data: membership } = await supabase
        .from("memberships")
        .select("id")
        .eq("workspace_id", workspaceIdHint)
        .eq("user_id", userId)
        .eq("status", "active")
        .maybeSingle();
      if (!membership) return { dept: null, workspaceId: null };
    }

    const { data: dept } = await supabase
      .from("departments")
      .select("*")
      .eq("workspace_id", workspaceIdHint)
      .eq("slug", slug)
      .maybeSingle();

    return { dept: dept ?? null, workspaceId: workspaceIdHint };
  }

  const { data: memberships } = await supabase
    .from("memberships")
    .select("workspace_id, department_id, departments(id, slug, name, workspace_id)")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(100);

  const membershipMatch = (memberships ?? []).find((m: any) => m?.departments?.slug === slug);
  if (membershipMatch) {
    return {
      dept: (membershipMatch as any).departments,
      workspaceId: membershipMatch.workspace_id,
    };
  }

  const { data: ownedWorkspaces } = await supabase
    .from("workspaces")
    .select("id")
    .eq("owner_id", userId)
    .limit(100);

  const ownedWorkspaceIds = (ownedWorkspaces ?? []).map((w: any) => w.id).filter(Boolean);
  if (ownedWorkspaceIds.length === 0) return { dept: null, workspaceId: null };

  let deptQuery = supabase.from("departments").select("*").eq("slug", slug);
  if (ownedWorkspaceIds.length === 1) {
    deptQuery = deptQuery.eq("workspace_id", ownedWorkspaceIds[0]);
  } else {
    deptQuery = deptQuery.in("workspace_id", ownedWorkspaceIds);
  }

  const { data: depts } = await deptQuery.limit(1);
  const dept = depts?.[0] ?? null;
  if (!dept) return { dept: null, workspaceId: null };
  return { dept, workspaceId: dept.workspace_id };
}

export async function resolveDeptProjectForUser(
  supabase: AnySupabase,
  slug: string,
  projectId: string,
  userId: string
) {
  const { data: project } = await supabase
    .from("dept_projects")
    .select("*")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) return null;

  const { data: dept } = await supabase
    .from("departments")
    .select("id, slug, workspace_id")
    .eq("id", project.dept_id)
    .maybeSingle();
  if (!dept || dept.slug !== slug) return null;

  const { data: ownerWs } = await supabase
    .from("workspaces")
    .select("id")
    .eq("id", project.workspace_id)
    .eq("owner_id", userId)
    .maybeSingle();
  if (!ownerWs) {
    const { data: membership } = await supabase
      .from("memberships")
      .select("id")
      .eq("workspace_id", project.workspace_id)
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle();
    if (!membership) return null;
  }

  return project;
}
