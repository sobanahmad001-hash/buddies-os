/**
 * Tests for /api/marketing/seo  (GET, POST, DELETE)
 */

import { makeSb } from "../helpers/supabaseMock";
import { makeRequest, json } from "../helpers/requestHelper";

let mockSb: ReturnType<typeof makeSb>;

jest.mock("@supabase/ssr", () => ({
  createServerClient: jest.fn(() => mockSb),
}));

jest.mock("next/headers", () => ({
  cookies: jest.fn(() =>
    Promise.resolve({ getAll: () => [], set: () => {} })
  ),
}));

import { GET, POST, DELETE } from "@/app/api/marketing/seo/route";

const CLIENT_ID = "client-abc";

describe("GET /api/marketing/seo", () => {
  it("returns 401 when not authenticated", async () => {
    mockSb = makeSb({ user: null });
    const req = makeRequest(`http://localhost/api/marketing/seo?client_id=${CLIENT_ID}`);
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when client_id is missing", async () => {
    mockSb = makeSb();
    const req = makeRequest("http://localhost/api/marketing/seo");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns metrics list for valid client_id", async () => {
    const metrics = [
      { id: "m1", keyword: "seo agency", ranking: 3, url: null, date: "2026-01-01" },
    ];
    mockSb = makeSb({ fromResults: { seo_metrics: { data: metrics } } });
    const req = makeRequest(`http://localhost/api/marketing/seo?client_id=${CLIENT_ID}`);
    const res = await GET(req);
    const body = await json(res);
    expect(res.status).toBe(200);
    expect(body.metrics).toEqual(metrics);
  });
});

describe("POST /api/marketing/seo", () => {
  it("returns 401 when not authenticated", async () => {
    mockSb = makeSb({ user: null });
    const req = makeRequest("http://localhost/api/marketing/seo", {
      method: "POST",
      body: { client_id: CLIENT_ID, keyword: "test" },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when keyword is missing", async () => {
    mockSb = makeSb();
    const req = makeRequest("http://localhost/api/marketing/seo", {
      method: "POST",
      body: { client_id: CLIENT_ID },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("creates and returns a seo metric", async () => {
    const created = { id: "m2", client_id: CLIENT_ID, keyword: "web design", ranking: 5, url: null, date: "2026-03-12" };
    mockSb = makeSb({ fromResults: { seo_metrics: { data: created } } });
    const req = makeRequest("http://localhost/api/marketing/seo", {
      method: "POST",
      body: { client_id: CLIENT_ID, keyword: "web design", ranking: 5 },
    });
    const res = await POST(req);
    const body = await json(res);
    expect(res.status).toBe(201);
    expect(body.metric).toBeDefined();
    expect(body.metric.keyword).toBe("web design");
  });
});

describe("DELETE /api/marketing/seo", () => {
  it("returns 401 when not authenticated", async () => {
    mockSb = makeSb({ user: null });
    const req = makeRequest("http://localhost/api/marketing/seo", {
      method: "DELETE",
      body: { id: "m1" },
    });
    const res = await DELETE(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when id is missing", async () => {
    mockSb = makeSb();
    const req = makeRequest("http://localhost/api/marketing/seo", {
      method: "DELETE",
      body: {},
    });
    const res = await DELETE(req);
    expect(res.status).toBe(400);
  });

  it("returns 204 on successful delete", async () => {
    mockSb = makeSb({ fromResults: { seo_metrics: { data: null, error: null } } });
    const req = makeRequest("http://localhost/api/marketing/seo", {
      method: "DELETE",
      body: { id: "m1" },
    });
    const res = await DELETE(req);
    expect(res.status).toBe(204);
  });
});
