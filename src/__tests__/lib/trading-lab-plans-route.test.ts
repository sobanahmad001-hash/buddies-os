import { POST } from "@/app/api/trading-lab/plans/route";
import { POST as logTrade } from "@/app/api/trading-lab/journal/route";
import { createClient } from "@/lib/supabase/server";
import { makeQuery } from "../helpers/supabaseMock";
import { makeRequest } from "../helpers/requestHelper";
import { planFixture, strategyFixture, testNow } from "../helpers/pretradeFixture";

jest.mock("@/lib/supabase/server", () => ({ createClient: jest.fn() }));
const create = createClient as jest.Mock;
const request = (body = planFixture()) => makeRequest("http://localhost/api/trading-lab/plans", { method: "POST", body });

function client() {
  const versions = makeQuery({ id: planFixture().strategyVersionId, definition: strategyFixture });
  const previous = makeQuery(null);
  const sb = { auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: "owner" } } }) },
    from: jest.fn((table: string) => table === "trading_decisions" ? previous : versions),
    rpc: jest.fn().mockResolvedValue({ data: { id: "lab-id", buddies_decision_id: "shared-id", locked_at: "2026-09-09T10:00:00Z" }, error: null }) };
  create.mockResolvedValue(sb);
  return { sb, versions, previous };
}

describe("Pre-trade capture API", () => {
  beforeEach(() => { jest.spyOn(Date, "now").mockReturnValue(testNow); });
  afterEach(() => jest.restoreAllMocks());
  it("rejects unauthenticated writes", async () => {
    const { sb } = client(); sb.auth.getUser.mockResolvedValue({ data: { user: null } });
    expect((await POST(request())).status).toBe(401); expect(sb.rpc).not.toHaveBeenCalled();
  });
  it("binds the exact version and owner and computes its own assessment", async () => {
    const { sb, versions } = client();
    expect((await POST(request())).status).toBe(201);
    expect(versions.eq).toHaveBeenCalledWith("id", planFixture().strategyVersionId);
    expect(versions.eq).toHaveBeenCalledWith("user_id", "owner");
    expect(sb.rpc).toHaveBeenCalledWith("capture_trading_plan", expect.objectContaining({ p_version_id: planFixture().strategyVersionId, p_assessment: expect.objectContaining({ mode: "manual_assessment", verdict: "REVIEW" }) }));
  });
  it("does not save a missing or inaccessible strategy", async () => {
    const { sb, versions } = client(); versions.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect((await POST(request())).status).toBe(404); expect(sb.rpc).not.toHaveBeenCalled();
  });
  it("does not claim success when atomic persistence fails", async () => {
    const { sb } = client(); sb.rpc.mockResolvedValue({ data: null, error: { code: "42501" } });
    expect((await POST(request())).status).toBe(503);
  });
  it("requires a complete shared-decision receipt", async () => {
    const { sb } = client(); sb.rpc.mockResolvedValue({ data: { id: "only-one-id" }, error: null });
    expect((await POST(request())).status).toBe(503);
  });
  it("returns an existing identical plan on retry even after expiry", async () => {
    const { sb, previous } = client();
    previous.maybeSingle.mockResolvedValue({ data: { id: "lab-id", buddies_decision_id: "shared-id", locked_at: "2026-09-09T10:00:00Z", plan_snapshot: planFixture() }, error: null });
    jest.spyOn(Date, "now").mockReturnValue(testNow + 7200_000);
    expect((await POST(request())).status).toBe(200); expect(sb.rpc).not.toHaveBeenCalled();
  });
  it("refuses changed content under a used request ID", async () => {
    const { sb, previous } = client();
    previous.maybeSingle.mockResolvedValue({ data: { plan_snapshot: { ...planFixture(), entry: 3451 } }, error: null });
    expect((await POST(request())).status).toBe(409); expect(sb.rpc).not.toHaveBeenCalled();
  });
  it("rejects malformed geometry before any data writes", async () => {
    const { sb } = client();
    expect((await POST(request({ ...planFixture(), stopLoss: 3455 }))).status).toBe(400); expect(sb.rpc).not.toHaveBeenCalled();
  });
  it("refuses a journal link to an inaccessible decision", async () => {
    const { sb, previous } = client();
    const response = await logTrade(makeRequest("http://localhost/api/trading-lab/journal", { method: "POST", body: { action: "log", trade: { decision_id: "foreign-id" } } }));
    expect(response.status).toBe(404);
    expect(previous.eq).toHaveBeenCalledWith("user_id", "owner");
    expect(sb.from).not.toHaveBeenCalledWith("trading_entries");
  });
  it("does not create a journal entry if link verification fails", async () => {
    const { sb, previous } = client(); previous.maybeSingle.mockResolvedValue({ data: null, error: { message: "offline" } });
    const response = await logTrade(makeRequest("http://localhost/api/trading-lab/journal", { method: "POST", body: { action: "log", trade: { decision_id: "some-id" } } }));
    expect(response.status).toBe(503); expect(sb.from).not.toHaveBeenCalledWith("trading_entries");
  });
});
