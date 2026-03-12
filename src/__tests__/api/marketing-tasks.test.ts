/**
 * Tests for /api/marketing/tasks  (GET, POST, PATCH, DELETE)
 */

import { makeSb } from "../helpers/supabaseMock";
import { makeRequest, json } from "../helpers/requestHelper";

let mockSb: ReturnType<typeof makeSb>;

jest.mock("@supabase/ssr", () => ({
  createServerClient: jest.fn(() => mockSb),
}));
jest.mock("next/headers", () => ({
  cookies: jest.fn(() => Promise.resolve({ getAll: () => [], set: () => {} })),
}));

import { GET, POST, PATCH, DELETE } from "@/app/api/marketing/tasks/route";

const CLIENT_ID = "client-tasks";

describe("GET /api/marketing/tasks", () => {
  it("returns 401 for unauthenticated request", async () => {
    mockSb = makeSb({ user: null });
    const res = await GET(makeRequest(`http://localhost/api/marketing/tasks?client_id=${CLIENT_ID}`));
    expect(res.status).toBe(401);
  });

  it("returns 400 when client_id missing", async () => {
    mockSb = makeSb();
    const res = await GET(makeRequest("http://localhost/api/marketing/tasks"));
    expect(res.status).toBe(400);
  });

  it("returns tasks for a valid client", async () => {
    const tasks = [
      { id: "t1", task_description: "Set up GA4", status: "in_progress", priority: "high" },
      { id: "t2", task_description: "Write blog post",  status: "completed",  priority: "medium" },
    ];
    mockSb = makeSb({ fromResults: { marketing_tasks: { data: tasks } } });
    const res = await GET(
      makeRequest(`http://localhost/api/marketing/tasks?client_id=${CLIENT_ID}`)
    );
    const body = await json(res);
    expect(res.status).toBe(200);
    expect(body.tasks).toHaveLength(2);
  });

  it("filters by status when ?status= provided", async () => {
    const tasks = [{ id: "t1", task_description: "Only completed", status: "completed", priority: "low" }];
    mockSb = makeSb({ fromResults: { marketing_tasks: { data: tasks } } });
    const res = await GET(
      makeRequest(`http://localhost/api/marketing/tasks?client_id=${CLIENT_ID}&status=completed`)
    );
    const body = await json(res);
    expect(body.tasks[0].status).toBe("completed");
  });
});

describe("POST /api/marketing/tasks", () => {
  it("returns 400 when task_description is missing", async () => {
    mockSb = makeSb();
    const res = await POST(
      makeRequest("http://localhost/api/marketing/tasks", {
        method: "POST",
        body: { client_id: CLIENT_ID },
      })
    );
    expect(res.status).toBe(400);
  });

  it("creates task with default priority=medium and status=in_progress", async () => {
    const created = {
      id: "t3",
      client_id: CLIENT_ID,
      task_description: "Write landing page copy",
      assigned_to: null,
      due_date: null,
      status: "in_progress",
      priority: "medium",
      category: null,
    };
    mockSb = makeSb({ fromResults: { marketing_tasks: { data: created } } });
    const res = await POST(
      makeRequest("http://localhost/api/marketing/tasks", {
        method: "POST",
        body: { client_id: CLIENT_ID, task_description: "Write landing page copy" },
      })
    );
    const body = await json(res);
    expect(res.status).toBe(201);
    expect(body.task.status).toBe("in_progress");
    expect(body.task.priority).toBe("medium");
  });

  it("creates task with high priority when specified", async () => {
    const created = {
      id: "t4",
      client_id: CLIENT_ID,
      task_description: "Fix critical bug",
      status: "in_progress",
      priority: "high",
      category: "dev",
    };
    mockSb = makeSb({ fromResults: { marketing_tasks: { data: created } } });
    const res = await POST(
      makeRequest("http://localhost/api/marketing/tasks", {
        method: "POST",
        body: { client_id: CLIENT_ID, task_description: "Fix critical bug", priority: "high", category: "dev" },
      })
    );
    const body = await json(res);
    expect(body.task.priority).toBe("high");
    expect(body.task.category).toBe("dev");
  });
});

describe("PATCH /api/marketing/tasks", () => {
  it("returns 400 when id is missing", async () => {
    mockSb = makeSb();
    const res = await PATCH(
      makeRequest("http://localhost/api/marketing/tasks", {
        method: "PATCH",
        body: { status: "completed" },
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns { updated: true } on success", async () => {
    mockSb = makeSb({ fromResults: { marketing_tasks: { data: null, error: null } } });
    const res = await PATCH(
      makeRequest("http://localhost/api/marketing/tasks", {
        method: "PATCH",
        body: { id: "t1", status: "completed" },
      })
    );
    const body = await json(res);
    expect(res.status).toBe(200);
    expect(body.updated).toBe(true);
  });
});

describe("DELETE /api/marketing/tasks", () => {
  it("returns 204 on successful delete", async () => {
    mockSb = makeSb({ fromResults: { marketing_tasks: { data: null, error: null } } });
    const res = await DELETE(
      makeRequest("http://localhost/api/marketing/tasks", {
        method: "DELETE",
        body: { id: "t1" },
      })
    );
    expect(res.status).toBe(204);
  });
});
