import { buildStructureHistories, decide, demoCandles, runBacktest, structurePillar, technicalPillar, volumePillar } from "@/lib/trading-lab/engine";
import { normalizeTradeRow, parseCsv } from "@/lib/trading-lab/journal";
import { simulateLadder } from "@/lib/trading-lab/ladder";

describe("Trading Lab deterministic engines", () => {
  it("honors the requested demo chart interval", () => {
    const candles = demoCandles(2, 15);
    expect(Date.parse(candles[1].time) - Date.parse(candles[0].time)).toBe(15 * 60_000);
  });

  it("withholds volume analysis when reported volume is missing", () => {
    const candles = demoCandles().map(item => ({ ...item, volume: null }));
    expect(volumePillar(candles).bias).toBe("unavailable");
  });

  it("produces identical backtests from identical inputs", () => {
    const config = { initialCapital: 10000, riskPct: 1, stopAtr: 1.5, rewardRisk: 2, commission: 1, slippage: .1, entryMode: "swing" as const };
    expect(runBacktest(demoCandles(), config)).toEqual(runBacktest(demoCandles(), config));
  });

  it("detects deterministic, scored structural levels from completed history", () => {
    const candles = demoCandles(500);
    const result = structurePillar({ H1: candles }, candles);
    expect(result.levels.length).toBeGreaterThan(0);
    expect(result.levels.every(level => level.strength >= 5 && level.timeframe === "H1")).toBe(true);
    expect(result.warnings.join(" ")).toContain("not a forecast");
  });

  it("records structure evidence inside historical backtest trades", () => {
    const result = runBacktest(demoCandles(500), { initialCapital: 10000, riskPct: 1, stopAtr: 1.5, rewardRisk: 2, commission: 0, slippage: .1, entryMode: "swing" });
    expect(result.trades[0]?.structure).toEqual(expect.objectContaining({ rejectionConfirmed: expect.any(Boolean), hitRateSample: expect.any(Number) }));
  });

  it("backtests both directions from independent long and short rules", () => {
    const result = runBacktest(demoCandles(500), {
      initialCapital: 10000, riskPct: 1, stopAtr: 1.5, rewardRisk: 2, commission: 0, slippage: .1,
      strategy: {
        direction: "both",
        longEntry: { logic: "all", conditions: [{ left: "close", operator: "gt", right: "ema_20" }] },
        shortEntry: { logic: "all", conditions: [{ left: "close", operator: "lt", right: "ema_20" }] },
      },
    });
    expect(new Set(result.trades.map(trade => trade.direction))).toEqual(new Set(["long", "short"]));
  });

  it("refuses a legacy both-direction strategy with one ambiguous rule set", () => {
    expect(() => runBacktest(demoCandles(), {
      initialCapital: 10000, riskPct: 1, stopAtr: 1.5, rewardRisk: 2, commission: 0, slippage: .1,
      strategy: { direction: "both", entry: { logic: "all", conditions: [{ left: "close", operator: "gt", right: "ema_20" }] } },
    })).toThrow("separate long and short entry rules");
  });

  it("uses the live multi-timeframe Structure calculation inside backtests", () => {
    const candles = demoCandles(500);
    const result = runBacktest(candles, { initialCapital: 10000, riskPct: 1, stopAtr: 1.5, rewardRisk: 2, commission: 0, slippage: .1, entryMode: "swing" });
    const trade = result.trades[0];
    const signalIndex = candles.findIndex(candle => candle.time === trade.entryTime) - 1;
    const slice = candles.slice(0, signalIndex + 1);
    const liveStructure = structurePillar(buildStructureHistories(slice), slice);
    expect(trade.structure.levels).toEqual(liveStructure.levels);
    expect(trade.structure.support).toBe(liveStructure.support?.price ?? null);
    expect(trade.structure.resistance).toBe(liveStructure.resistance?.price ?? null);
  });

  it("blocks decisions when only one pillar is available", () => {
    const technical = technicalPillar(demoCandles());
    const unavailable = { bias: "unavailable" as const, score: 0, confidence: 0, summary: "missing", evidence: [], warnings: [] };
    const volume = volumePillar(demoCandles().map(item => ({ ...item, volume: null })));
    expect(decide(unavailable, technical, volume, true).state).toBe("NO TRADE");
  });

  it("parses quoted broker CSV fields and normalizes aliases", () => {
    const rows = parseCsv('Ticket,Symbol,Side,Entry,Open Time,Comment\n1,XAUUSD,Buy,2320,2026-01-01T00:00:00Z,"London, breakout"');
    expect(normalizeTradeRow(rows[0], 0)).toMatchObject({ external_trade_id: "1", instrument: "XAUUSD", direction: "buy", entry_price: 2320, notes: "London, breakout" });
  });

  it("fails a ladder when attempts are exhausted", () => {
    const result = simulateLadder([{ rMultiple: -1 }, { rMultiple: -1 }, { rMultiple: -1 }], { startingBalance: 1000, stepCount: 5, targetGrowthPct: 10, maxAttemptsPerStep: 3, failureDrawdownPct: 20 });
    expect(result.status).toBe("failed");
  });
});
