"use client";

import { useEffect, useRef, useState } from "react";
import { CandlestickSeries, ColorType, HistogramSeries, LineSeries, createChart, type Time } from "lightweight-charts";

import { chartIndicators } from "@/lib/trading-lab/chart-indicators";

type Candle = { time: string; open: number; high: number; low: number; close: number; volume: number | null };

function chartTime(value: string): Time {
  const parsed = Date.parse(/Z$|[+-]\d{2}:\d{2}$/.test(value) ? value : value.replace(" ", "T") + "Z");
  return Math.floor(parsed / 1000) as Time;
}

export default function MarketChart({ candles, levels = [] }: { candles: Candle[]; levels?: {price:number;kind:string;timeframe?:string}[] }) {
  const [overlays,setOverlays]=useState({ema20:true,ema50:true,rsi:true,volume:true,levels:true});
  const indicators=chartIndicators(candles);
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
    const indicators = chartIndicators(candles);
    for (const [key,color,title] of [["ema20","#2563eb","EMA 20"],["ema50","#d97706","EMA 50"]] as const) if(overlays[key]) {
      const series=chart.addSeries(LineSeries,{color,lineWidth:2,title,priceLineVisible:false},0);
      series.setData(indicators[key].map(p=>({time:chartTime(p.time),value:p.value})));
    }
    if(overlays.levels) for(const level of levels.slice(0,8)) if(Number.isFinite(level.price)) price.createPriceLine({price:level.price,color:level.kind==="support"?positive:risk,lineWidth:1,lineStyle:2,axisLabelVisible:true,title:`${level.timeframe??""} ${level.kind}`});
    let pane=1;
    if(overlays.volume) {
    const volume = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "" }, pane);
    volume.setData(candles.filter(item => item.volume !== null).map(item => ({ time: chartTime(item.time), value: item.volume!, color: item.close >= item.open ? positive : risk })));
    chart.panes()[pane++]?.setHeight(110);
    }
    if(overlays.rsi) {
      const series=chart.addSeries(LineSeries,{color:"#8b5cf6",lineWidth:2,title:"RSI 14",priceLineVisible:false},pane);
      series.setData(indicators.rsi.map(p=>({time:chartTime(p.time),value:p.value})));
      for(const value of [30,70])series.createPriceLine({price:value,color:muted,lineWidth:1,lineStyle:2,axisLabelVisible:true,title:String(value)});
      chart.panes()[pane]?.setHeight(110);
    }
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [candles, overlays, levels]);

  return <section><div className="mt-3 flex flex-wrap items-center gap-3 text-xs">{([ ["ema20","EMA 20"],["ema50","EMA 50"],["rsi","RSI 14"],["volume","Reported volume"],["levels","Structure levels"] ] as const).map(([key,label])=><label key={key} className="flex items-center gap-1"><input type="checkbox" checked={overlays[key]} onChange={e=>setOverlays(v=>({...v,[key]:e.target.checked}))}/>{label}</label>)}<span className="text-muted">ATR 14: {indicators.atr14??"Warming up"}</span></div>{!candles.length&&<p className="mt-3 text-sm text-muted">No chart data available.</p>}<div ref={host} className="mt-4 min-h-[430px] w-full overflow-hidden rounded-xl border border-line bg-canvas" aria-label="Candlestick chart with EMA overlays, RSI, reported volume and structure levels" /><p className="mt-2 text-xs text-muted">Indicators use the displayed candles. EMA starts after its warm-up period; RSI uses Wilder smoothing. Volume is provider-reported and may be absent; spot volume is not consolidated exchange volume. Structure lines are a current-context overlay, not historical signals.</p></section>;
}
