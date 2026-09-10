import { POST as tradeEvent } from "@/app/api/trading-lab/trades/route";
import { POST as experiment } from "@/app/api/trading-lab/experiments/route";
import { createClient } from "@/lib/supabase/server";
import { makeRequest } from "../helpers/requestHelper";
jest.mock("@/lib/supabase/server", () => ({ createClient: jest.fn() }));
const id = "11111111-1111-4111-8111-111111111111";
const body = { requestId: id, tradeId: id, expectedRevision: 1, kind: "close", payload: { occurredAt: "2026-09-09T11:00:00Z", price: 100, quantity: 1, reason: "Broker exit", pnlAmount: 0, pnlBasis: "broker_net", fees: 0, financing: 0, pnlEvidence: "Statement" } };
function setup(user: unknown = { id: "owner" }) {
  const client = { auth: { getUser: jest.fn().mockResolvedValue({ data: { user } }) }, rpc: jest.fn().mockResolvedValue({ data: { id, lifecycle_revision: 2 }, error: null }), from: jest.fn() };
  (createClient as jest.Mock).mockResolvedValue(client); return client;
}
const request = (value: object) => makeRequest("http://localhost/api/trading-lab/trades", { method: "POST", body: value });
it("rejects unauthenticated experiment and execution actions before any writes", async () => {
  const client = setup(null); expect((await tradeEvent(request(body))).status).toBe(401); expect((await experiment(request({}))).status).toBe(401); expect(client.rpc).not.toHaveBeenCalled();
});
it("passes exact request identity and expected revision to the atomic event transaction", async () => {
  const client = setup(); expect((await tradeEvent(request(body))).status).toBe(200);
  expect(client.rpc).toHaveBeenCalledWith("append_trading_event", { p_request_id: id, p_trade_id: id, p_expected_revision: 1, p_kind: "close", p_payload: body.payload });
});
it("does not claim success on concurrency, ownership or database failures", async () => {
  const client = setup();
  for (const [code, status] of [["40001", 409], ["42501", 403], ["PGRST202", 503]]) {
    client.rpc.mockResolvedValue({ data: null, error: { code, message: "Failure" } }); expect((await tradeEvent(request(body))).status).toBe(status);
  }
});
it("validates event values and rejects caller-supplied outcome calculations", async () => {
  const client = setup(); expect((await tradeEvent(request({ ...body, payload: { ...body.payload, quantity: -1 } }))).status).toBe(400);
  expect((await tradeEvent(request({ ...body, netPnl: 999 }))).status).toBe(400); expect(client.rpc).not.toHaveBeenCalled();
});
it("requires an explicit approved experiment review and a complete trade receipt", async () => {
  const client = setup(); expect((await experiment(request({ action: "review", input: { approved: false } }))).status).toBe(400);
  client.rpc.mockResolvedValue({ data: { id }, error: null }); expect((await tradeEvent(request(body))).status).toBe(503);
});
