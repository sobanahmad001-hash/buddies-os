"use client";
import { FormEvent, useState } from "react";
import { buttonClass, Field, formValues, inputClass, labApi, panelClass, TextField, useRequestIdentity } from "./manual-ui";

const show = (value: unknown, suffix = "") => value == null ? "Unknown" : `${value}${suffix}`;
export default function ExperimentResults({ detail, onSaved }: { detail: any; onSaved: () => Promise<void> }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""); const identity = useRequestIdentity();
  const { experiment: e, metrics: m } = detail;
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const v = formValues(event.currentTarget); setBusy(true); setMessage("");
    try {
      const input = { experimentId: e.id, action: v.text("action"), rationale: v.text("rationale"), nextHypothesis: v.text("nextHypothesis"), stopReason: v.text("stopReason"), approved: true };
      await labApi("experiments", { action: "review", input: { ...input, requestId: identity(input) } }); await onSaved();
    } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  };
  const points = m.actual.curve as { r: number }[];
  const values = [0, ...points.map(p => p.r)], low = Math.min(...values), high = Math.max(...values), span = high - low || 1;
  return <section className={`${panelClass} space-y-4`}>
    <div><h2 className="text-lg font-bold">Experiment review</h2><p className="mt-1 text-sm text-muted">{m.closed}/{m.target} closed · {m.open} open · {m.admitted} admitted · {detail.outsideSample} outside the fixed sample</p></div>
    <div className="rounded-lg bg-surface-subtle p-3 text-sm">{m.evidenceNote} Reference outcomes are manually reconstructed and require supporting evidence.</div>
    <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead><tr className="border-b border-line"><th className="p-2">Measure</th><th className="p-2">Actual</th><th className="p-2">Frozen plan</th><th className="p-2">Strategy reference</th></tr></thead><tbody>
      {[["Observed trades", "count"], ["Net result · R", "totalR"], ["Win rate · %", "winRate"], ["Average win · R", "averageWinR"], ["Average loss · R", "averageLossR"], ["Realized payoff ratio", "realizedPayoff"], ["Expectancy · R/trade", "expectancyR"], ["Profit factor", "profitFactor"], ["Closed-trade drawdown · R", "closedTradeDrawdownR"]].map(([label, key]) => <tr key={key} className="border-b border-line"><td className="p-2 text-muted">{label}</td>{[m.actual, m.frozenPlanReference, m.strategyReference].map((stream, i) => <td key={i} className="p-2">{stream.count === 0 && key !== "count" ? "Unknown" : key === "profitFactor" && stream.noLosses ? "No losses; undefined" : show(stream[key])}</td>)}</tr>)}
    </tbody></table></div>
    {points.length > 0 && <figure><svg role="img" aria-label="Cumulative net R ordered by trade close time" viewBox="0 0 600 160" className="h-40 w-full rounded-lg bg-surface-subtle"><polyline fill="none" stroke="currentColor" className="text-accent" strokeWidth="3" points={values.map((r, i) => `${10 + i / (values.length - 1) * 580},${150 - (r - low) / span * 140}`).join(" ")}/></svg><figcaption className="mt-1 text-xs text-muted">Cumulative actual net R · ordered by closing time. Breakevens: {m.actual.breakevens}. Drawdown excludes intratrade equity changes.</figcaption></figure>}
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-lg border border-line p-3"><h3 className="font-semibold">Strategy adherence</h3><p className="mt-2 text-lg">{show(m.compliance.rate, "%")}</p><p className="text-xs text-muted">{m.compliance.passed}/{m.compliance.known} assessed trades passed. {m.compliance.reviewed} reviewed.</p></div>
      <div className="rounded-lg border border-line p-3"><h3 className="font-semibold">Execution score</h3><p className="mt-2 text-lg">{show(m.execution.score, "%")}</p><p className="text-xs text-muted">{m.execution.scoredTrades} fully assessed trades. Entry, SL, TP, quantity, timing and management use the frozen scoring rules.</p></div>
      <div className="rounded-lg border border-line p-3"><h3 className="font-semibold">Paired execution gap</h3><p className="mt-2 text-lg">{m.paired.count ? show(m.paired.actualMinusPlanR, "R") : "Unknown"}</p><p className="text-xs text-muted">Actual minus plan across {m.paired.count} matching trades. This gap is not proven behavioral cost.</p></div>
    </div>
    <p className="text-sm">Prediction calibration: {m.probability.count} resolved observations · mean prediction {show(m.probability.averagePrediction, "%")} · event rate {show(m.probability.actualEventRate, "%")} · Brier score {show(m.probability.brier)}. {m.hindsightOrExpired} trades had execution before capture or after expiry.</p>
    <p className="text-sm">Observed coverage: {m.coverage.sessions} periods · {show(m.coverage.hours)} hours · {m.coverage.qualifyingSetups} qualifying setups · {m.coverage.missedSetups} missed · {show(m.coverage.setupsPerHour)} setups/hour. Counts are manually recorded.</p>
    <details className="rounded-lg border border-line p-3"><summary className="cursor-pointer font-semibold">Behavior and condition breakdown</summary>
      {!m.behavior.length ? <p className="mt-3 text-sm text-muted">No behavioral violations recorded in reviewed trades.</p> : <ul className="mt-3 space-y-2 text-sm">{m.behavior.map((b: any) => <li key={b.type}>{b.type.replaceAll("_", " ")}: {b.trades} trades · associated result {b.associatedNetR}R</li>)}</ul>}
      <p className="mt-2 text-xs text-muted">Associated returns are not the cost caused by the behavior. Groups overlap and must not be added together.</p>
      <div className="mt-3 space-y-2">{m.conditions.map((c: any) => <div key={c.label} className="rounded-lg bg-surface-subtle p-3 text-xs"><p className="font-semibold">{c.label}</p><p className="mt-1">{c.groups.map((g: any) => `${g.status}: n=${g.count}, mean ${show(g.expectancyR)}R`).join(" · ")}</p></div>)}</div>
      <p className="mt-2 text-xs text-muted">These are exploratory associations. Removing a condition requires a new version and a fresh sample.</p>
    </details>
    {e.review_snapshot ? <div className="rounded-lg border border-line p-4"><p className="font-bold">Recorded action: {e.review_snapshot.action}</p><p className="mt-2 whitespace-pre-wrap text-sm">{e.review_snapshot.rationale}</p><p className="mt-2 text-sm">Next hypothesis: {e.review_snapshot.nextHypothesis || "Not specified"}</p><p className="mt-2 text-xs text-muted">Saved as a shared Buddies decision. Start a fresh approved experiment to continue.</p></div>
      : <form onSubmit={submit}><fieldset disabled={busy || m.open > 0} className="space-y-3 disabled:opacity-50"><p className="text-sm font-semibold">Record your sample decision</p>
        <label className="block text-xs text-muted">Action<select name="action" className={inputClass}>{["KEEP", "MODIFY", "RETEST", "KILL"].map(a => <option key={a}>{a}</option>)}</select></label>
        <TextField name="rationale" label="What does the evidence support, and what remains uncertain?"/>
        <TextField name="nextHypothesis" label="Change or hypothesis for the next version" required={false}/>
        <Field name="stopReason" label="Early stop reason · required before the target sample is complete" required={!m.checkpointReached}/>
        <label className="flex gap-2 text-sm"><input type="checkbox" required/>I approve this review action and closing the sample.</label><button className={buttonClass}>Save sample decision</button>
      </fieldset>{m.open > 0 && <p className="mt-2 text-sm text-muted">Close the remaining sample trades before finalizing the review.</p>}</form>}
    {message && <p role="alert" className="text-sm text-red-500">{message}</p>}
  </section>;
}
