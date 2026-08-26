import { z } from "zod";

const operandSchema = z.union([z.number(), z.string().min(1), z.boolean()]);

export const strategyConditionSchema = z.object({
  id: z.string().min(1),
  left: z.string().min(1),
  operator: z.enum(["gt", "gte", "lt", "lte", "eq", "crosses_above", "crosses_below", "between"]),
  right: z.union([operandSchema, z.tuple([operandSchema, operandSchema])]),
  timeframe: z.string().min(1).optional(),
  completedCandleOnly: z.boolean().default(true),
});

export const conditionGroupSchema: z.ZodType<any> = z.lazy(() => z.object({
  logic: z.enum(["all", "any"]),
  conditions: z.array(z.union([strategyConditionSchema, conditionGroupSchema])).min(1),
}));

export const strategyVersionSchema = z.object({
  schemaVersion: z.literal(1),
  name: z.string().min(2).max(100),
  description: z.string().max(1000).default(""),
  market: z.enum(["gold", "forex", "futures", "crypto", "equities"]),
  symbols: z.array(z.string().min(1)).min(1),
  direction: z.enum(["long", "short", "both"]),
  timeframes: z.object({
    context: z.array(z.string().min(1)).default([]),
    setup: z.string().min(1),
    trigger: z.string().min(1),
  }),
  entry: conditionGroupSchema,
  exit: z.object({
    stopType: z.enum(["fixed", "atr", "structure"]),
    stopValue: z.number().positive().optional(),
    targetType: z.enum(["risk_multiple", "fixed", "structure", "trailing", "time"]),
    targetValue: z.number().positive().optional(),
    maxBars: z.number().int().positive().optional(),
  }),
  sizing: z.object({
    type: z.enum(["fixed", "fixed_risk_usd", "percent_risk", "volatility", "progressive"]),
    value: z.number().positive(),
    multiplier: z.number().min(1).max(3).optional(),
    maxIncreases: z.number().int().min(0).max(10).optional(),
  }),
  safety: z.object({
    maxDailyLossPct: z.number().positive().max(100),
    maxDrawdownPct: z.number().positive().max(100),
    maxConcurrentPositions: z.number().int().positive().max(20),
    maxTradesPerSession: z.number().int().positive().max(100),
    eventVeto: z.boolean().default(false),
  }),
  execution: z.object({
    timing: z.enum(["bar_close", "next_open"]),
    spread: z.number().nonnegative(),
    commission: z.number().nonnegative(),
    slippage: z.number().nonnegative(),
  }),
});

export type StrategyVersionInput = z.input<typeof strategyVersionSchema>;
export type StrategyVersion = z.output<typeof strategyVersionSchema>;

export function validateStrategyVersion(input: unknown) {
  return strategyVersionSchema.safeParse(input);
}
