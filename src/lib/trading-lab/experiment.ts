import { z } from "zod";

const text = z.string().trim().min(1).max(4000);
export const experimentSchema = z.object({
  requestId: z.string().uuid(), strategyVersionId: z.string().uuid(),
  parentExperimentId: z.string().uuid().nullable().default(null),
  name: text.max(120), hypothesis: text, session: text.max(120), timezone: text.max(100),
  targetSample: z.number().int().min(2).max(1000),
  accountType: z.enum(["live", "demo"]),
  eligibility: text, invalidation: text, stopConditions: text, reviewCriteria: text,
  riskCurrency: z.string().regex(/^[A-Z]{3}$/), riskAmount: z.number().finite().positive(),
  entryTolerance: z.number().finite().nonnegative(), protectionTolerance: z.number().finite().nonnegative(),
  quantityTolerancePct: z.number().finite().min(0).max(100),
  approved: z.literal(true),
}).strict().superRefine((value, ctx) => {
  try { new Intl.DateTimeFormat("en", { timeZone: value.timezone }); }
  catch { ctx.addIssue({ code: "custom", path: ["timezone"], message: "Use an IANA timezone, such as Europe/London." }); }
});
export type ExperimentProtocol = z.infer<typeof experimentSchema>;
export const experimentReviewSchema = z.object({
  requestId: z.string().uuid(), experimentId: z.string().uuid(), action: z.enum(["KEEP", "MODIFY", "RETEST", "KILL"]),
  rationale: text, nextHypothesis: z.string().trim().max(4000),
  stopReason: z.string().trim().max(4000), approved: z.literal(true),
}).strict();
export const observationSchema = z.object({
  requestId: z.string().uuid(), experimentId: z.string().uuid(),
  startedAt: z.string().datetime({ offset: true }), endedAt: z.string().datetime({ offset: true }),
  qualifyingSetups: z.number().int().min(0).max(1000), takenSetups: z.number().int().min(0).max(1000),
  notes: text,
}).strict().superRefine((value, ctx) => {
  if (Date.parse(value.endedAt) <= Date.parse(value.startedAt)) ctx.addIssue({ code: "custom", path: ["endedAt"], message: "Coverage must end after it starts." });
  if (value.takenSetups > value.qualifyingSetups) ctx.addIssue({ code: "custom", path: ["takenSetups"], message: "Taken qualifying setups cannot exceed observed qualifying setups." });
});
