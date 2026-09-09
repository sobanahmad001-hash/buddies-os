"use client";
import { FormEvent, useState } from "react";
import { buttonClass, Field, formValues, inputClass, labApi, panelClass, TextField, useRequestIdentity } from "./manual-ui";

export default function ManualStrategyEditor({ strategies, onSaved }: { strategies: any[]; onSaved: () => Promise<void> }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const requestId = useRequestIdentity();
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = event.currentTarget, v = formValues(form); setBusy(true); setMessage("");
    try {
      const conditions = (text: string) => ({ logic: v.text("logic"), conditions: text.split("\n").map(s => s.trim()).filter(Boolean).map((rule, i) => ({ id: `condition_${i + 1}`, left: `manual:${rule}`, operator: "eq", right: true, timeframe: v.text("trigger"), completedCandleOnly: true })) });
      const direction = v.text("direction");
      const definition = {
        schemaVersion: 1, name: v.text("name"), description: v.text("hypothesis"), market: v.text("market"), symbols: v.text("symbols").split(",").map(s => s.trim()).filter(Boolean), direction,
        timeframes: { context: v.text("context").split(",").map(s => s.trim()).filter(Boolean), setup: v.text("setup"), trigger: v.text("trigger") },
        ...(direction === "both" ? { longEntry: conditions(v.text("conditions")), shortEntry: conditions(v.text("shortConditions")) } : { entry: conditions(v.text("conditions")) }),
        exit: { stopType: "fixed", stopValue: v.number("stopDistance"), targetType: "risk_multiple", targetValue: v.number("targetR") },
        sizing: { type: "fixed_risk_usd", value: v.number("risk") },
        safety: { maxDailyLossPct: v.number("dailyLoss"), maxDrawdownPct: v.number("drawdown"), maxConcurrentPositions: v.number("positions"), maxTradesPerSession: v.number("sessionTrades"), eventVeto: v.checked("newsVeto") },
        execution: { timing: v.text("timing"), spread: v.number("spread"), commission: v.number("commission"), slippage: v.number("slippage") },
      };
      const payload = { action: "save", definition, strategyId: v.text("strategyId") || null, changeNote: v.text("changeNote") };
      const saved = await labApi("strategies", { ...payload, requestId: requestId(payload) });
      setMessage(`Saved ${saved.strategy.name} · v${saved.version.version}. Choose it in a new experiment.`); await onSaved();
    } catch (e) { setMessage((e as Error).message); } finally { setBusy(false); }
  };
  return <details className={panelClass}><summary className="cursor-pointer font-semibold">Define a manual strategy or save a new version</summary>
    <p className="mt-2 text-sm text-muted">Define the rules in plain language. This editor supports fixed stop distance and fixed R targets. Each version is a complete definition; existing versions keep their original rules. Use Strategy Builder chat for other structures.</p>
    <form onSubmit={submit} className="mt-4"><fieldset disabled={busy} className="space-y-4">
      <label className="block text-xs text-muted">Strategy family<select name="strategyId" className={inputClass}><option value="">Create a new strategy</option>{strategies.map(s => <option key={s.id} value={s.id}>{s.name} · save the next version</option>)}</select></label>
      <div className="grid gap-3 sm:grid-cols-3"><Field label="Version name" name="name" placeholder="XAU London confirmation"/><Field label="Instrument(s), comma separated" name="symbols" placeholder="XAU/USD"/>
        <label className="text-xs text-muted">Market<select name="market" className={inputClass}>{["gold", "forex", "futures", "crypto", "equities"].map(m => <option key={m}>{m}</option>)}</select></label>
        <label className="text-xs text-muted">Direction<select name="direction" className={inputClass}><option value="long">Long</option><option value="short">Short</option><option value="both">Both, with separate rules</option></select></label>
        <Field label="Context timeframe(s)" name="context" placeholder="1h, 4h"/><Field label="Setup timeframe" name="setup" placeholder="15min"/><Field label="Confirmation / trigger timeframe" name="trigger" placeholder="5min"/>
        <label className="text-xs text-muted">Condition logic<select name="logic" className={inputClass}><option value="all">All conditions required</option><option value="any">At least one condition required</option></select></label>
      </div>
      <TextField name="hypothesis" label="Hypothesis / methodology" placeholder="What repeatable effect are you testing, and why should it exist?"/>
      <TextField name="conditions" label="Entry and confirmation rules · one per line (long rules if both directions)" placeholder="Use observable conditions and identify any different timeframe in the rule text."/>
      <TextField name="shortConditions" label="Short rules · required only for both directions" required={false}/>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field name="stopDistance" label="Fixed SL distance · instrument price units" type="number" min={0.000001}/><Field name="targetR" label="TP · R multiple" type="number" min={0.01}/><Field name="risk" label="Fixed monetary risk · USD" type="number" min={0.01}/>
        <Field name="dailyLoss" label="Daily loss limit · %" type="number" min={0.01} max={100}/><Field name="drawdown" label="Drawdown stop · %" type="number" min={0.01} max={100}/><Field name="positions" label="Maximum concurrent positions" type="number" min={1} max={20}/><Field name="sessionTrades" label="Maximum trades per session" type="number" min={1} max={100}/>
        <label className="text-xs text-muted">Execution timing<select name="timing" className={inputClass}><option value="bar_close">After confirmation candle closes</option><option value="next_open">Next candle open</option></select></label>
        <Field name="spread" label="Assumed spread · price units" type="number" min={0}/><Field name="commission" label="Assumed commission · USD per trade" type="number" min={0}/><Field name="slippage" label="Assumed slippage · price units" type="number" min={0}/>
      </div>
      <label className="flex gap-2 text-sm"><input name="newsVeto" type="checkbox"/>Require a news/event risk check</label>
      <TextField name="changeNote" label="What is new in this version?"/>
      <label className="flex gap-2 text-sm"><input type="checkbox" required/>I approve saving these strategy rules.</label>
      <button className={buttonClass}>{busy ? "Saving…" : "Approve & save version"}</button>
    </fieldset></form>{message && <p role="status" className="mt-3 text-sm">{message}</p>}
  </details>;
}
