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
    const chart = createChart(host.current, {
      autoSize: true,
      height: 430,
      layout: { background: { type: ColorType.Solid, color: "#0d1117" }, textColor: "#8b949e", panes: { separatorColor: "#30363d", separatorHoverColor: "#d6a84b55", enableResize: true } },
      grid: { vertLines: { color: "#21262d" }, horzLines: { color: "#21262d" } },
      crosshair: { vertLine: { color: "#d6a84b88", labelBackgroundColor: "#9a762e" }, horzLine: { color: "#d6a84b88", labelBackgroundColor: "#9a762e" } },
      rightPriceScale: { borderColor: "#30363d" },
      timeScale: { borderColor: "#30363d", timeVisible: true, secondsVisible: false },
    });
    const price = chart.addSeries(CandlestickSeries, { upColor: "#26a69a", downColor: "#ef5350", borderVisible: false, wickUpColor: "#26a69a", wickDownColor: "#ef5350", priceFormat: { type: "price", precision: 2, minMove: .01 } }, 0);
    price.setData(candles.map(item => ({ time: chartTime(item.time), open: item.open, high: item.high, low: item.low, close: item.close })));
    const volume = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "" }, 1);
    volume.setData(candles.filter(item => item.volume !== null).map(item => ({ time: chartTime(item.time), value: item.volume!, color: item.close >= item.open ? "#26a69a88" : "#ef535088" })));
    chart.panes()[1]?.setHeight(110);
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [candles]);

  return <div ref={host} className="mt-4 min-h-[430px] w-full overflow-hidden rounded-xl border border-[#30363d] bg-[#0d1117]" aria-label="Candlestick and reported-volume chart" />;
}
