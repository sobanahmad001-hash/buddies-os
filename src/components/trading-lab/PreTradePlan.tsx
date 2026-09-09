"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { planChecks } from "@/lib/trading-lab/pretrade";
import { validateStrategyVersion } from "@/lib/trading-lab/strategy-schema";

type SavedStrategy = { name: string; trading_strategy_versions?: Array<{ id: string; version: number; definition: unknown }> };
type SavedPlan = { id: string; buddies_decision_id: string; locked_at: string; plan_snapshot: { instrument: string; direction: string; entry: number; stopLoss: number; takeProfit: number; context: string }; assessment_snapshot: { verdict: string; passed: number; total: number; rewardRisk: number } };
const localTime = (time: number) => new Date(time - new Date(time).getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
const field = "mt-1 w-full rounded-lg border border-line bg-canvas p-2.5 text-sm text-ink";

export default function PreTradePlan({ strategies, onSaved }: { strategies: SavedStrategy[]; onSaved: () => void }) {
  const versions = useMemo(() => strategies.flatMap(strategy => (strategy.trading_strategy_versions ?? []).map(version => ({ ...version, name: strategy.name, parsed: validateStrategyVersion(version.definition) }))), [strategies]);
  const [versionId, setVersionId] = useState("");
  const [direction, setDirection] = useState<"long" | "short">("long");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [historyError, setHistoryError] = useState("");
  const [receipt, setReceipt] = useState<SavedPlan | null>(null), [history, setHistory] = useState<SavedPlan[]>([]);
  const request = useRef<{ fingerprint: string; id: string } | null>(null);
  const version = versions.find(item => item.id === versionId);
  const strategy = version?.parsed.success ? version.parsed.data : null;
  const checks = strategy ? planChecks(strategy, direction) : [];
  const loadHistory = async () => {
    try {
      const response = await fetch("/api/trading-lab/plans");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Saved plans are unavailable.");
      setHistory(data.plans); setHistoryError("");
    } catch (e) { setHistoryError((e as Error).message); }
  };
  useEffect(() => { void loadHistory(); }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) ?? "");
    setError(""); setReceipt(null); setBusy(true);
    try {
      const payload = {
        strategyVersionId: versionId, direction, instrument: value("instrument"),
        entry: Number(value("entry")), stopLoss: Number(value("stopLoss")), takeProfit: Number(value("takeProfit")),
        quantity: Number(value("quantity")), quantityUnit: value("quantityUnit"), riskAmount: Number(value("riskAmount")), riskCurrency: value("riskCurrency").toUpperCase(),
        session: value("session"), context: value("context"), observedAt: new Date(value("observedAt")).toISOString(), validUntil: new Date(value("validUntil")).toISOString(),
        notExecutedYet: form.get("notExecutedYet") === "on", predictedProbability: value("probability") === "" ? null : Number(value("probability")),
        assessments: Object.fromEntries(checks.map(check => [check.key, { status: value(`${check.key}.status`), evidence: value(`${check.key}.evidence`) }])),
      };
      const fingerprint = JSON.stringify(payload);
      if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, id: crypto.randomUUID() };
      const response = await fetch("/api/trading-lab/plans", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...payload, requestId: request.current.id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.issues?.[0]?.message ?? data.error ?? "Plan was not saved.");
      setReceipt(data.plan); await loadHistory(); onSaved();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  return <section className="rounded-2xl border border-line bg-surface p-5">
    <h2 className="text-lg font-bold">Pre-trade plan</h2>
    <p className="mt-1 text-sm text-muted">Record evidence against an exact strategy version before manual execution. These are your assessments, not automatic market verification.</p>
    <label className="mt-4 block text-xs text-muted">Strategy version<select value={versionId} disabled={busy} onChange={e => {
      setVersionId(e.target.value); setReceipt(null); setError("");
      const selected = versions.find(v => v.id === e.target.value);
      setDirection(selected?.parsed.success && selected.parsed.data.direction === "short" ? "short" : "long");
    }} className={field}><option value="">Choose a saved version</option>{versions.map(v => <option key={v.id} value={v.id} disabled={!v.parsed.success}>{v.name} · v{v.version}{v.parsed.success ? "" : " · needs structured rules"}</option>)}</select></label>
    {!versions.length && <p className="mt-2 text-sm text-muted">Use Chat → Approve and save to create a structured strategy first.</p>}
    {strategy && <details className="mt-3 rounded-lg border border-line p-3 text-xs"><summary className="cursor-pointer font-semibold">Version context and execution assumptions</summary><div className="mt-2 space-y-2 text-muted"><p>{strategy.description}</p><p>Context: {strategy.timeframes.context.join(", ") || "not specified"} · Setup: {strategy.timeframes.setup} · Trigger: {strategy.timeframes.trigger}</p><p>Timing: {strategy.execution.timing} · Spread: {strategy.execution.spread} · Commission: {strategy.execution.commission} · Slippage: {strategy.execution.slippage}</p><p>Progressive sizing: multiplier {strategy.sizing.multiplier ?? "not specified"}, maximum increases {strategy.sizing.maxIncreases ?? "not specified"}</p></div></details>}
    {strategy && <form key={`${versionId}:${direction}`} onSubmit={submit} className="mt-4 space-y-4" onChange={() => setReceipt(null)}><fieldset disabled={busy} className="space-y-4 disabled:opacity-60">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs text-muted">Instrument<select name="instrument" className={field}>{strategy.symbols.map(symbol => <option key={symbol}>{symbol}</option>)}</select></label>
        <label className="text-xs text-muted">Direction<select value={direction} onChange={e => setDirection(e.target.value as "long" | "short")} className={field}>{strategy.direction !== "short" && <option value="long">Long</option>}{strategy.direction !== "long" && <option value="short">Short</option>}</select></label>
        <label className="text-xs text-muted">Session<input name="session" required maxLength={100} placeholder="Session and timezone" className={field}/></label>
        {[["entry", "Planned entry"], ["stopLoss", "Planned SL"], ["takeProfit", "Planned TP"], ["quantity", "Quantity"], ["riskAmount", "Planned monetary risk"]].map(([name, label]) => <label key={name} className="text-xs text-muted">{label}<input name={name} type="number" step="any" min="0.00000001" required className={field}/></label>)}
        <label className="text-xs text-muted">Quantity unit<select name="quantityUnit" className={field}><option value="lots">Lots</option><option value="units">Units</option><option value="contracts">Contracts</option></select></label>
        <label className="text-xs text-muted">Risk currency<input name="riskCurrency" required maxLength={3} pattern="[A-Za-z]{3}" placeholder="e.g. USD" className={field}/></label>
        <label className="text-xs text-muted">Evidence observed at · local time<input name="observedAt" type="datetime-local" required defaultValue={localTime(Date.now())} className={field}/></label>
        <label className="text-xs text-muted">Plan expires at · local time<input name="validUntil" type="datetime-local" required defaultValue={localTime(Date.now() + 3600_000)} className={field}/></label>
        <label className="text-xs text-muted">Your probability estimate · optional %<input name="probability" type="number" min="0" max="100" step="1" placeholder="Unknown" className={field}/></label>
      </div>
      <p className="text-xs text-muted">Monetary risk is your estimate using the broker’s contract size. Probability is uncalibrated and refers to TP before SL under this plan by expiry—not profit after discretionary exits.</p>
      <label className="block text-xs text-muted">Market thesis and evidence sources<textarea name="context" required maxLength={6000} placeholder="Context, setup, confirmation, volume/Wyckoff, regime, news and sources. Mark missing evidence explicitly." className={`${field} min-h-24`}/></label>
      <div className="space-y-3"><p className="text-sm font-semibold">Strategy conditions and risk checks</p><p className="text-xs text-muted">Use the displayed timeframe. ALL/ANY groups retain the strategy’s logic; every safety check is required. Missing required evidence produces WAIT unless another required condition fails.</p>
        {checks.map(check => <div key={check.key} className="grid gap-2 rounded-lg border border-line p-3 sm:grid-cols-[1fr_150px]"><label htmlFor={`${check.key}.status`} className="text-xs font-medium">{check.label}</label><select id={`${check.key}.status`} name={`${check.key}.status`} defaultValue="unknown" className="rounded-lg border border-line bg-canvas p-2 text-xs"><option value="unknown">Unknown</option><option value="pass">Pass</option><option value="fail">Fail</option></select><input aria-label={`Evidence: ${check.label}`} name={`${check.key}.evidence`} maxLength={2000} placeholder="Evidence/source (required for pass or fail)" className="rounded-lg border border-line bg-canvas p-2 text-xs sm:col-span-2"/></div>)}
      </div>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="notExecutedYet" required className="mt-1"/>I have not executed this trade. Execution timing will be reconciled later.</label>
      <p className="text-xs text-muted">Saving locks the original plan. Changes need a new record. REVIEW means your required assessments passed; it is not an instruction to execute.</p>
      <button type="submit" className="rounded-lg bg-accent px-4 py-2.5 text-sm font-bold text-white">{busy ? "Saving…" : "Save & lock plan"}</button>
    </fieldset></form>}
    {error && <p role="alert" className="mt-3 text-sm text-red-500">{error}</p>}
    {receipt && <div role="status" className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm"><p className="font-semibold">Plan locked · {receipt.assessment_snapshot.verdict}</p><p className="mt-1">{receipt.assessment_snapshot.passed}/{receipt.assessment_snapshot.total} individual checks marked passed · Planned {receipt.assessment_snapshot.rewardRisk}R</p><p className="mt-1 text-xs">Recorded {new Date(receipt.locked_at).toLocaleString()}. Linked to a shared Buddies decision. Select this plan in Journal when recording execution.</p></div>}
    <div className="mt-5 border-t border-line pt-4"><h3 className="text-sm font-semibold">Recent locked plans</h3>{historyError && <p className="mt-2 text-xs text-amber-500">{historyError}</p>}{!history.length && !historyError && <p className="mt-2 text-xs text-muted">No locked plans yet.</p>}
      {history.map(item => <details key={item.id} className="mt-2 rounded-lg border border-line p-3 text-xs"><summary className="cursor-pointer font-semibold">{item.plan_snapshot.instrument} · {item.plan_snapshot.direction} · {item.assessment_snapshot.verdict} · {new Date(item.locked_at).toLocaleString()}</summary><p className="mt-2">Entry {item.plan_snapshot.entry} · SL {item.plan_snapshot.stopLoss} · TP {item.plan_snapshot.takeProfit}</p><p className="mt-2 whitespace-pre-wrap text-muted">{item.plan_snapshot.context}</p><p className="mt-2 break-all text-muted">Journal plan ID: {item.id}</p></details>)}
    </div>
  </section>;
}
