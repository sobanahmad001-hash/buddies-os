import { z } from "zod";
import { strategyVersionSchema } from "./strategy-schema";
import { experimentSchema, experimentReviewSchema, observationSchema } from "./experiment";
import { pretradeSchema } from "./pretrade";
import { tradeEventSchema } from "./lifecycle";

export const chatContextSchema = z.object({
  strategyId: z.string().uuid().nullable().default(null),
  strategyVersionId: z.string().uuid().nullable().default(null),
  experimentId: z.string().uuid().nullable().default(null),
  paperRunId: z.string().uuid().nullable().default(null),
}).strict();
export const chatInputSchema = z.object({
  sessionId: z.string().uuid(), requestId: z.string().uuid(),
  expectedRevision: z.number().int().nonnegative(), prompt: z.string().trim().min(1).max(8000),
  context: chatContextSchema, research: z.boolean().default(false),
  provider: z.string().max(40).optional(), model: z.string().max(100).optional(),
}).strict();
export const chatActionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("save_strategy"), input: z.object({ definition: strategyVersionSchema, strategyId: z.string().uuid().nullable().default(null), changeNote: z.string().min(1).max(4000) }).strict() }).strict(),
  z.object({ kind: z.literal("create_experiment"), input: experimentSchema }).strict(),
  z.object({ kind: z.literal("review_experiment"), input: experimentReviewSchema }).strict(),
  z.object({ kind: z.literal("observe"), input: observationSchema }).strict(),
  z.object({ kind: z.literal("capture_plan"), input: pretradeSchema }).strict(),
  z.object({ kind: z.literal("trade_event"), input: tradeEventSchema }).strict(),
  // Paper inputs are additionally validated by the paper service on approval.
  z.object({ kind: z.literal("paper"), input: z.record(z.string(), z.unknown()) }).strict(),
]);
export type ChatAction = z.infer<typeof chatActionSchema>;
export type ChatContext = z.infer<typeof chatContextSchema>;
export type ChatMessage = { id: string; role: string; content: string; sequence: number; metadata: { status?: string; action?: ChatAction; receipt?: any; provider?: string; model?: string; error?: string } };

export function parseChatReply(text: string) {
  const match = text.match(/<lab_action>([\s\S]*?)<\/lab_action>/i);
  const content = text.replace(/<lab_action>[\s\S]*?(?:<\/lab_action>|$)/ig, "").trim();
  if (!match) return { content: content || "Please describe the strategy or result you want to work on.", action: null };
  try {
    const parsed = chatActionSchema.safeParse(JSON.parse(match[1]));
    if (parsed.success) return { content, action: parsed.data };
  } catch { /* Never execute or display malformed action markup as a saved action. */ }
  return { content: `${content}\n\nThe proposed action is incomplete. No action was saved or executed; provide the missing fields before approval.`, action: null };
}
