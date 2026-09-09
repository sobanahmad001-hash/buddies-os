import { z } from "zod";
import type { StrategyVersion } from "./strategy-schema";

export type AssessmentStatus = "pass" | "fail" | "unknown";
type Condition = { id: string; left: string; operator: string; right: unknown; timeframe?: string };
type Group = { logic: "all" | "any"; conditions: Array<Condition | Group> };
export type PlanCheck = { key: string; label: string };

const assessmentSchema = z.object({
  status: z.enum(["pass", "fail", "unknown"]),
  evidence: z.string().trim().max(2000).default(""),
}).strict().superRefine((value, ctx) => {
  if (value.status !== "unknown" && !value.evidence) {
    ctx.addIssue({ code: "custom", path: ["evidence"], message: "Explain the evidence for a pass or fail." });
  }
});

export const pretradeSchema = z.object({
  requestId: z.string().uuid(),
  strategyVersionId: z.string().uuid(),
  experimentId: z.string().uuid().nullable().optional(),
  marketContext: z.object({
    higherTimeframe: z.string().trim().max(2000), structure: z.string().trim().max(2000),
    wyckoff: z.string().trim().max(2000), volume: z.string().trim().max(2000),
    liquidity: z.string().trim().max(2000), regime: z.string().trim().max(500),
    news: z.string().trim().max(2000),
  }).strict().optional(),
  evidenceLinks: z.array(z.string().url().max(2000).refine(v => v.startsWith("https://"), "Evidence links must use HTTPS.")).max(10).optional(),
  instrument: z.string().trim().min(1).max(40),
  direction: z.enum(["long", "short"]),
  entry: z.number().finite().positive(),
  stopLoss: z.number().finite().positive(),
  takeProfit: z.number().finite().positive(),
  quantity: z.number().finite().positive(),
  quantityUnit: z.enum(["lots", "units", "contracts"]),
  riskAmount: z.number().finite().positive(),
  riskCurrency: z.string().regex(/^[A-Z]{3}$/, "Use a three-letter currency code."),
  session: z.string().trim().min(1).max(100),
  context: z.string().trim().min(1).max(6000),
  observedAt: z.string().datetime({ offset: true }),
  validUntil: z.string().datetime({ offset: true }),
  notExecutedYet: z.literal(true),
  predictedProbability: z.number().int().min(0).max(100).nullable().default(null),
  assessments: z.record(z.string(), assessmentSchema),
}).strict().superRefine((value, ctx) => {
  const valid = value.direction === "long"
    ? value.stopLoss < value.entry && value.entry < value.takeProfit
    : value.takeProfit < value.entry && value.entry < value.stopLoss;
  if (!valid) ctx.addIssue({ code: "custom", path: ["stopLoss"], message: "Long: SL < entry < TP. Short: TP < entry < SL." });
  if (!Number.isFinite(Math.abs(value.takeProfit - value.entry) / Math.abs(value.entry - value.stopLoss))) {
    ctx.addIssue({ code: "custom", path: ["stopLoss"], message: "The plan must have a finite, nonzero risk distance." });
  }
  if (Date.parse(value.validUntil) <= Date.parse(value.observedAt)) {
    ctx.addIssue({ code: "custom", path: ["validUntil"], message: "Expiry must follow the evidence time." });
  }
});

export type PretradeInput = z.infer<typeof pretradeSchema>;

function entryGroup(strategy: StrategyVersion, direction: "long" | "short"): Group | undefined {
  return strategy.direction === "both" ? strategy[direction === "long" ? "longEntry" : "shortEntry"] : strategy.entry;
}

export function planChecks(strategy: StrategyVersion, direction: "long" | "short"): PlanCheck[] {
  const checks: PlanCheck[] = [];
  const visit = (group: Group, path: string) => group.conditions.forEach((condition, index) => {
    const key = `${path}.${index}`;
    if ("conditions" in condition) visit(condition, key);
    else checks.push({ key, label: condition.left.startsWith("manual:") ? `${condition.left.slice(7)} · ${condition.timeframe ?? strategy.timeframes.trigger}` : `${condition.id}: ${condition.left} ${condition.operator} ${JSON.stringify(condition.right)} · ${condition.timeframe ?? strategy.timeframes.trigger}` });
  });
  const group = entryGroup(strategy, direction);
  if (group) visit(group, "entry");
  checks.push(
    { key: "safety.dailyLoss", label: `Daily loss stays within ${strategy.safety.maxDailyLossPct}%` },
    { key: "safety.drawdown", label: `Drawdown stays within ${strategy.safety.maxDrawdownPct}%` },
    { key: "safety.positions", label: `Including this plan: at most ${strategy.safety.maxConcurrentPositions} concurrent positions` },
    { key: "safety.sessionTrades", label: `Including this plan: at most ${strategy.safety.maxTradesPerSession} trades this session` },
    { key: "safety.sizing", label: `Sizing follows ${strategy.sizing.type}: ${strategy.sizing.value}; monetary risk includes the broker's contract/size units` },
    { key: "safety.exits", label: `SL/TP follow ${strategy.exit.stopType} stop (${strategy.exit.stopValue ?? "structure-defined"}) and ${strategy.exit.targetType} target (${strategy.exit.targetValue ?? "rule-defined"}); max bars ${strategy.exit.maxBars ?? "not specified"}` },
  );
  if (strategy.safety.eventVeto) checks.push({ key: "safety.news", label: "Required news/event veto checked against a current source" });
  return checks;
}

function combine(logic: "all" | "any", statuses: AssessmentStatus[]): AssessmentStatus {
  if (!statuses.length) return "unknown";
  if (logic === "all") return statuses.includes("fail") ? "fail" : statuses.every(s => s === "pass") ? "pass" : "unknown";
  return statuses.includes("pass") ? "pass" : statuses.every(s => s === "fail") ? "fail" : "unknown";
}

export function assessPlan(plan: PretradeInput, strategy: StrategyVersion, now = Date.now()) {
  const symbol = (value: string) => value.toUpperCase().replace(/[\s/]/g, "");
  if (!strategy.symbols.some(value => symbol(value) === symbol(plan.instrument))) throw new Error("Instrument is not in this strategy version.");
  if (strategy.direction !== "both" && strategy.direction !== plan.direction) throw new Error("Direction is not allowed by this strategy version.");
  if (Date.parse(plan.observedAt) > now) throw new Error("Evidence time cannot be in the future.");
  if (Date.parse(plan.validUntil) <= now) throw new Error("This plan has expired. Record a current plan.");
  const checks = planChecks(strategy, plan.direction);
  const expected = new Set(checks.map(check => check.key));
  if (Object.keys(plan.assessments).some(key => !expected.has(key))) throw new Error("An assessment does not belong to this strategy version.");
  const status = (key: string): AssessmentStatus => plan.assessments[key]?.status ?? "unknown";
  const evaluate = (group: Group, path: string): AssessmentStatus => combine(group.logic, group.conditions.map((condition, index) =>
    "conditions" in condition ? evaluate(condition, `${path}.${index}`) : status(`${path}.${index}`)));
  const group = entryGroup(strategy, plan.direction);
  const entryStatus = group ? evaluate(group, "entry") : "unknown";
  const safetyStatus = combine("all", checks.filter(check => check.key.startsWith("safety.")).map(check => status(check.key)));
  const result = combine("all", [entryStatus, safetyStatus]);
  return {
    schemaVersion: 1,
    mode: "manual_assessment" as const,
    verdict: result === "pass" ? "REVIEW" : result === "fail" ? "NO TRADE" : "WAIT",
    entryStatus, safetyStatus,
    passed: checks.filter(check => status(check.key) === "pass").length,
    total: checks.length,
    rewardRisk: Number((Math.abs(plan.takeProfit - plan.entry) / Math.abs(plan.entry - plan.stopLoss)).toFixed(4)),
    checks: checks.map(check => ({ ...check, status: status(check.key), evidence: plan.assessments[check.key]?.evidence ?? "" })),
    probability: { value: plan.predictedProbability, source: "human", calibration: "uncalibrated", event: "TP before SL under the frozen plan", validUntil: plan.validUntil },
  };
}
