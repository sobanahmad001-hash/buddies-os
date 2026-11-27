"use client";
import { hourlyRead } from "@/lib/trading-lab/hourly-read";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
export default function LiveAnalysis({snapshot,decision,busy,onRefresh,onConnect}:{snapshot:any;decision:any;busy:boolean;onRefresh:()=>void;onConnect:()=>void}) {
  const [eventTime,setEventTime]=useState("");
  const eventMs=Date.parse(eventTime.trim().replace(" ","T")+"Z");
  const hour=3600000;
  const anchor=Math.floor(eventMs/hour)*hour;
  const after=Math.ceil(eventMs/hour)*hour;
  const points=[["Pre-release close",anchor-hour],["First full post-release close",after],["Three full hours after release",after+2*hour]] as const;
  const news=decision?.news;
  const hourly = snapshot?.interval === "1h";
  const read = hourly && !snapshot.demo ? hourlyRead(snapshot.candles ?? []) : null;
  return <section className="space-y-4 rounded-2xl border border-line bg-surface p-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-bold">{hourly ? "Hourly Gold Briefing" : "Gold market analysis"}</h2><p className="mt-1 text-sm text-muted">{read ? `${read.regime} · completed hourly candles` : hourly ? "Hourly structure awaits sufficient provider candles." : "Select 1H for the hourly briefing."}</p></div><button onClick={onRefresh} disabled={busy} className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy?"Loading analysis…":"Refresh news + market analysis"}</button></div>
    {(!snapshot||snapshot.demo||snapshot.dataQuality?.price!=="reported")&&<div role="status" className="rounded-lg border border-amber-500/40 p-3 text-sm"><p>Fresh market evidence is unavailable. Preview candles cannot confirm news alignment or volume movement.</p><button onClick={onConnect} className="mt-2 font-semibold text-accent">Open data connectors</button></div>}
    {read && <article className="space-y-2 rounded-xl border border-line p-4 text-sm">
      <h3 className="font-bold">Hourly structure and activity</h3>
      <p>Last two confirmed swing highs: {read.highs.join(" → ") || "unavailable"}. Swing lows: {read.lows.join(" → ") || "unavailable"}. Pivots require two later candles.</p>
      <p>Prior 20-hour low and high: {read.floor} – {read.ceiling}. EMA(20) change: {read.slope.toFixed(2)} USD per ounce. ATR(14): {read.atr.toFixed(2)} USD per ounce.</p>
      <h3 className="pt-2 font-bold">Level to watch · {read.levelMap.pivot.toFixed(2)}</h3>
      <p><strong>{read.levelMap.stage}</strong> · {read.levelMap.boundary}. {read.levelMap.testedAt && `First tested on the bar opening ${read.levelMap.testedAt}. The reference stays fixed for six subsequent bars.`}</p>
      <p>{read.levelMap.evidence}</p>
      <p>Next observed levels · above {read.levelMap.above?.toFixed(2) ?? "unavailable"} · below {read.levelMap.below?.toFixed(2) ?? "unavailable"}</p>
      <p>{read.levelMap.outlook} {read.levelMap.invalidation}</p>
      {read.relative === null && <p className="text-sm text-muted">Volume confirmation unavailable.</p>}
      <h3 className="pt-2 font-bold">Volume spread analysis</h3>
      <p>{read.relative === null ? "Comparable-hour volume unavailable." : `Reported volume was ${read.relative.toFixed(2)}× the average of ${read.peerCount} prior bars at this UTC hour.`} Candle spread: {read.spread.toFixed(2)}. {read.location !== null && `Close at ${Math.round(read.location*100)}% of the low-to-high range.`}</p>
      <p className="text-xs text-muted">{snapshot.source} · closed {snapshot.lastBarClosedAt} · retrieved {snapshot.retrievedAt}. Spot volume coverage depends on the provider.</p>
    </article>}
    <div className="grid gap-3 lg:grid-cols-3">{[["Technical",snapshot?.technical],["Volume / Wyckoff",snapshot?.volume],["Fundamental / macro",snapshot?.fundamental]].map(([label,data]:any)=><article key={label} className="rounded-xl border border-line bg-canvas p-4"><h3 className="font-bold">{label}</h3><p className="mt-2 text-sm">{data?.summary??"Waiting for source data"}</p><ul className="mt-3 space-y-1 text-xs text-muted">{data?.evidence?.map((x:string)=><li key={x}>{x}</li>)}</ul>{data?.warnings?.map((x:string)=><p key={x} className="mt-2 text-xs text-amber-600">{x}</p>)}</article>)}</div>
    {read && <section className="rounded-xl border border-line p-4"><h3 className="font-bold">Trace a published release</h3>
      <label className="mt-2 block text-sm">Release time (UTC) <input type="text" placeholder="YYYY-MM-DD HH:mm" value={eventTime} onChange={e=>setEventTime(e.target.value)} /></label>
      {Number.isFinite(eventMs) && <ul className="mt-3 text-sm">{points.map(([label,start])=>{
        const bar=snapshot.candles.find((b:{time:string})=>Date.parse(/Z$|[+-]\\d\\d:\\d\\d$/.test(b.time)?b.time:b.time.replace(" ","T")+"Z")===start);
        return <li key={label}>{label} · {new Date(start+hour).toISOString()} · {bar ? bar.close : "No completed candle available"}</li>;
      })}</ul>}</section>}
    <section className="rounded-xl border border-line p-4"><h3 className="font-bold">Weekly events and observed reactions</h3>{!news&&<p className="mt-2 text-sm text-muted">Press Refresh news + market analysis to search current sources and compare them with technical and volume evidence. The macro panel above alone is not live news.</p>}{news?.status==="unavailable"&&<p role="alert" className="mt-2 text-sm text-amber-600">{news.error}</p>}{news?.status==="available"&&<><p className="mt-2 text-xs text-muted">Research completed {news.completedAt} · market candle {news.marketAsOf??"unavailable"}. Retrieval time is not article publication time.</p><div className="mt-4 space-y-3 text-sm leading-6"><ReactMarkdown>{news.reply}</ReactMarkdown></div><ul className="mt-4 space-y-2 text-xs">{news.citations.map((c:any)=><li key={c.url}><a href={c.url} target="_blank" rel="noreferrer" className="text-accent underline">{c.title}</a></li>)}</ul><p className="mt-3 text-xs text-muted">Source-backed research includes interpretation. Check source publication times and the evidence before forming a hypothesis.</p></>}</section>
    {decision?.persistenceWarning&&<p role="alert" className="text-sm text-amber-600">{decision.persistenceWarning}</p>}
    {decision?.decisionId&&<p className="text-xs text-muted">Analysis snapshot saved. This is an observation, not an approved pre-trade plan.</p>}
  </section>;
}
