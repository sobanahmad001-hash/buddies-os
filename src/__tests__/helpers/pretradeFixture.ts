import { pretradeSchema, planChecks } from "@/lib/trading-lab/pretrade";
import { strategyVersionSchema } from "@/lib/trading-lab/strategy-schema";

export const strategyFixture = strategyVersionSchema.parse({
  schemaVersion: 1, name: "Manual gold protocol", market: "gold", symbols: ["XAU/USD"], direction: "long",
  timeframes: { context: ["1h"], setup: "15min", trigger: "5min" },
  entry: { logic: "all", conditions: [
    { id: "context", left: "close", operator: "gt", right: "ema_20", timeframe: "1h" },
    { logic: "any", conditions: [
      { id: "confirmation", left: "close", operator: "gt", right: "open", timeframe: "5min" },
      { id: "alternative", left: "rsi_14", operator: "gt", right: 50, timeframe: "5min" },
    ] },
  ] },
  exit: { stopType: "fixed", stopValue: 5, targetType: "risk_multiple", targetValue: 4 },
  sizing: { type: "fixed_risk_usd", value: 10 },
  safety: { maxDailyLossPct: 2, maxDrawdownPct: 10, maxConcurrentPositions: 1, maxTradesPerSession: 2, eventVeto: true },
  execution: { timing: "next_open", spread: 0, commission: 0, slippage: 0 },
});

export const testNow = Date.parse("2026-09-09T10:00:00Z");
export function planFixture() {
  return pretradeSchema.parse({
    requestId: "11111111-1111-4111-8111-111111111111", strategyVersionId: "22222222-2222-4222-8222-222222222222",
    instrument: "XAUUSD", direction: "long", entry: 3450, stopLoss: 3445, takeProfit: 3470,
    quantity: .01, quantityUnit: "lots", riskAmount: 10, riskCurrency: "USD", session: "London / Europe/London",
    context: "Completed candle evidence recorded manually", observedAt: "2026-09-09T09:55:00Z", validUntil: "2026-09-09T11:00:00Z",
    notExecutedYet: true, predictedProbability: null,
    assessments: Object.fromEntries(planChecks(strategyFixture, "long").map(check => [check.key, { status: "pass", evidence: "Observed and checked against recorded evidence" }])),
  });
}
