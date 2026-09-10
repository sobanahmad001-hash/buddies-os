import { z } from "zod";

export const analysisPillars = ["technical", "volume", "fundamental"] as const;
export const analysisEvidenceSchema = z.object({
  schemaVersion: z.literal(1),
  method: z.literal("manual_pretrade"),
  technical: pillar(), volume: pillar(), fundamental: pillar(),
}).strict();
function pillar() {
  return z.object({
    stance: z.enum(["supports", "opposes", "neutral", "unknown"]),
    evidence: z.string().trim().max(2000),
    source: z.string().trim().max(1000),
    asOf: z.string().datetime({ offset: true }).nullable(),
  }).strict().superRefine((v, ctx) => {
    if (v.stance !== "unknown" && (!v.evidence || !v.source || !v.asOf))
      ctx.addIssue({ code: "custom", message: "Known analysis needs evidence, a source and its timestamp." });
  });
}

// Called only with the fixed sample of one experiment. Never backfill old labels.
export function analysisContribution(trades: any[]) {
  const closed = trades.filter(t => t.status === "closed" && t.net_pnl != null && Number.isFinite(Number(t.net_pnl)) && Number(t.planned_risk_amount) > 0);
  const eligible = closed.flatMap(t => {
    const a = analysisEvidenceSchema.safeParse(t.plan_snapshot?.analysisEvidence);
    const opened = Date.parse(t.open_snapshot?.occurredAt), locked = Date.parse(t.locked_at), expires = Date.parse(t.plan_snapshot?.validUntil);
    if (!a.success || !Number.isFinite(opened) || !Number.isFinite(expires) || !Number.isFinite(Date.parse(t.plan_snapshot?.observedAt)) || opened < locked || opened >= expires || !Number.isFinite(locked)) return [];
    if (analysisPillars.some(k => a.data[k].asOf && (Date.parse(a.data[k].asOf!) > locked || Date.parse(a.data[k].asOf!) > Date.parse(t.plan_snapshot.observedAt)))) return [];
    return [{ trade: t, analysis: a.data, r: Number(t.net_pnl) / Number(t.planned_risk_amount) }];
  });
  const avg = (xs: number[]) => xs.length ? Number((xs.reduce((a,b) => a+b,0)/xs.length).toFixed(4)) : null;
  const summary = (xs: typeof eligible) => {
    const refs = xs.flatMap(x => typeof x.trade.review_snapshot?.strategyReference?.r === "number" && Number.isFinite(x.trade.review_snapshot.strategyReference.r) ? [x.trade.review_snapshot.strategyReference.r] : []);
    return { count: xs.length, expectancyR: avg(xs.map(x=>x.r)), winRate: avg(xs.map(x=>x.r>0?100:0)), referenceCount: refs.length, referenceExpectancyR: avg(refs) };
  };
  const increments = [ {base:["technical"],added:"volume"}, {base:["technical"],added:"fundamental"}, {base:["technical","volume"],added:"fundamental"} ] as const;
  return { incremental: increments.map(({base,added})=>{
    const fixed=eligible.filter(x=>base.every(k=>x.analysis[k].stance==="supports") && x.analysis[added].stance!=="unknown");
    const aligned=summary(fixed.filter(x=>x.analysis[added].stance==="supports"));
    const other=summary(fixed.filter(x=>x.analysis[added].stance!=="supports"));
    return {base,added,aligned,other,differenceR:aligned.expectancyR!==null&&other.expectancyR!==null?Number((aligned.expectancyR-other.expectancyR).toFixed(4)):null};
  }), closed: closed.length, eligible: eligible.length, excluded: closed.length-eligible.length,
    rows: Array.from({length:7},(_,i)=>i+1).map(mask=> {
      const keys=analysisPillars.filter((_,i)=>mask & (1<<i));
      const known=eligible.filter(x=>keys.every(k=>x.analysis[k].stance!=="unknown"));
      const aligned=summary(known.filter(x=>keys.every(k=>x.analysis[k].stance==="supports")));
      const other=summary(known.filter(x=>keys.some(k=>x.analysis[k].stance!=="supports")));
      return { keys, aligned, other, unknown: eligible.length-known.length, differenceR: aligned.expectancyR!==null && other.expectancyR!==null ? Number((aligned.expectancyR-other.expectancyR).toFixed(4)) : null };
    }) };
}
