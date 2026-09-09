import { experimentSchema } from "@/lib/trading-lab/experiment";
import { experimentMetrics, performance, executionChecks, type LabTrade } from "@/lib/trading-lab/experiment-metrics";
import { netPnl, tradeEventSchema, tradeReviewSchema, reviewQuestions } from "@/lib/trading-lab/lifecycle";
import { readAll } from "@/lib/trading-lab/manual-data";

const id = "11111111-1111-4111-8111-111111111111";
const protocol = experimentSchema.parse({ requestId: id, strategyVersionId: id, name: "Gold sample", hypothesis: "Confirmation adds value", session: "London", timezone: "Europe/London", targetSample: 20, eligibility: "All qualifying", invalidation: "No confirmation", stopConditions: "Loss limit", reviewCriteria: "Evaluate expectancy", riskCurrency: "USD", riskAmount: 10, entryTolerance: 1, protectionTolerance: 0, quantityTolerancePct: 0, approved: true });
const review = () => tradeReviewSchema.parse({ findings: Object.fromEntries(reviewQuestions.map(k => [k, { status: "pass", evidence: "Manual evidence" }])), strategyReference: { r: null, evidence: "" }, frozenPlanReference: { r: null, evidence: "" }, probabilityOutcome: "unresolved", probabilityObservedAt: null, probabilityEvidence: "", behaviors: [], lesson: "Keep sample rules fixed", nextAction: "Continue sample" });
function trade(key: string, r: number, time: string): LabTrade {
  return { id: key, decision_id: key, status: "closed", opened_at: "2026-09-09T10:01:00Z", closed_at: time, lifecycle_revision: 2,
    open_snapshot: { price: 101, quantity: 1, stopLoss: 95, takeProfit: 120, occurredAt: "2026-09-09T10:01:00Z" }, close_snapshot: {}, review_snapshot: null,
    net_pnl: r * 10, planned_risk_amount: 10, locked_at: "2026-09-09T10:00:00Z", plan_snapshot: { entry: 100, stopLoss: 95, takeProfit: 120, quantity: 1, predictedProbability: null, validUntil: "2026-09-09T12:00:00Z" }, assessment_snapshot: { checks: [{ label: "Confirmation", status: "pass" }] } };
}
describe("Manual sample measurement", () => {
  it("uses chronological closed-trade drawdown rather than display order", () => {
    const m = performance([{ id: "3", r: 1, time: "03" }, { id: "1", r: 3, time: "01" }, { id: "2", r: -2, time: "02" }]);
    expect(m.totalR).toBe(2); expect(m.closedTradeDrawdownR).toBe(2); expect(m.profitFactor).toBe(2); expect(m.curve.map(p => p.id)).toEqual(["1", "2", "3"]);
  });
  it("includes breakevens in the win-rate denominator and avoids invented ratios", () => {
    const m = performance([{ id: "1", r: 2, time: "01" }, { id: "2", r: 0, time: "02" }]);
    expect(m.winRate).toBe(50); expect(m.breakevens).toBe(1); expect(m.profitFactor).toBeNull(); expect(m.realizedPayoff).toBeNull(); expect(m.noLosses).toBe(true);
    expect(performance([]).expectancyR).toBeNull();
  });
  it("distinguishes broker net from gross P&L with signed financing", () => {
    expect(netPnl({ pnlAmount: 0, pnlBasis: "broker_net", fees: 2, financing: -1 })).toBe(0);
    expect(netPnl({ pnlAmount: 20, pnlBasis: "gross", fees: 2, financing: -1 })).toBe(17);
    expect(netPnl({ pnlAmount: 20, pnlBasis: "gross", fees: 2, financing: 1 })).toBe(19);
  });
  it("pairs actual and plan results only on the same trades and fixed planned risk", () => {
    const a = trade("a", 2, "2026-09-09T11:00:00Z"), b = trade("b", -1, "2026-09-09T11:01:00Z");
    a.review_snapshot = review(); a.review_snapshot.frozenPlanReference = { r: 4, evidence: "Reconstructed" };
    const m = experimentMetrics(protocol, [a, b], []);
    expect(m.actual.totalR).toBe(1); expect(m.frozenPlanReference.count).toBe(1);
    expect(m.paired).toEqual({ count: 1, actualR: 2, planR: 4, actualMinusPlanR: -2 });
    expect(m.strategyReference.count).toBe(0); expect(m.evidenceStatus).toBe("insufficient");
  });
  it("does not equate a profitable violation with good execution", () => {
    const t = trade("a", 4, "2026-09-09T11:00:00Z"); t.open_snapshot.price = 103;
    expect(executionChecks(t, protocol).score).toBeNull();
    t.review_snapshot = review(); t.review_snapshot.findings.strategyFollowed = { status: "fail", evidence: "Early entry" };
    t.review_snapshot.findings.managementFollowed = { status: "fail", evidence: "Moved stop" };
    t.review_snapshot.behaviors = [{ type: "early_entry", evidence: "Skipped confirmation", ruleId: null }];
    const m = experimentMetrics(protocol, [t], []);
    expect(m.execution.score).toBeLessThan(100); expect(m.compliance.rate).toBe(0); expect(m.behavior[0].associatedNetR).toBe(4);
  });
  it("resolves the specified probability event without substituting profitability or 50%", () => {
    const zero = trade("zero", 2, "2026-09-09T11:00:00Z"), unknown = trade("unknown", -1, "2026-09-09T11:01:00Z"), late = trade("late", 2, "2026-09-09T11:02:00Z");
    for (const t of [zero, unknown, late]) { t.review_snapshot = review(); t.review_snapshot.probabilityOutcome = "stop_first"; }
    zero.plan_snapshot.predictedProbability = 0; late.plan_snapshot.predictedProbability = 50; late.open_snapshot.occurredAt = "2026-09-09T09:00:00Z";
    const m = experimentMetrics(protocol, [zero, unknown, late], []);
    expect(m.probability).toEqual({ count: 1, brier: 0, averagePrediction: 0, actualEventRate: 0 }); expect(m.hindsightOrExpired).toBe(1);
  });
  it("includes zero-setup observation periods in coverage", () => {
    const m = experimentMetrics(protocol, [], [
      { started_at: "2026-09-09T08:00:00Z", ended_at: "2026-09-09T09:00:00Z", qualifying_setups: 0, taken_setups: 0 },
      { started_at: "2026-09-09T09:00:00Z", ended_at: "2026-09-09T10:00:00Z", qualifying_setups: 4, taken_setups: 1 },
    ]);
    expect(m.coverage).toEqual({ sessions: 2, hours: 2, qualifyingSetups: 4, takenSetups: 1, missedSetups: 3, setupsPerHour: 2 });
  });
  it("requires explicit reference evidence, review evidence and real approval", () => {
    expect(tradeReviewSchema.safeParse({ ...review(), strategyReference: { r: 4, evidence: "" } }).success).toBe(false);
    expect(experimentSchema.safeParse({ ...protocol, approved: false }).success).toBe(false);
    expect(experimentSchema.safeParse({ ...protocol, timezone: "not-a-timezone" }).success).toBe(false);
    expect(tradeEventSchema.safeParse({ requestId: id, tradeId: id, expectedRevision: 1, kind: "close", payload: { occurredAt: "2026-09-09T11:00:00Z", price: 100, quantity: 1, reason: "Broker exit", pnlAmount: 0, pnlBasis: "broker_net", fees: 0, financing: 0, pnlEvidence: "Statement" } }).success).toBe(true);
  });
  it("loads all database pages and refuses a partial result on error", async () => {
    const q = { range: jest.fn().mockResolvedValueOnce({ data: Array(500).fill({ id }), error: null }).mockResolvedValueOnce({ data: [{ id: "last" }], error: null }) };
    expect((await readAll(q)).length).toBe(501); expect(q.range).toHaveBeenLastCalledWith(500, 999);
    await expect(readAll({ range: jest.fn().mockResolvedValue({ data: null, error: {} }) })).rejects.toThrow("could not be loaded");
  });
});
