"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, CheckCircle2, CircleAlert, Loader2, RefreshCw, Save, TrendingUp } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

type ReviewStats = { completed: number; open: number; overdue: number; approvals: number; activeProjects: number; agentRuns: number };

export default function ReviewsPage() {
  const [period, setPeriod] = useState<"daily" | "weekly">("weekly");
  const [stats, setStats] = useState<ReviewStats>({ completed: 0, open: 0, overdue: 0, approvals: 0, activeProjects: 0, agentRuns: 0 });
  const [wins, setWins] = useState(""); const [lessons, setLessons] = useState(""); const [nextFocus, setNextFocus] = useState("");
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [saved, setSaved] = useState(false);

  const range = useMemo(() => {
    const end = new Date(); const start = new Date(end);
    start.setDate(end.getDate() - (period === "daily" ? 1 : 7));
    return { start, end };
  }, [period]);

  useEffect(() => { load(); }, [period]);
  async function load() {
    setLoading(true); const { data: { user } } = await supabase.auth.getUser(); if (!user) return;
    const start = range.start.toISOString(); const today = new Date().toISOString().slice(0, 10);
    const [tasksRes, projectsRes, inboxRes, runsRes, reviewRes] = await Promise.all([
      supabase.from("project_tasks").select("status,due_date,updated_at").eq("user_id",user.id),
      supabase.from("projects").select("id",{count:"exact",head:true}).eq("user_id",user.id).eq("status","active"),
      supabase.from("inbox_items").select("id",{count:"exact",head:true}).eq("user_id",user.id).eq("item_type","approval").eq("status","open"),
      supabase.from("coding_agent_executions").select("id",{count:"exact",head:true}).eq("user_id",user.id).gte("requested_at",start),
      supabase.from("personal_reviews").select("wins,lessons,narrative").eq("user_id",user.id).eq("review_type",period).eq("period_start",range.start.toISOString().slice(0,10)).maybeSingle(),
    ]);
    const tasks = tasksRes.data ?? [];
    setStats({ completed: tasks.filter(t=>t.status==="done" && t.updated_at>=start).length, open: tasks.filter(t=>t.status!=="done").length,
      overdue: tasks.filter(t=>t.status!=="done" && t.due_date && t.due_date<today).length, approvals: inboxRes.count??0,
      activeProjects: projectsRes.count??0, agentRuns:runsRes.count??0 });
    const prior = reviewRes.data; setWins(Array.isArray(prior?.wins)?prior.wins.join("\n"):""); setLessons(Array.isArray(prior?.lessons)?prior.lessons.join("\n"):""); setNextFocus(prior?.narrative??""); setLoading(false);
  }
  async function save() {
    setSaving(true); const { data:{user} }=await supabase.auth.getUser(); if(!user)return;
    const lines=(v:string)=>v.split("\n").map(x=>x.trim()).filter(Boolean);
    await supabase.from("personal_reviews").upsert({user_id:user.id,review_type:period,period_start:range.start.toISOString().slice(0,10),period_end:range.end.toISOString().slice(0,10),wins:lines(wins),lessons:lines(lessons),narrative:nextFocus,metrics:stats,status:"confirmed",confirmed_at:new Date().toISOString(),updated_at:new Date().toISOString()},{onConflict:"user_id,review_type,period_start"});
    setSaving(false);setSaved(true);setTimeout(()=>setSaved(false),2000);
  }
  const completion = stats.completed + stats.open ? Math.round(stats.completed/(stats.completed+stats.open)*100) : 0;
  return <div className="flex-1 overflow-auto bg-canvas"><div className="mx-auto max-w-[1000px] p-4 md:p-8">
    <header className="mb-6 flex items-start justify-between"><div><p className="text-[11px] font-semibold uppercase tracking-[.16em] text-accent">Learning loop</p><h1 className="mt-1 text-2xl font-semibold text-ink">Reviews</h1><p className="mt-1 text-sm text-muted">See what moved, what stalled, and what to change next.</p></div>
      <div className="flex rounded-xl border border-line bg-surface-subtle p-1">{(["daily","weekly"] as const).map(x=><button key={x} onClick={()=>setPeriod(x)} className={`rounded-lg px-3 py-2 text-xs font-medium capitalize ${period===x?"bg-surface text-ink shadow-sm":"text-muted"}`}>{x}</button>)}</div></header>
    {loading?<div className="flex items-center gap-2 p-10 text-muted"><Loader2 className="animate-spin" size={16}/>Building your review…</div>:<>
      <div className="mb-5 grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">{[
        ["Completed",stats.completed,CheckCircle2,"text-positive"],["Open",stats.open,BarChart3,"text-ink"],["Overdue",stats.overdue,CircleAlert,"text-risk"],["Approvals",stats.approvals,CircleAlert,"text-caution"],["Projects",stats.activeProjects,TrendingUp,"text-accent"],["Agent runs",stats.agentRuns,RefreshCw,"text-muted"]
      ].map(([label,value,Icon,tone]:any)=><div key={label} className="rounded-2xl border border-line bg-surface p-4"><Icon size={15} className={tone}/><p className={`mt-3 text-2xl font-semibold ${tone}`}>{value}</p><p className="mt-1 text-[10px] uppercase tracking-wide text-muted">{label}</p></div>)}</div>
      <section className="mb-5 rounded-2xl border border-line bg-surface p-5"><div className="mb-2 flex justify-between text-xs"><span className="font-medium text-ink">Commitment completion</span><span className="text-muted">{completion}%</span></div><div className="h-2 overflow-hidden rounded-full bg-surface-subtle"><div className="h-full rounded-full bg-positive" style={{width:`${completion}%`}}/></div></section>
      <div className="grid gap-4 md:grid-cols-2"><ReviewField title="Wins" hint="One item per line" value={wins} onChange={setWins}/><ReviewField title="Lessons" hint="What should Buddies remember?" value={lessons} onChange={setLessons}/><div className="md:col-span-2"><ReviewField title="Next focus" hint="The outcome that matters most next" value={nextFocus} onChange={setNextFocus}/></div></div>
      <button onClick={save} disabled={saving} className="mt-4 flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-50">{saving?<Loader2 className="animate-spin" size={14}/>:saved?<CheckCircle2 size={14}/>:<Save size={14}/>} {saved?"Review saved":"Confirm review"}</button>
    </>}</div></div>;
}
function ReviewField({title,hint,value,onChange}:{title:string;hint:string;value:string;onChange:(v:string)=>void}){return <label className="block rounded-2xl border border-line bg-surface p-5"><span className="text-sm font-semibold text-ink">{title}</span><span className="ml-2 text-xs text-faint">{hint}</span><textarea value={value} onChange={e=>onChange(e.target.value)} rows={5} className="mt-3 w-full resize-none rounded-xl border border-line bg-surface-subtle p-3 text-sm text-ink outline-none focus:border-accent"/></label>}
