import { hourlyRead } from "@/lib/trading-lab/hourly-read";

function read(sequence: number[][], mirrored = false) {
  const candles = [...Array.from({length: 30}, (_, i) => i === 29 ? [100, 91, 96] : [99, 90, 95]), ...sequence];
  const bars = candles.map(([high, low, close], i) => ({
    time: new Date(Date.UTC(2026, 0, 1, i)).toISOString(), open: mirrored ? -close : close,
    high: mirrored ? -low : high, low: mirrored ? -high : low,
    close: mirrored ? -close : close, volume: null
  }));
  return hourlyRead(bars)!.levelMap;
}

test.each([false,true])("a breakout requires a later retest and preserves its original level (mirror %s)", mirrored => {
  // Flat baseline touches both limits and closes inside; the last baseline bar first breaks 99.
  const first = read([], mirrored);
  expect(first.stage).toBe("Rejected at level");
  const breakout = [[102,95,101]];
  expect(read(breakout, mirrored).stage).toBe("Breakout candidate");
  expect(read([...breakout,[105,100,104]], mirrored).stage).toBe("Breakout candidate");
  const held = [...breakout,[105,99,104]];
  expect(read(held, mirrored)).toMatchObject({stage:"Retest held", pivot:first.pivot,testedAt:first.testedAt});
  expect(read([...held,[105,95,97]], mirrored).stage).toBe("Breakout failed");
});
