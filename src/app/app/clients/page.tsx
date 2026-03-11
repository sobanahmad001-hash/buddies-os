"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Plus, ExternalLink, ChevronRight } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  active: "#10B981", paused: "#F59E0B", completed: "#3B82F6", archived: "#737373"
};
const DEFAULT_STAGES = 14;

export default function ClientsPage() {
  const router = useRouter();
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", website: "", industry: "", location: "" });
  const [saving, setSaving] = useState(false);
  const [stageCounts, setStageCounts] = useState<Record<string, number>>({});

  useEffect(() => { load(); }, []);

  async function load() {
    const res = await fetch("/api/clients");
    const data = await res.json();
    const list = data.clients ?? [];
    setClients(list);
    // Load stage done counts per client
    const counts: Record<string, number> = {};
    await Promise.all(list.map(async (c: any) => {
      const { data: stages } = await supabase
        .from("client_stages").select("status").eq("client_id", c.id).eq("status", "done");
      counts[c.id] = stages?.length ?? 0;
    }));
    setStageCounts(counts);
    setLoading(false);
  }

  async function addClient() {
    if (!form.name.trim()) return;
    setSaving(true);
    await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form)
    });
    setForm({ name: "", website: "", industry: "", location: "" });
    setShowAdd(false);
    setSaving(false);
    await load();
  }

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-6 h-6 rounded-full border-2 border-[#E8521A] border-t-transparent animate-spin" />
    </div>
  );

  return (
    <div className="flex-1 overflow-auto bg-[#F7F5F2]">
      {/* Header */}
      <div className="bg-[#0F0F0F] text-white px-8 py-6">
        <div className="max-w-[1000px] mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-[22px] font-bold tracking-tight">
              Clients <span className="text-[#E8521A]">OS</span>
            </h1>
            <p className="text-white/40 text-xs mt-0.5">
              {clients.length} active client{clients.length !== 1 ? "s" : ""} · Full workflow tracking
            </p>
          </div>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#E8521A] text-white text-sm font-semibold rounded-xl hover:bg-[#c94415] transition-colors">
            <Plus size={15} /> New Client
          </button>
        </div>
      </div>

      <div className="px-8 py-6 max-w-[1000px] mx-auto">
        {/* Add client form */}
        {showAdd && (
          <div className="bg-white rounded-2xl border border-[#E5E2DE] p-5 mb-6">
            <h3 className="text-sm font-bold text-[#1A1A1A] mb-4">New Client</h3>
            <div className="grid grid-cols-2 gap-3 mb-4">
              {[
                { key: "name", placeholder: "Client / Brand name *" },
                { key: "website", placeholder: "Website URL" },
                { key: "industry", placeholder: "Industry" },
                { key: "location", placeholder: "Location" },
              ].map(f => (
                <input key={f.key} value={(form as any)[f.key]}
                  onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  className="text-sm px-3 py-2 border border-[#E5E2DE] rounded-xl focus:outline-none focus:border-[#E8521A] bg-white" />
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={addClient} disabled={saving || !form.name.trim()}
                className="px-5 py-2 bg-[#E8521A] text-white text-sm font-semibold rounded-xl disabled:opacity-40 hover:bg-[#c94415]">
                {saving ? "Creating..." : "Create Client + Seed 14 Stages"}
              </button>
              <button onClick={() => setShowAdd(false)}
                className="px-5 py-2 bg-[#F0EDE9] text-[#737373] text-sm font-semibold rounded-xl hover:bg-[#E5E2DE]">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Client cards */}
        {clients.length === 0 ? (
          <div className="text-center py-20 text-[#B0ADA9]">
            <div className="text-4xl mb-3">🏢</div>
            <div className="text-sm font-medium">No clients yet</div>
            <div className="text-xs mt-1">Add your first client to start tracking workflow</div>
          </div>
        ) : (
          <div className="space-y-3">
            {clients.map(c => {
              const done = stageCounts[c.id] ?? 0;
              const pct = Math.round((done / DEFAULT_STAGES) * 100);
              return (
                <div key={c.id} onClick={() => router.push(`/app/clients/${c.id}`)}
                  className="bg-white rounded-2xl border border-[#E5E2DE] p-5 cursor-pointer hover:shadow-md hover:border-[#D5D0CA] transition-all group">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[#0F0F0F] flex items-center justify-center text-white font-bold text-sm">
                        {c.name[0].toUpperCase()}
                      </div>
                      <div>
                        <div className="font-semibold text-[#1A1A1A] text-sm">{c.name}</div>
                        <div className="text-[10px] text-[#737373]">
                          {c.industry && `${c.industry} · `}{c.location ?? ""}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {c.website && (
                        <a href={c.website} target="_blank" rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="text-[#B0ADA9] hover:text-[#E8521A] transition-colors">
                          <ExternalLink size={13} />
                        </a>
                      )}
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_COLORS[c.status] ?? "#737373" }} />
                      <span className="text-[10px] text-[#737373] capitalize">{c.status}</span>
                      <ChevronRight size={14} className="text-[#B0ADA9] group-hover:text-[#737373] transition-colors" />
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-1.5 bg-[#F0EDE9] rounded-full overflow-hidden">
                      <div className="h-full bg-[#E8521A] rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[10px] text-[#737373] shrink-0">{done}/{DEFAULT_STAGES} stages</span>
                    <span className="text-[10px] font-bold text-[#E8521A] shrink-0">{pct}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
