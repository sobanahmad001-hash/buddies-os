import { requireCodingAgentProject } from "@/lib/coding-agent/project-gate";

function client(result: { data: unknown; error: unknown }) {
  const chain: any = { select: () => chain, eq: () => chain, maybeSingle: async () => result };
  return { from: () => chain };
}

describe("Coding Agent project gate", () => {
  test("requires a project context", async () => {
    await expect(requireCodingAgentProject(client({ data: null, error: null }), "user-1", null)).rejects.toThrow("Select a project");
  });

  test("refuses disabled projects", async () => {
    await expect(requireCodingAgentProject(client({ data: { id: "project-1", coding_agent_enabled: false }, error: null }), "user-1", "project-1")).rejects.toThrow("disabled");
  });

  test("allows an owned enabled project", async () => {
    await expect(requireCodingAgentProject(client({ data: { id: "project-1", coding_agent_enabled: true }, error: null }), "user-1", "project-1")).resolves.toEqual({ id: "project-1", coding_agent_enabled: true });
  });
});
