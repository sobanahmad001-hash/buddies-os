/**
 * Tests for /api/clients/[id]  (GET, PUT, DELETE)
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

import { GET, PUT, DELETE } from "@/app/api/clients/[id]/route";

const CLIENT_ID = "client-detail";
const params = Promise.resolve({ id: CLIENT_ID });

describe("GET /api/clients/[id]", () => {
  it("returns 401 for unauthenticated request", async () => {
    mockSb = makeSb({ user: null });
    const res = await GET(makeRequest(`http://localhost/api/clients/${CLIENT_ID}`), { params });
    expect(res.status).toBe(401);
  });

  it("returns client for workspace owner", async () => {
    const client = { id: CLIENT_ID, name: "Acme", workspace_id: "ws-1" };
    mockSb = makeSb({
      fromResults: {
        workspaces: { data: { id: "ws-1" } },
        clients:    { data: client },
      },
    });
    const res = await GET(makeRequest(`http://localhost/api/clients/${CLIENT_ID}`), { params });
    const body = await json(res);
    expect(res.status).toBe(200);
    expect(body.client.name).toBe("Acme");
  });

  it("returns 403 when member has no client_access", async () => {
    mockSb = makeSb({
      fromResults: {
        workspaces:    { data: null },    // not owner
        client_access: { data: null },    // no access granted
      },
    });
    const res = await GET(makeRequest(`http://localhost/api/clients/${CLIENT_ID}`), { params });
    expect(res.status).toBe(403);
  });
});

describe("PUT /api/clients/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    mockSb = makeSb({ user: null });
    const req = makeRequest(`http://localhost/api/clients/${CLIENT_ID}`, {
      method: "PUT",
      body: { name: "Updated Name" },
    });
    const res = await PUT(req, { params });
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not workspace owner", async () => {
    mockSb = makeSb({ fromResults: { workspaces: { data: null } } });
    const req = makeRequest(`http://localhost/api/clients/${CLIENT_ID}`, {
      method: "PUT",
      body: { name: "Updated Name" },
    });
    const res = await PUT(req, { params });
    expect(res.status).toBe(403);
  });

  it("returns 400 when no allowed fields provided", async () => {
    mockSb = makeSb({ fromResults: { workspaces: { data: { id: "ws-1" } } } });
    const req = makeRequest(`http://localhost/api/clients/${CLIENT_ID}`, {
      method: "PUT",
      body: { random_field: "ignored" }, // not an allowed key
    });
    const res = await PUT(req, { params });
    expect(res.status).toBe(400);
  });

  it("updates and returns client for workspace owner", async () => {
    const updated = { id: CLIENT_ID, name: "New Name", workspace_id: "ws-1", industry: "SaaS" };
    mockSb = makeSb({
      fromResults: {
        workspaces: { data: { id: "ws-1" } },
        clients:    { data: updated },
      },
    });
    const req = makeRequest(`http://localhost/api/clients/${CLIENT_ID}`, {
      method: "PUT",
      body: { name: "New Name", industry: "SaaS" },
    });
    const res = await PUT(req, { params });
    const body = await json(res);
    expect(res.status).toBe(200);
    expect(body.client.name).toBe("New Name");
  });
});

describe("DELETE /api/clients/[id]", () => {
  it("returns 403 when not workspace owner", async () => {
    mockSb = makeSb({ fromResults: { workspaces: { data: null } } });
    const req = makeRequest(`http://localhost/api/clients/${CLIENT_ID}`, { method: "DELETE" });
    const res = await DELETE(req, { params });
    expect(res.status).toBe(403);
  });

  it("returns 204 on success", async () => {
    mockSb = makeSb({
      fromResults: {
        workspaces: { data: { id: "ws-1" } },
        clients:    { data: null, error: null },
      },
    });
    const req = makeRequest(`http://localhost/api/clients/${CLIENT_ID}`, { method: "DELETE" });
    const res = await DELETE(req, { params });
    expect(res.status).toBe(204);
  });
});
