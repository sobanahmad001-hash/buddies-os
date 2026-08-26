import { decide, demoCandles, runBacktest, technicalPillar, volumePillar } from "@/lib/trading-lab/engine";
import { normalizeTradeRow, parseCsv } from "@/lib/trading-lab/journal";
import { simulateLadder } from "@/lib/trading-lab/ladder";

describe("Trading Lab deterministic engines", () => {
  it("withholds volume analysis when reported volume is missing", () => {
    const candles = demoCandles().map(item => ({ ...item, volume: null }));
    expect(volumePillar(candles).bias).toBe("unavailable");
  });

  it("produces identical backtests from identical inputs", () => {
    const config = { initialCapital: 10000, riskPct: 1, stopAtr: 1.5, rewardRisk: 2, commission: 1, slippage: .1, entryMode: "swing" as const };
    expect(runBacktest(demoCandles(), config)).toEqual(runBacktest(demoCandles(), config));
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
