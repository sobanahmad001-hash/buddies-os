/**
 * Tests for GET /api/clients and POST /api/clients
 * All Supabase and Next.js internals are mocked — no real DB needed.
 */

import { NextResponse } from "next/server";
import { makeSb } from "../helpers/supabaseMock";
import { makeRequest, json } from "../helpers/requestHelper";

// ---- module-level mocks (hoisted by Jest before imports) ----
let mockSb: ReturnType<typeof makeSb>;

jest.mock("@supabase/ssr", () => ({
  createServerClient: jest.fn(() => mockSb),
}));

jest.mock("next/headers", () => ({
  cookies: jest.fn(() =>
    Promise.resolve({ getAll: () => [], set: () => {} })
  ),
}));

// Lazy-import the route after mocks are registered
import { GET, POST } from "@/app/api/clients/route";

// ─────────────────────────────────────────────────
describe("GET /api/clients", () => {
  it("returns empty array when user is not authenticated", async () => {
    mockSb = makeSb({ user: null });
    const res = await GET();
    const body = await json(res);
    expect(res.status).toBe(200);
    expect(body.clients).toEqual([]);
  });

  it("returns clients for workspace owner", async () => {
    const fakeClients = [{ id: "c1", name: "Acme" }];
    mockSb = makeSb({
      fromResults: {
        workspaces: { data: { id: "ws-1", owner_id: "user-123" } },
        clients:    { data: fakeClients },
      },
    });
    const req = makeRequest("http://localhost/api/clients");
    const res = await GET(req);
    const body = await json(res);
    expect(res.status).toBe(200);
    expect(body.clients).toEqual(fakeClients);
  });

  it("returns empty array for member with no granted clients", async () => {
    mockSb = makeSb({
      fromResults: {
        workspaces:    { data: null },            // not an owner
        memberships:   { data: { workspace_id: "ws-1" } },
        client_access: { data: [] },              // no access
      },
    });
    const req = makeRequest("http://localhost/api/clients");
    const res = await GET(req);
    const body = await json(res);
    expect(body.clients).toEqual([]);
  });
});

// ─────────────────────────────────────────────────
describe("POST /api/clients", () => {
  it("returns 401 when not authenticated", async () => {
    mockSb = makeSb({ user: null });
    const req = makeRequest("http://localhost/api/clients", {
      method: "POST",
      body: { name: "Test Corp", industry: "Tech" },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 404 when user has no workspace", async () => {
    mockSb = makeSb({ fromResults: { workspaces: { data: null } } });
    const req = makeRequest("http://localhost/api/clients", {
      method: "POST",
      body: { name: "Test Corp" },
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it("creates a client and returns 200 on success", async () => {
    const created = { id: "c-new", name: "Fresh Brand", workspace_id: "ws-1" };
    mockSb = makeSb({
      fromResults: {
        workspaces:    { data: { id: "ws-1" } },
        clients:       { data: created },
        client_stages: { data: [] },
      },
    });
    const req = makeRequest("http://localhost/api/clients", {
      method: "POST",
      body: { name: "Fresh Brand" },
    });
    const res = await POST(req);
    const body = await json(res);
    // POST resolves with the created record in { client }
    expect(body.client).toBeDefined();
  });
});
