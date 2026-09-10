import { assessPlan, planChecks, pretradeSchema } from "@/lib/trading-lab/pretrade";
import { planFixture, strategyFixture, testNow } from "../helpers/pretradeFixture";

describe("Manual pre-trade evidence", () => {
  it("calculates planned RR without inventing a probability or automatic verification", () => {
    expect(assessPlan(planFixture(), strategyFixture, testNow)).toMatchObject({ mode: "manual_assessment", verdict: "REVIEW", rewardRisk: 4, probability: { value: null, source: "human", calibration: "uncalibrated" } });
  });
  it("preserves a zero probability estimate", () => {
    const plan = pretradeSchema.parse({ ...planFixture(), predictedProbability: 0 });
    expect(assessPlan(plan, strategyFixture, testNow).probability.value).toBe(0);
  });
  it("rejects a long plan whose stop lies above entry", () => {
    expect(pretradeSchema.safeParse({ ...planFixture(), stopLoss: 3455 }).success).toBe(false);
  });
  it("validates short-side price ordering", () => {
    expect(pretradeSchema.safeParse({ ...planFixture(), direction: "short" }).success).toBe(false);
    expect(pretradeSchema.safeParse({ ...planFixture(), direction: "short", stopLoss: 3455, takeProfit: 3430 }).success).toBe(true);
  });
  it("requires evidence for a claimed pass or fail", () => {
    const plan = planFixture(); plan.assessments["entry.0"].evidence = " ";
    expect(pretradeSchema.safeParse(plan).success).toBe(false);
  });
  it("preserves ALL/ANY logic without letting a failed safety check pass", () => {
    const plan = planFixture(); plan.assessments["entry.1.1"].status = "fail";
    expect(assessPlan(plan, strategyFixture, testNow).verdict).toBe("REVIEW");
    plan.assessments["safety.news"].status = "fail";
    expect(assessPlan(plan, strategyFixture, testNow).verdict).toBe("NO TRADE");
  });
  it("returns WAIT for a missing mandatory confirmation", () => {
    const plan = planFixture(); delete plan.assessments["entry.0"];
    expect(assessPlan(plan, strategyFixture, testNow)).toMatchObject({ verdict: "WAIT", entryStatus: "unknown" });
  });
  it("returns unknown for an ANY group with a failure and missing alternative", () => {
    const plan = planFixture(); plan.assessments["entry.1.0"].status = "fail"; delete plan.assessments["entry.1.1"];
    expect(assessPlan(plan, strategyFixture, testNow).verdict).toBe("WAIT");
  });
  it("rejects assessments from another version", () => {
    const plan = planFixture(); plan.assessments["entry.99"] = { status: "pass", evidence: "Wrong rule" };
    expect(() => assessPlan(plan, strategyFixture, testNow)).toThrow("does not belong");
  });
  it("rejects an unsupported symbol or direction", () => {
    expect(() => assessPlan({ ...planFixture(), instrument: "EURUSD" }, strategyFixture, testNow)).toThrow("Instrument");
    expect(() => assessPlan({ ...planFixture(), direction: "short" }, strategyFixture, testNow)).toThrow("Direction");
  });
  it("rejects future evidence and expired plans", () => {
    expect(() => assessPlan({ ...planFixture(), observedAt: "2026-09-09T10:05:00Z" }, strategyFixture, testNow)).toThrow("future");
    expect(() => assessPlan({ ...planFixture(), validUntil: "2026-09-09T10:00:00Z" }, strategyFixture, testNow)).toThrow("expired");
  });
  it("keeps actual condition timeframes visible", () => {
    expect(planChecks(strategyFixture, "long")[0].label).toContain("1h");
    expect(planChecks(strategyFixture, "long")[1].label).toContain("5min");
  });
  it("does not accept an already executed trade or a client-supplied verdict", () => {
    expect(pretradeSchema.safeParse({ ...planFixture(), notExecutedYet: false }).success).toBe(false);
    expect(pretradeSchema.safeParse({ ...planFixture(), verdict: "REVIEW" }).success).toBe(false);
  });
});
