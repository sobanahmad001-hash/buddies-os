"use client";

import { useEffect, useRef } from "react";
import { CandlestickSeries, ColorType, HistogramSeries, createChart, type Time } from "lightweight-charts";

type Candle = { time: string; open: number; high: number; low: number; close: number; volume: number | null };

function chartTime(value: string): Time {
  const parsed = Date.parse(value.includes("T") ? value : value.replace(" ", "T") + "Z");
  return Math.floor(parsed / 1000) as Time;
}

export default function MarketChart({ candles }: { candles: Candle[] }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!host.current || !candles.length) return;
    const styles = getComputedStyle(document.documentElement);
    const token = (name: string) => styles.getPropertyValue(name).trim();
    const canvas = token("--canvas"), muted = token("--text-muted"), line = token("--border"), subtle = token("--surface-subtle"), accent = token("--accent"), positive = token("--positive"), risk = token("--risk");
    const chart = createChart(host.current, {
      autoSize: true,
      height: 430,
      layout: { background: { type: ColorType.Solid, color: canvas }, textColor: muted, panes: { separatorColor: line, separatorHoverColor: accent, enableResize: true } },
      grid: { vertLines: { color: subtle }, horzLines: { color: subtle } },
      crosshair: { vertLine: { color: accent, labelBackgroundColor: accent }, horzLine: { color: accent, labelBackgroundColor: accent } },
      rightPriceScale: { borderColor: line },
      timeScale: { borderColor: line, timeVisible: true, secondsVisible: false },
    });
    const price = chart.addSeries(CandlestickSeries, { upColor: positive, downColor: risk, borderVisible: false, wickUpColor: positive, wickDownColor: risk, priceFormat: { type: "price", precision: 2, minMove: .01 } }, 0);
    price.setData(candles.map(item => ({ time: chartTime(item.time), open: item.open, high: item.high, low: item.low, close: item.close })));
    const volume = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "" }, 1);
    volume.setData(candles.filter(item => item.volume !== null).map(item => ({ time: chartTime(item.time), value: item.volume!, color: item.close >= item.open ? positive : risk })));
    chart.panes()[1]?.setHeight(110);
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [candles]);

  return <div ref={host} className="mt-4 min-h-[430px] w-full overflow-hidden rounded-xl border border-line bg-canvas" aria-label="Candlestick and reported-volume chart" />;
}
