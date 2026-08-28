import { connectorsForCapability } from "@/lib/trading-lab/connectors";
import { validateStrategyVersion } from "@/lib/trading-lab/strategy-schema";

const swingStrategy = {
  schemaVersion: 1,
  name: "Gold swing",
  market: "gold",
  symbols: ["GC.FUT", "XAU/USD"],
  direction: "both",
  timeframes: { context: ["1day", "4h"], setup: "1h", trigger: "15min" },
  entry: { logic: "all", conditions: [
    { id: "trend", left: "close", operator: "gt", right: "ema_50", timeframe: "1day" },
    { id: "confirm", left: "close", operator: "crosses_above", right: "resistance", timeframe: "15min" },
  ] },
  exit: { stopType: "structure", targetType: "risk_multiple", targetValue: 2 },
  sizing: { type: "percent_risk", value: 1 },
  safety: { maxDailyLossPct: 2, maxDrawdownPct: 10, maxConcurrentPositions: 1, maxTradesPerSession: 2, eventVeto: true },
  execution: { timing: "next_open", spread: 0.2, commission: 0, slippage: 0.1 },
};

describe("Trading Lab foundation contracts", () => {
  it("routes futures-volume capability to Databento", () => {
    expect(connectorsForCapability("futures_volume").map(item => item.id)).toContain("databento");
  });

  it("classifies operating connectors separately from optional paid inputs", () => {
    expect(connectorsForCapability("macro_series")[0].access).toBe("required_free");
    expect(connectorsForCapability("futures_volume")[0]).toMatchObject({ id: "databento", access: "optional_paid" });
    expect(connectorsForCapability("futures_volume")[0]).not.toHaveProperty("recommended");
    expect(connectorsForCapability("chart_alerts")[0].access).toBe("optional_paid");
  });

  it("accepts a general multi-timeframe swing strategy", () => {
    const result = validateStrategyVersion(swingStrategy);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.entry.conditions).toHaveLength(2);
  });

  it("rejects an unsafe unlimited progressive multiplier", () => {
    const result = validateStrategyVersion({
      ...swingStrategy,
      sizing: { type: "progressive", value: 1, multiplier: 10, maxIncreases: 99 },
    });
    expect(result.success).toBe(false);
  });
});
