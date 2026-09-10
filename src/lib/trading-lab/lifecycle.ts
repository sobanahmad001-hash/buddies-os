import { z } from "zod";

const positive = z.number().finite().positive();
const money = z.number().finite();
const timestamp = z.string().datetime({ offset: true });
const reason = z.string().trim().min(1).max(4000);
const common = { requestId: z.string().uuid(), tradeId: z.string().uuid(), expectedRevision: z.number().int().nonnegative() };
const fill = { occurredAt: timestamp, price: positive, quantity: positive, reason };
export const reviewQuestions = ["thesis", "direction", "entryTiming", "confirmation", "stopPlacement", "targetRealistic", "strategyFollowed", "managementFollowed"] as const;
export const behaviorTypes = ["early_entry", "revenge_trade", "overtrading", "moved_stop", "closed_early", "ignored_confirmation", "daily_loss_limit", "outside_session", "increased_risk_after_loss", "fomo", "strategy_violation"] as const;
const finding = z.object({ status: z.enum(["pass", "fail", "unknown"]), evidence: z.string().trim().max(2000) }).strict().superRefine((v, c) => {
  if (v.status !== "unknown" && !v.evidence) c.addIssue({ code: "custom", path: ["evidence"], message: "A finding needs supporting evidence." });
});
const reference = z.object({ r: money.nullable(), evidence: z.string().trim().max(4000) }).strict().superRefine((v, c) => {
  if (v.r !== null && !v.evidence) c.addIssue({ code: "custom", path: ["evidence"], message: "A reference outcome needs its reconstruction evidence and cost assumptions." });
});
export const tradeReviewSchema = z.object({
  findings: z.object(Object.fromEntries(reviewQuestions.map(k => [k, finding])) as Record<typeof reviewQuestions[number], typeof finding>).strict(),
  strategyReference: reference, frozenPlanReference: reference,
  probabilityOutcome: z.enum(["target_first", "stop_first", "neither", "unresolved"]),
  probabilityObservedAt: timestamp.nullable(), probabilityEvidence: z.string().trim().max(4000),
  behaviors: z.array(z.object({ type: z.enum(behaviorTypes), evidence: reason, ruleId: z.string().uuid().nullable().default(null) }).strict()).max(30),
  lesson: reason, nextAction: reason,
}).strict().superRefine((v, c) => {
  if (v.probabilityOutcome !== "unresolved" && (!v.probabilityObservedAt || !v.probabilityEvidence)) c.addIssue({ code: "custom", path: ["probabilityEvidence"], message: "Resolve the exact predicted event using a timestamp and evidence." });
  if (new Set(v.behaviors.map(b => b.type)).size !== v.behaviors.length) c.addIssue({ code: "custom", path: ["behaviors"], message: "Record each behavior once per review." });
});
export const tradeEventSchema = z.discriminatedUnion("kind", [
  z.object({ ...common, kind: z.literal("open"), payload: z.object({ ...fill, planId: z.string().uuid(), accountType: z.enum(["live", "demo"]), stopLoss: positive, takeProfit: positive, actualRiskAmount: positive, brokerReference: reason.max(200) }).strict() }).strict(),
  z.object({ ...common, kind: z.literal("add_fill"), payload: z.object(fill).strict() }).strict(),
  z.object({ ...common, kind: z.literal("change_protection"), payload: z.object({ occurredAt: timestamp, stopLoss: positive, takeProfit: positive, reason }).strict() }).strict(),
  z.object({ ...common, kind: z.literal("partial_exit"), payload: z.object(fill).strict() }).strict(),
  z.object({ ...common, kind: z.literal("close"), payload: z.object({ ...fill, pnlAmount: money, pnlBasis: z.enum(["broker_net", "gross"]), fees: z.number().finite().nonnegative(), financing: money, pnlEvidence: reason }).strict() }).strict(),
  z.object({ ...common, kind: z.literal("review"), payload: tradeReviewSchema }).strict(),
]);
export type TradeReview = z.infer<typeof tradeReviewSchema>;
export type TradeEventInput = z.infer<typeof tradeEventSchema>;

export function netPnl(value: { pnlAmount: number; pnlBasis: "broker_net" | "gross"; fees: number; financing: number }) {
  // Broker net already includes costs. Financing is signed: a credit is positive.
  return value.pnlBasis === "broker_net" ? value.pnlAmount : value.pnlAmount - value.fees + value.financing;
}
