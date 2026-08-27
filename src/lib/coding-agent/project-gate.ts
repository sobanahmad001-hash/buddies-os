export async function requireCodingAgentProject(supabase: any, userId: string, projectId: unknown) {
  if (typeof projectId !== "string" || !projectId.trim()) {
    throw new Error("Select a project with Coding Agent enabled before creating write-capable work.");
  }
  const { data, error } = await supabase.from("projects")
    .select("id,coding_agent_enabled")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Project not found or access denied.");
  if (!data.coding_agent_enabled) throw new Error("Coding Agent is disabled for this project.");
  return data;
}
