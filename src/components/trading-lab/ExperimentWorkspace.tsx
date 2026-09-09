"use client";
import { FormEvent, useEffect, useState } from "react";
import PreTradePlan from "./PreTradePlan";
import ManualStrategyEditor from "./ManualStrategyEditor";
import ExperimentResults from "./ExperimentResults";
import { buttonClass, Field, formValues, inputClass, labApi, panelClass, TextField, useRequestIdentity } from "./manual-ui";

export default function ExperimentWorkspace({ strategies, onStrategiesSaved, onExecute }: { strategies: any[]; onStrategiesSaved: () => Promise<void>; onExecute: () => void }) {
  const [experiments, setExperiments] = useState<any[]>([]), [selected, setSelected] = useState("");
  const [detail, setDetail] = useState<any>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const identity = useRequestIdentity();
  const versions = strategies.flatMap(s => (s.trading_strategy_versions ?? []).map((v: any) => ({ ...v, name: s.name })));
  const reload = async (id = selected) => {
    const data = await labApi("experiments"); setExperiments(data.experiments);
    if (id) setDetail(await labApi(`experiments?id=${encodeURIComponent(id)}`));
  };
  useEffect(() => { let active = true; setDetail(null); labApi("experiments").then(async data => {
    if (active) setExperiments(data.experiments);
    if (selected) { const result = await labApi(`experiments?id=${encodeURIComponent(selected)}`); if (active) setDetail(result); }
    if (active) setError("");
  }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, [selected]);
  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const v = formValues(event.currentTarget); setBusy(true); setError("");
    try {
      const input = { strategyVersionId: v.text("strategyVersionId"), parentExperimentId: v.text("parentExperimentId") || null,
        name: v.text("name"), hypothesis: v.text("hypothesis"), session: v.text("session"), timezone: v.text("timezone"), targetSample: v.number("targetSample"),
        eligibility: v.text("eligibility"), invalidation: v.text("invalidation"), stopConditions: v.text("stopConditions"), reviewCriteria: v.text("reviewCriteria"),
        riskCurrency: v.text("riskCurrency").toUpperCase(), riskAmount: v.number("riskAmount"), entryTolerance: v.number("entryTolerance"), protectionTolerance: v.number("protectionTolerance"), quantityTolerancePct: v.number("quantityTolerancePct"), approved: true };
      const saved = await labApi("experiments", { action: "create", input: { ...input, requestId: identity(input) } });
      setSelected(saved.experiment.id); await reload(saved.experiment.id);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const observe = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = event.currentTarget, v = formValues(form); setBusy(true); setError("");
    try {
      const input = { experimentId: selected, startedAt: v.time("startedAt"), endedAt: v.time("endedAt"), qualifyingSetups: v.number("qualifyingSetups"), takenSetups: v.number("takenSetups"), notes: v.text("notes") };
      await labApi("experiments", { action: "observe", input: { ...input, requestId: identity(input) } }); await reload(); form.reset();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return <div className="space-y-4">
    <section className={panelClass}><h2 className="text-xl font-bold">Manual strategy experiments</h2><p className="mt-2 text-sm text-muted">Define one version, lock a sample, capture plans before execution, then review the evidence. Actual orders stay with your broker.</p>
      <label className="mt-4 block text-xs text-muted">Experiment<select value={selected} onChange={e => setSelected(e.target.value)} className={inputClass}><option value="">Choose an experiment</option>{experiments.map(e => <option key={e.id} value={e.id}>{e.protocol.name} · {e.review_snapshot ? e.review_snapshot.action : "active"}</option>)}</select></label>
    </section>
    <ManualStrategyEditor strategies={strategies} onSaved={onStrategiesSaved}/>
    <details className={panelClass} open={!experiments.length}><summary className="cursor-pointer font-semibold">Approve a new controlled sample</summary><p className="mt-2 text-sm text-muted">A 20-trade sample is an initial review checkpoint. Risk and scoring definitions stay fixed for this sample; changing them starts another experiment.</p>
      <form onSubmit={create} className="mt-4"><fieldset disabled={busy} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs text-muted">Exact strategy version<select name="strategyVersionId" required className={inputClass}><option value="">Choose saved rules</option>{versions.map(v => <option key={v.id} value={v.id}>{v.name} · v{v.version}</option>)}</select></label>
          <label className="text-xs text-muted">Previous experiment · optional<select name="parentExperimentId" className={inputClass}><option value="">First / independent experiment</option>{experiments.filter(e => e.review_snapshot).map(e => <option key={e.id} value={e.id}>{e.protocol.name} · {e.review_snapshot.action}</option>)}</select></label>
          <Field name="name" label="Experiment name"/><Field name="targetSample" label="Target number of trades" type="number" min={2} max={1000} value={20}/>
          <Field name="session" label="Defined trading session" placeholder="London, 08:00–11:00"/><Field name="timezone" label="Session timezone" placeholder="Europe/London"/>
          <Field name="riskCurrency" label="Risk currency · three-letter code" placeholder="USD"/><Field name="riskAmount" label="Fixed planned monetary risk per trade" type="number" min={0.01}/>
          <Field name="entryTolerance" label="Allowed entry deviation · price units" type="number" min={0}/><Field name="protectionTolerance" label="Allowed initial SL/TP deviation · price units" type="number" min={0}/><Field name="quantityTolerancePct" label="Allowed initial quantity deviation · %" type="number" min={0} max={100}/>
        </div>
        <TextField name="hypothesis" label="Hypothesis being tested"/><TextField name="eligibility" label="Which setups qualify? What is excluded before outcomes are known?"/>
        <TextField name="invalidation" label="Setup invalidation conditions"/><TextField name="stopConditions" label="Risk limits and reasons to stop the sample early"/>
        <TextField name="reviewCriteria" label="Primary metrics and criteria for KEEP / MODIFY / RETEST / KILL"/>
        <p className="text-xs text-muted">Execution scoring gives equal weight to initial entry, SL, TP, quantity, execution within the recorded window, and reviewed management compliance. An incomplete review leaves the score unknown. The first target number of recorded executions forms the sample, including violations; additional trades remain visible outside it.</p>
        <label className="flex gap-2 text-sm"><input type="checkbox" required/>I approve this exact strategy version and experiment protocol.</label>
        <button className={buttonClass}>{busy ? "Saving…" : "Approve & start sample"}</button>
      </fieldset></form>
    </details>
    {error && <p role="alert" className="rounded-lg border border-amber-500/30 p-3 text-sm text-amber-600">{error}</p>}
    {detail && <>
      <details className={panelClass}><summary className="cursor-pointer font-semibold">Frozen protocol · {detail.experiment.protocol.name}</summary><dl className="mt-3 space-y-3 text-sm">{["hypothesis", "session", "timezone", "eligibility", "invalidation", "stopConditions", "reviewCriteria"].map(key => <div key={key}><dt className="font-semibold">{key.replace(/([A-Z])/g, " $1")}</dt><dd className="mt-1 whitespace-pre-wrap text-muted">{detail.experiment.protocol[key]}</dd></div>)}</dl></details>
      {!detail.experiment.review_snapshot && <>
        <PreTradePlan key={selected} strategies={strategies} experiment={detail.experiment} onSaved={() => { void reload().catch(e => setError(e.message)); }}/>
        <button type="button" onClick={onExecute} className={buttonClass}>Record manual execution →</button>
        <details className={panelClass}><summary className="cursor-pointer font-semibold">Record session coverage and missed setups</summary><p className="mt-2 text-sm text-muted">Log periods actually observed, including those with zero setups. Avoid overlapping time windows. Record missed qualifying setups and reasons here so frequency includes opportunities you did not take.</p>
          <form onSubmit={observe} className="mt-4"><fieldset disabled={busy} className="space-y-3"><div className="grid gap-3 sm:grid-cols-2"><Field name="startedAt" label="Observation started · local time" type="datetime-local"/><Field name="endedAt" label="Observation ended · local time" type="datetime-local"/><Field name="qualifyingSetups" label="All qualifying setups observed" type="number" min={0}/><Field name="takenSetups" label="Qualifying setups you executed" type="number" min={0}/></div><TextField name="notes" label="Coverage source, missed setup details and reasons"/><button className={buttonClass}>Save observation coverage</button></fieldset></form>
          <ul className="mt-3 space-y-2 text-xs text-muted">{detail.observations.map((o: any) => <li key={o.id}>{new Date(o.started_at).toLocaleString()}–{new Date(o.ended_at).toLocaleTimeString()} · {o.qualifying_setups} qualifying, {o.taken_setups} taken · {o.notes}</li>)}</ul>
        </details>
      </>}
      <ExperimentResults key={selected} detail={detail} onSaved={reload}/>
    </>}
  </div>;
}
