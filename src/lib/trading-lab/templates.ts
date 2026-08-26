import type { StrategyVersionInput } from "@/lib/trading-lab/strategy-schema";

const safety = { maxDailyLossPct: 2, maxDrawdownPct: 10, maxConcurrentPositions: 1, maxTradesPerSession: 2, eventVeto: true };
const execution = { timing: "next_open" as const, spread: 0.2, commission: 0, slippage: 0.1 };

export const STRATEGY_TEMPLATES: Record<string, StrategyVersionInput & { templateId: string; entryMode: "swing" | "reversal" | "momentum" }> = {
  swing: {
    templateId: "swing", entryMode: "swing", schemaVersion: 1, name: "Gold swing", description: "D1/H4 context with H1 trend transition and ATR risk.", market: "gold", symbols: ["XAU/USD"], direction: "both",
    timeframes: { context: ["1day", "4h"], setup: "1h", trigger: "15min" },
    entry: { logic: "all", conditions: [{ id: "trend", left: "ema_20", operator: "crosses_above", right: "ema_50", timeframe: "1h", completedCandleOnly: true }] },
    exit: { stopType: "atr", stopValue: 1.5, targetType: "risk_multiple", targetValue: 2 }, sizing: { type: "percent_risk", value: 1 }, safety, execution,
  },
  reversal: {
    templateId: "reversal", entryMode: "reversal", schemaVersion: 1, name: "Reversal / VSA", description: "Extreme RSI with rejection; live use also requires valid reported volume.", market: "gold", symbols: ["XAU/USD"], direction: "both",
    timeframes: { context: ["4h", "1h"], setup: "15min", trigger: "5min" },
    entry: { logic: "any", conditions: [{ id: "oversold", left: "rsi_14", operator: "lt", right: 32, timeframe: "15min", completedCandleOnly: true }, { id: "overbought", left: "rsi_14", operator: "gt", right: 68, timeframe: "15min", completedCandleOnly: true }] },
    exit: { stopType: "atr", stopValue: 1.2, targetType: "risk_multiple", targetValue: 1.8 }, sizing: { type: "percent_risk", value: .75 }, safety, execution,
  },
  momentum: {
    templateId: "momentum", entryMode: "momentum", schemaVersion: 1, name: "Momentum breakout", description: "Twenty-bar breakout in the direction of the EMA trend.", market: "gold", symbols: ["XAU/USD"], direction: "both",
    timeframes: { context: ["4h", "1h"], setup: "15min", trigger: "5min" },
    entry: { logic: "any", conditions: [{ id: "breakout", left: "close", operator: "gt", right: "rolling_high_20", timeframe: "15min", completedCandleOnly: true }] },
    exit: { stopType: "atr", stopValue: 1.5, targetType: "risk_multiple", targetValue: 2 }, sizing: { type: "percent_risk", value: .75 }, safety, execution,
  },
};

export const LADDER_PRESETS = {
  steady: { name: "Steady 10-step ladder", stepCount: 10, targetGrowthPct: 10, riskPct: 1, maxAttemptsPerStep: 3, failureDrawdownPct: 10, multiplier: 1, maxIncreases: 0 },
  controlled: { name: "Controlled progression", stepCount: 8, targetGrowthPct: 12, riskPct: .5, maxAttemptsPerStep: 3, failureDrawdownPct: 10, multiplier: 1.5, maxIncreases: 2 },
} as const;
