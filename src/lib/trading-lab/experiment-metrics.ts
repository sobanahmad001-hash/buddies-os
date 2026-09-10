import { analysisContribution } from "./analysis-evidence";
import type { ExperimentProtocol } from "./experiment";
import type { TradeReview } from "./lifecycle";

export type LabTrade = {
  id: string; decision_id: string; status: string; opened_at: string; closed_at: string | null;
  lifecycle_revision: number; open_snapshot: Record<string, any>; close_snapshot: Record<string, any> | null;
  review_snapshot: TradeReview | null; net_pnl: number | null; planned_risk_amount: number;
  plan_snapshot: Record<string, any>; assessment_snapshot: Record<string, any>; locked_at: string;
};
const mean = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const round = (value: number | null) => value === null ? null : Number(value.toFixed(4));

export function performance(rows: { r: number; time: string; id: string }[]) {
  const ordered = [...rows].sort((a, b) => a.time.localeCompare(b.time) || a.id.localeCompare(b.id));
  const wins = rows.filter(t => t.r > 0), losses = rows.filter(t => t.r < 0);
  const grossWin = wins.reduce((n, t) => n + t.r, 0), grossLoss = -losses.reduce((n, t) => n + t.r, 0);
  let equity = 0, peak = 0, drawdown = 0;
  const curve = ordered.map(t => { equity += t.r; peak = Math.max(peak, equity); drawdown = Math.max(drawdown, peak - equity); return { id: t.id, time: t.time, r: round(equity) }; });
  const averageWin = mean(wins.map(t => t.r)), averageLoss = mean(losses.map(t => -t.r));
  return { count: rows.length, wins: wins.length, losses: losses.length, breakevens: rows.length - wins.length - losses.length,
    winRate: round(rows.length ? wins.length / rows.length * 100 : null), averageWinR: round(averageWin), averageLossR: round(averageLoss),
    realizedPayoff: round(averageWin !== null && averageLoss !== null ? averageWin / averageLoss : null),
    expectancyR: round(mean(rows.map(t => t.r))), totalR: round(equity),
    profitFactor: grossLoss ? round(grossWin / grossLoss) : null, noLosses: rows.length > 0 && grossLoss === 0,
    closedTradeDrawdownR: round(drawdown), curve };
}

export function executionChecks(trade: LabTrade, protocol: ExperimentProtocol) {
  const actual = trade.open_snapshot, plan = trade.plan_snapshot;
  const management = trade.review_snapshot?.findings.managementFollowed.status ?? "unknown";
  const values = {
    entry: Math.abs(actual.price - plan.entry) <= protocol.entryTolerance,
    stop: Math.abs(actual.stopLoss - plan.stopLoss) <= protocol.protectionTolerance,
    target: Math.abs(actual.takeProfit - plan.takeProfit) <= protocol.protectionTolerance,
    quantity: Math.abs(actual.quantity - plan.quantity) / plan.quantity * 100 <= protocol.quantityTolerancePct,
    timing: Date.parse(actual.occurredAt) >= Date.parse(trade.locked_at) && Date.parse(actual.occurredAt) < Date.parse(plan.validUntil),
    management: management === "unknown" ? null : management === "pass",
  };
  const checks = Object.values(values), assessed = checks.filter(v => v !== null);
  return { checks: values, assessed: assessed.length, total: checks.length,
    score: assessed.length === checks.length ? round(assessed.filter(Boolean).length / checks.length * 100) : null };
}

export function experimentMetrics(protocol: ExperimentProtocol, trades: LabTrade[], observations: Record<string, any>[]) {
  const closed = trades.filter(t => t.status === "closed" && t.closed_at && t.net_pnl !== null && t.planned_risk_amount > 0);
  const row = (t: LabTrade, r: number) => ({ r, time: t.closed_at!, id: t.id });
  const actual = performance(closed.map(t => row(t, Number(t.net_pnl) / Number(t.planned_risk_amount))));
  const paired = closed.filter(t => t.review_snapshot?.frozenPlanReference.r != null);
  const strategy = closed.filter(t => t.review_snapshot?.strategyReference.r != null);
  const probability = closed.filter(t => t.plan_snapshot.predictedProbability != null && t.review_snapshot && t.review_snapshot.probabilityOutcome !== "unresolved" && Date.parse(t.open_snapshot.occurredAt) >= Date.parse(t.locked_at) && Date.parse(t.open_snapshot.occurredAt) < Date.parse(t.plan_snapshot.validUntil));
  const reviewed = closed.filter(t => t.review_snapshot);
  const compliant = reviewed.filter(t => t.review_snapshot!.findings.strategyFollowed.status === "pass");
  const knownCompliance = reviewed.filter(t => t.review_snapshot!.findings.strategyFollowed.status !== "unknown");
  const scores = trades.map(t => ({ id: t.id, ...executionChecks(t, protocol) }));
  const groups: Record<string, { trades: number; netR: number }> = {};
  for (const t of reviewed) for (const b of t.review_snapshot!.behaviors) {
    groups[b.type] ??= { trades: 0, netR: 0 }; groups[b.type].trades++; groups[b.type].netR += Number(t.net_pnl) / t.planned_risk_amount;
  }
  const conditionGroups: Record<string, { pass: number[]; fail: number[]; unknown: number[] }> = {};
  for (const t of closed) for (const check of (t.assessment_snapshot.checks ?? [])) {
    const key = check.label;
    conditionGroups[key] ??= { pass: [], fail: [], unknown: [] };
    const status = ["pass", "fail"].includes(check.status) ? check.status as "pass" | "fail" : "unknown";
    conditionGroups[key][status].push(Number(t.net_pnl) / t.planned_risk_amount);
  }
  const hours = observations.reduce((n, o) => n + (Date.parse(o.ended_at) - Date.parse(o.started_at)) / 3600_000, 0);
  const setups = observations.reduce((n, o) => n + o.qualifying_setups, 0), taken = observations.reduce((n, o) => n + o.taken_setups, 0);
  return { analysisContribution: analysisContribution(trades), schemaVersion: 1, target: protocol.targetSample, admitted: trades.length, closed: closed.length, open: trades.filter(t => t.status === "open").length,
    checkpointReached: closed.length >= protocol.targetSample, evidenceStatus: "insufficient" as const,
    evidenceNote: "A completed sample is a review checkpoint. These descriptive results do not establish a strategy edge or causal behavior costs.",
    actual, strategyReference: performance(strategy.map(t => row(t, t.review_snapshot!.strategyReference.r!))),
    frozenPlanReference: performance(paired.map(t => row(t, t.review_snapshot!.frozenPlanReference.r!))),
    paired: { count: paired.length, actualR: round(paired.reduce((n, t) => n + Number(t.net_pnl) / t.planned_risk_amount, 0)),
      planR: round(paired.reduce((n, t) => n + t.review_snapshot!.frozenPlanReference.r!, 0)),
      actualMinusPlanR: round(paired.reduce((n, t) => n + Number(t.net_pnl) / t.planned_risk_amount - t.review_snapshot!.frozenPlanReference.r!, 0)) },
    compliance: { reviewed: reviewed.length, known: knownCompliance.length, passed: compliant.length, rate: round(knownCompliance.length ? compliant.length / knownCompliance.length * 100 : null) },
    execution: { score: round(mean(scores.flatMap(s => s.score === null ? [] : [s.score]))), scoredTrades: scores.filter(s => s.score !== null).length, perTrade: scores },
    behavior: Object.entries(groups).map(([type, v]) => ({ type, trades: v.trades, associatedNetR: round(v.netR) })),
    probability: { count: probability.length, brier: round(mean(probability.map(t => (t.plan_snapshot.predictedProbability / 100 - (t.review_snapshot!.probabilityOutcome === "target_first" ? 1 : 0)) ** 2))),
      averagePrediction: round(mean(probability.map(t => t.plan_snapshot.predictedProbability))), actualEventRate: round(mean(probability.map(t => t.review_snapshot!.probabilityOutcome === "target_first" ? 100 : 0))) },
    coverage: { sessions: observations.length, hours: round(hours), qualifyingSetups: setups, takenSetups: taken, missedSetups: setups - taken, setupsPerHour: round(hours > 0 ? setups / hours : null) },
    hindsightOrExpired: trades.filter(t => Date.parse(t.open_snapshot.occurredAt) < Date.parse(t.locked_at) || Date.parse(t.open_snapshot.occurredAt) >= Date.parse(t.plan_snapshot.validUntil)).length,
    conditions: Object.entries(conditionGroups).map(([label, values]) => ({ label, groups: Object.entries(values).map(([status, rs]) => ({ status, count: rs.length, expectancyR: round(mean(rs)) })) })),
  };
}
