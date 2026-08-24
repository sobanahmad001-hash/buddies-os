"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, Check, CheckCircle2, Clock3, Inbox, Loader2, Plus, ShieldCheck, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

type InboxItem = {
  id: string; item_type: string; title: string; body: string | null; source: string; status: string;
  urgency: number; due_at: string | null; created_at: string; project_id: string | null;
};

const FILTERS = ["all", "approval", "commitment", "waiting_for", "capture"] as const;

export default function InboxPage() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [title, setTitle] = useState("");
  const [capturing, setCapturing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from("inbox_items").select("*").eq("user_id", user.id)
      .in("status", ["open", "snoozed"]).order("urgency", { ascending: true }).order("created_at", { ascending: false });
    setItems(data ?? []); setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function capture() {
    const value = title.trim(); if (!value) return;
    setCapturing(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await supabase.from("inbox_items").insert({ user_id: user.id, title: value, item_type: "capture", source: "manual" });
    setTitle(""); setCapturing(false); load();
  }

  async function resolve(id: string, status: "approved" | "rejected" | "done" | "archived") {
    await supabase.from("inbox_items").update({ status, resolved_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", id);
    setItems(current => current.filter(item => item.id !== id));
  }

  async function snooze(id: string) {
    const tomorrow = new Date(Date.now() + 86400000).toISOString();
    await supabase.from("inbox_items").update({ status: "snoozed", snoozed_until: tomorrow, updated_at: new Date().toISOString() }).eq("id", id);
    setItems(current => current.filter(item => item.id !== id));
  }

  const visible = useMemo(() => filter === "all" ? items : items.filter(item => item.item_type === filter), [items, filter]);
  const approvals = items.filter(item => item.item_type === "approval").length;

  return (
    <div className="flex-1 overflow-auto bg-canvas">
      <div className="mx-auto max-w-[920px] p-4 md:p-8">
        <header className="mb-6 flex items-start justify-between gap-4">
          <div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">Personal control</p>
            <h1 className="mt-1 text-2xl font-semibold text-ink">Inbox</h1>
            <p className="mt-1 text-sm text-muted">Capture once. Decide what deserves attention.</p></div>
          <div className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-muted"><b className="text-ink">{items.length}</b> open · <b className="text-caution">{approvals}</b> approvals</div>
        </header>

        <form onSubmit={e => { e.preventDefault(); capture(); }} className="mb-5 flex gap-2 rounded-2xl border border-line bg-surface p-2 shadow-panel focus-within:border-accent">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent"><Plus size={17}/></div>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Capture a thought, task, promise, or decision…" className="min-w-0 flex-1 bg-transparent px-1 text-sm text-ink outline-none placeholder:text-faint" />
          <button disabled={!title.trim() || capturing} className="rounded-xl bg-accent px-4 text-xs font-semibold text-white disabled:opacity-40">{capturing ? <Loader2 size={15} className="animate-spin"/> : "Capture"}</button>
        </form>

        <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl border border-line bg-surface-subtle p-1">
          {FILTERS.map(value => <button key={value} onClick={() => setFilter(value)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium capitalize ${filter === value ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}>{value.replace("_", " ")}</button>)}
        </div>

        {loading ? <div className="flex items-center gap-2 p-8 text-sm text-muted"><Loader2 size={16} className="animate-spin"/> Loading inbox…</div> : visible.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line p-12 text-center"><Inbox className="mx-auto mb-3 text-faint"/><p className="font-medium text-ink">Inbox clear</p><p className="mt-1 text-sm text-muted">New captures and approval requests will appear here.</p></div>
        ) : <div className="space-y-2">{visible.map(item => (
          <article key={item.id} className="group rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-line-strong">
            <div className="flex items-start gap-3"><div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${item.item_type === "approval" ? "bg-[color:var(--caution)]/10 text-caution" : "bg-accent-soft text-accent"}`}>{item.item_type === "approval" ? <ShieldCheck size={15}/> : <CheckCircle2 size={15}/>}</div>
              <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-medium text-ink">{item.title}</h2><span className="rounded-full bg-surface-subtle px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">{item.item_type.replace("_", " ")}</span></div>
                {item.body && <p className="mt-1 text-xs leading-relaxed text-muted">{item.body}</p>}<p className="mt-2 text-[10px] text-faint">{item.source} · {new Date(item.created_at).toLocaleString()}</p></div>
              <div className="flex shrink-0 gap-1">{item.item_type === "approval" && <><button onClick={() => resolve(item.id,"approved")} className="rounded-lg p-2 text-positive hover:bg-surface-subtle" title="Approve"><Check size={15}/></button><button onClick={() => resolve(item.id,"rejected")} className="rounded-lg p-2 text-risk hover:bg-surface-subtle" title="Reject"><X size={15}/></button></>}
                {item.item_type !== "approval" && <button onClick={() => resolve(item.id,"done")} className="rounded-lg p-2 text-positive hover:bg-surface-subtle" title="Done"><Check size={15}/></button>}
                <button onClick={() => snooze(item.id)} className="rounded-lg p-2 text-muted hover:bg-surface-subtle hover:text-ink" title="Tomorrow"><Clock3 size={15}/></button>
                <button onClick={() => resolve(item.id,"archived")} className="rounded-lg p-2 text-muted hover:bg-surface-subtle hover:text-ink" title="Archive"><Archive size={15}/></button></div>
            </div>
          </article>))}</div>}
      </div>
    </div>
  );
}
