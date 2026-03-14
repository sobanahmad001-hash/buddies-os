"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Plug, Github, Database, Globe, Plus, Trash2, CheckCircle2, XCircle, ExternalLink } from "lucide-react";

type Integration = {
  id: string; type: string; name: string; status: string;
  config: Record<string, any>; created_at: string;
};

const TYPE_META: Record<string, { icon: any; color: string; label: string }> = {
  github: { icon: Github, color: "#24292e", label: "GitHub" },
  supabase: { icon: Database, color: "#3ecf8e", label: "Supabase" },
  vercel: { icon: Globe, color: "#000", label: "Vercel" },
  notion: { icon: Globe, color: "#000", label: "Notion" },
  slack: { icon: Globe, color: "#4A154B", label: "Slack" },
};

export default function IntegrationsPage() {
  const router = useRouter();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ type: "github", name: "", config: "" });
  const [saving, setSaving] = useState(false);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }
    const { data } = await supabase
      .from("integrations")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setIntegrations(data ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleAdd() {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    let config: Record<string, any> = {};
    try { config = form.config ? JSON.parse(form.config) : {}; } catch { config = { raw: form.config }; }

    await supabase.from("integrations").insert({
      user_id: user.id, type: form.type, name: form.name || form.type,
      status: "active", config,
    });
    setForm({ type: "github", name: "", config: "" });
    setShowAdd(false);
    setSaving(false);
    load();
  }

  async function handleDelete(id: string) {
    await supabase.from("integrations").delete().eq("id", id);
    load();
  }

  async function toggleStatus(i: Integration) {
    const next = i.status === "active" ? "inactive" : "active";
    await supabase.from("integrations").update({ status: next }).eq("id", i.id);
    load();
  }

  return (
    <div className="flex-1 overflow-auto p-6 md:p-8">
      <div className="max-w-[700px]">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-[20px] font-semibold text-[#1A1A1A]">Integrations</h1>
            <p className="text-sm text-[#737373] mt-0.5">Connect tools so Buddies can use them as context.</p>
          </div>
          <button onClick={() => setShowAdd(!showAdd)}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#1A1A1A] text-white text-xs font-semibold rounded-lg hover:bg-[#333]">
            <Plus size={14} /> Add
          </button>
        </div>

        {showAdd && (
          <div className="bg-white border border-[#E5E2DE] rounded-xl p-5 mb-6">
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-[10px] font-bold text-[#737373] uppercase tracking-wider block mb-1">Type</label>
                <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}
                  className="w-full text-sm px-3 py-2 border border-[#E5E2DE] rounded-lg">
                  <option value="github">GitHub</option>
                  <option value="supabase">Supabase</option>
                  <option value="vercel">Vercel</option>
                  <option value="notion">Notion</option>
                  <option value="slack">Slack</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-[#737373] uppercase tracking-wider block mb-1">Name</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. buddies-os repo" className="w-full text-sm px-3 py-2 border border-[#E5E2DE] rounded-lg" />
              </div>
            </div>
            <div className="mb-3">
              <label className="text-[10px] font-bold text-[#737373] uppercase tracking-wider block mb-1">Config (JSON or key=value)</label>
              <textarea value={form.config} onChange={e => setForm({ ...form, config: e.target.value })}
                rows={3} placeholder='{"org_or_user":"myorg","repo_url":"https://github.com/org/repo","access_token":"ghp_..."}'
                className="w-full text-sm px-3 py-2 border border-[#E5E2DE] rounded-lg font-mono text-xs resize-none" />
            </div>
            <div className="flex gap-2">
              <button onClick={handleAdd} disabled={saving}
                className="px-4 py-2 bg-[#E8521A] text-white text-xs font-semibold rounded-lg hover:bg-[#c94415] disabled:opacity-50">
                {saving ? "Saving..." : "Save Integration"}
              </button>
              <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-xs text-[#737373] hover:text-[#1A1A1A]">Cancel</button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-sm text-[#737373]">Loading…</div>
        ) : integrations.length === 0 ? (
          <div className="bg-white border border-[#E5E2DE] rounded-xl p-8 text-center">
            <Plug size={32} className="text-[#B0ADA9] mx-auto mb-3" />
            <p className="text-sm text-[#737373]">No integrations yet. Connect GitHub, Supabase, or other tools.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {integrations.map(i => {
              const meta = TYPE_META[i.type] ?? { icon: Globe, color: "#737373", label: i.type };
              const Icon = meta.icon;
              return (
                <div key={i.id} className="bg-white border border-[#E5E2DE] rounded-xl px-4 py-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: meta.color + "15" }}>
                    <Icon size={16} style={{ color: meta.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[#1A1A1A] truncate">{i.name}</div>
                    <div className="text-[11px] text-[#737373]">
                      {meta.label} · {new Date(i.created_at).toLocaleDateString()}
                      {i.config?.repo_url && (
                        <a href={i.config.repo_url} target="_blank" rel="noopener noreferrer" className="ml-1 inline-flex items-center gap-0.5 text-[#E8521A] hover:underline">
                          <ExternalLink size={10} /> repo
                        </a>
                      )}
                    </div>
                  </div>
                  <button onClick={() => toggleStatus(i)} title={i.status === "active" ? "Deactivate" : "Activate"}>
                    {i.status === "active"
                      ? <CheckCircle2 size={16} className="text-green-500" />
                      : <XCircle size={16} className="text-[#B0ADA9]" />}
                  </button>
                  <button onClick={() => handleDelete(i.id)} className="text-[#B0ADA9] hover:text-red-500">
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
