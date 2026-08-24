"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AlertTriangle, CalendarDays, Flag, Plus, Target } from "lucide-react";

type Workstream = { id: string; name: string; owner_name: string | null; status: string; target_date: string | null };
type Deliverable = { id: string; title: string; owner_name: string | null; status: string; due_date: string | null; workstream_id: string | null };
type ProjectMeta = { owner_name: string | null; target_date: string | null; health: string };

export default function ProjectStructurePage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<ProjectMeta>({ owner_name: "", target_date: "", health: "on_track" });
  const [workstreams, setWorkstreams] = useState<Workstream[]>([]);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [name, setName] = useState("");
  const [deliverable, setDeliverable] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const response = await fetch(`/api/projects/structure?projectId=${id}`);
    const data = await response.json();
    if (!response.ok) { setError(data.migrationRequired ? "Project model migration must be applied before this workspace can save data." : data.error); return; }
    setProject(data.project); setWorkstreams(data.workstreams); setDeliverables(data.deliverables); setError(null);
  }
  useEffect(() => { load(); }, [id]);

  async function create(kind: "workstream" | "deliverable", title: string) {
    if (!title.trim()) return;
    await fetch("/api/projects/structure", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, projectId: id, ...(kind === "workstream" ? { name: title.trim() } : { title: title.trim() }) }) });
    kind === "workstream" ? setName("") : setDeliverable(""); load();
  }
  async function update(kind: string, itemId: string | null, fields: Record<string, unknown>) {
    await fetch("/api/projects/structure", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, id: itemId, projectId: id, ...fields }) }); load();
  }

  const delivered = deliverables.filter((item) => item.status === "delivered").length;
  return <div className="p-4 md:p-6 max-w-[1000px] space-y-5">
    <div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#CC785C]">Operating model</p><h2 className="mt-1 text-[20px] font-semibold text-[#C8C5C0]">Project structure</h2><p className="mt-1 text-[13px] text-[#737373]">Define ownership, health, workstreams, and concrete outcomes.</p></div>
    {error && <div className="flex gap-2 rounded-xl border border-amber-800 bg-amber-950/30 p-4 text-[12px] text-amber-300"><AlertTriangle size={15} />{error}</div>}
    <div className="grid gap-3 md:grid-cols-3">
      <label className="rounded-xl border border-[#2D2D2D] bg-[#1A1A1A] p-4 text-[11px] uppercase text-[#737373]">Owner<input value={project.owner_name ?? ""} onChange={(e) => setProject({ ...project, owner_name: e.target.value })} onBlur={() => update("project", null, { owner_name: project.owner_name || null })} placeholder="Unassigned" className="mt-2 w-full bg-transparent text-[14px] normal-case text-[#C8C5C0] outline-none" /></label>
      <label className="rounded-xl border border-[#2D2D2D] bg-[#1A1A1A] p-4 text-[11px] uppercase text-[#737373]">Target date<input type="date" value={project.target_date ?? ""} onChange={(e) => { setProject({ ...project, target_date: e.target.value }); update("project", null, { target_date: e.target.value || null }); }} className="mt-2 w-full bg-transparent text-[14px] normal-case text-[#C8C5C0] outline-none" /></label>
      <label className="rounded-xl border border-[#2D2D2D] bg-[#1A1A1A] p-4 text-[11px] uppercase text-[#737373]">Health<select value={project.health} onChange={(e) => { setProject({ ...project, health: e.target.value }); update("project", null, { health: e.target.value }); }} className="mt-2 w-full bg-[#1A1A1A] text-[14px] normal-case text-[#C8C5C0] outline-none"><option value="on_track">On track</option><option value="at_risk">At risk</option><option value="blocked">Blocked</option></select></label>
    </div>
    <div className="grid gap-4 lg:grid-cols-2">
      <Section icon={Target} title="Workstreams" count={workstreams.length} input={name} setInput={setName} placeholder="Add workstream" add={() => create("workstream", name)}>
        {workstreams.map((item) => <Row key={item.id} title={item.name} meta={item.owner_name || "No owner"} status={item.status} statuses={["planned","active","blocked","complete"]} onStatus={(status: string) => update("workstream", item.id, { status })} />)}
      </Section>
      <Section icon={Flag} title="Deliverables" count={`${delivered}/${deliverables.length}`} input={deliverable} setInput={setDeliverable} placeholder="Add deliverable" add={() => create("deliverable", deliverable)}>
        {deliverables.map((item) => <Row key={item.id} title={item.title} meta={item.due_date ? `Due ${item.due_date}` : "No due date"} status={item.status} statuses={["planned","in_progress","review","delivered"]} onStatus={(status: string) => update("deliverable", item.id, { status })} />)}
      </Section>
    </div>
  </div>;
}

function Section({ icon: Icon, title, count, input, setInput, placeholder, add, children }: any) { return <section className="rounded-xl border border-[#2D2D2D] bg-[#1A1A1A] p-4"><div className="mb-4 flex items-center justify-between"><h3 className="flex items-center gap-2 text-[14px] font-semibold text-[#C8C5C0]"><Icon size={15} className="text-[#CC785C]" />{title}</h3><span className="text-[11px] text-[#737373]">{count}</span></div><div className="mb-3 flex gap-2"><input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder={placeholder} className="min-w-0 flex-1 rounded-lg border border-[#2D2D2D] bg-[#111111] px-3 py-2 text-[12px] text-[#C8C5C0] outline-none focus:border-[#CC785C]"/><button onClick={add} className="rounded-lg bg-[#B5622A] px-3 text-white"><Plus size={14}/></button></div><div className="space-y-2">{children}</div></section>; }
function Row({ title, meta, status, statuses, onStatus }: any) { return <div className="flex items-center gap-3 rounded-lg border border-[#2D2D2D] bg-[#111111] p-3"><CalendarDays size={13} className="text-[#737373]"/><div className="min-w-0 flex-1"><p className="truncate text-[13px] text-[#C8C5C0]">{title}</p><p className="text-[10px] text-[#737373]">{meta}</p></div><select value={status} onChange={(e) => onStatus(e.target.value)} className="bg-[#111111] text-[10px] capitalize text-[#CC785C] outline-none">{statuses.map((value: string) => <option key={value} value={value}>{value.replace("_", " ")}</option>)}</select></div>; }
