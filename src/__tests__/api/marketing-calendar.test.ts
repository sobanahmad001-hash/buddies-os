/**
 * Tests for /api/marketing/calendar  (GET, POST, PATCH, DELETE)
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

import { GET, POST, PATCH, DELETE } from "@/app/api/marketing/calendar/route";

const CLIENT_ID = "client-xyz";

describe("GET /api/marketing/calendar", () => {
  it("returns 401 for unauthenticated request", async () => {
    mockSb = makeSb({ user: null });
    const res = await GET(makeRequest(`http://localhost/api/marketing/calendar?client_id=${CLIENT_ID}`));
    expect(res.status).toBe(401);
  });

  it("returns 400 when client_id is absent", async () => {
    mockSb = makeSb();
    const res = await GET(makeRequest("http://localhost/api/marketing/calendar"));
    expect(res.status).toBe(400);
  });

  it("returns events array sorted by scheduled_date", async () => {
    const events = [
      { id: "e1", title: "Blog post", scheduled_date: "2026-04-01", status: "pending" },
      { id: "e2", title: "Instagram reel", scheduled_date: "2026-04-08", status: "pending" },
    ];
    mockSb = makeSb({ fromResults: { content_calendar: { data: events } } });
    const res = await GET(makeRequest(`http://localhost/api/marketing/calendar?client_id=${CLIENT_ID}`));
    const body = await json(res);
    expect(res.status).toBe(200);
    expect(body.events).toHaveLength(2);
    expect(body.events[0].title).toBe("Blog post");
  });
});

describe("POST /api/marketing/calendar", () => {
  it("returns 400 when required fields are missing", async () => {
    mockSb = makeSb();
    const res = await POST(
      makeRequest("http://localhost/api/marketing/calendar", {
        method: "POST",
        body: { client_id: CLIENT_ID }, // missing title + scheduled_date
      })
    );
    expect(res.status).toBe(400);
  });

  it("creates and returns the calendar event", async () => {
    const created = {
      id: "e3",
      client_id: CLIENT_ID,
      title: "Email newsletter",
      content_type: "email",
      platform: null,
      scheduled_date: "2026-04-15",
      status: "pending",
      notes: null,
    };
    mockSb = makeSb({ fromResults: { content_calendar: { data: created } } });
    const res = await POST(
      makeRequest("http://localhost/api/marketing/calendar", {
        method: "POST",
        body: { client_id: CLIENT_ID, title: "Email newsletter", scheduled_date: "2026-04-15" },
      })
    );
    const body = await json(res);
    expect(res.status).toBe(201);
    expect(body.event.title).toBe("Email newsletter");
    expect(body.event.status).toBe("pending");
  });
});

describe("PATCH /api/marketing/calendar", () => {
  it("returns 400 when id is missing", async () => {
    mockSb = makeSb();
    const res = await PATCH(
      makeRequest("http://localhost/api/marketing/calendar", {
        method: "PATCH",
        body: { status: "published" },
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 200 with { updated: true } on success", async () => {
    mockSb = makeSb({ fromResults: { content_calendar: { data: null, error: null } } });
    const res = await PATCH(
      makeRequest("http://localhost/api/marketing/calendar", {
        method: "PATCH",
        body: { id: "e1", status: "published" },
      })
    );
    const body = await json(res);
    expect(res.status).toBe(200);
    expect(body.updated).toBe(true);
  });
});

describe("DELETE /api/marketing/calendar", () => {
  it("returns 204 on successful delete", async () => {
    mockSb = makeSb({ fromResults: { content_calendar: { data: null, error: null } } });
    const res = await DELETE(
      makeRequest("http://localhost/api/marketing/calendar", {
        method: "DELETE",
        body: { id: "e1" },
      })
    );
    expect(res.status).toBe(204);
  });
});
