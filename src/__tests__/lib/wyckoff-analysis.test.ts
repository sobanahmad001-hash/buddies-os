import { analyzeWyckoff } from "@/lib/trading/wyckoff-analysis";

const base = Array.from({ length: 20 }, (_, i) => ({ open: 100, high: 110, low: 90, close: 100 + (i % 2), volume: 100 }));

describe("Wyckoff analysis", () => {
  test("marks a range as provisional", () => {
    expect(analyzeWyckoff(base).manualConfirmationRequired).toBe(true);
  });
  test("detects a possible spring", () => {
    const result = analyzeWyckoff([...base, { open: 92, high: 104, low: 86, close: 103, volume: 190 }]);
    expect(result.event).toBe("Possible spring");
    expect(result.bias).toBe("bullish");
  });
  test("does not classify without enough candles", () => {
    expect(analyzeWyckoff(base.slice(0, 10)).confidence).toBe(0);
  });
});
