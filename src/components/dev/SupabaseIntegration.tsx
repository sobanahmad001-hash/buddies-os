"use client";
import { useState, useEffect } from "react";
import { Database, Trash2, Plus, ExternalLink, Loader2, Lock } from "lucide-react";

const ACCENT = "#3ECF8E"; // Supabase green

interface Project {
  id: string;
  project_name: string;
  project_url: string;
  anon_key: string;
  service_role_key: string | null;
  created_at: string;
}

interface Props {
  departmentId: string;
}

export default function SupabaseIntegration({ departmentId }: Props) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    project_name: "",
    project_url: "",
    anon_key: "",
    service_role_key: "",
  });
  const [error, setError] = useState("");

  useEffect(() => { fetchProjects(); }, [departmentId]);

  async function fetchProjects() {
    setLoading(true);
    const res = await fetch(`/api/dev/supabase/projects?department_id=${departmentId}`)
      .then(r => r.json())
      .catch(() => ({}));
    setProjects(res.projects ?? []);
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.project_name.trim() || !form.project_url.trim() || !form.anon_key.trim()) {
      setError("Project name, URL, and anon key are required.");
      return;
    }
    // Basic URL validation
    try { new URL(form.project_url); } catch {
      setError("Project URL must be a valid URL (e.g. https://xxxx.supabase.co).");
      return;
    }
    setSubmitting(true);
    const res = await fetch("/api/dev/supabase/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ department_id: departmentId, ...form }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed to attach project.");
    } else {
      setForm({ project_name: "", project_url: "", anon_key: "", service_role_key: "" });
      setShowForm(false);
      await fetchProjects();
    }
    setSubmitting(false);
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    await fetch(`/api/dev/supabase/projects/${id}`, { method: "DELETE" });
    setProjects(prev => prev.filter(p => p.id !== id));
    setDeletingId(null);
  }

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4" style={{ color: ACCENT }} />
          <span className="text-sm font-semibold text-[#1A1A1A]">Supabase Projects</span>
          {projects.length > 0 && (
            <span
              className="text-[10px] px-2 py-0.5 rounded-full text-white font-bold"
              style={{ backgroundColor: ACCENT }}
            >
              {projects.length}
            </span>
          )}
        </div>
        <button
          onClick={() => { setShowForm(v => !v); setError(""); }}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: ACCENT }}
        >
          <Plus className="w-3.5 h-3.5" />
          Attach Project
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border border-[#E5E2DE] rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold text-[#1A1A1A]">Attach Supabase Project</p>

          <div className="space-y-2">
            <input
              value={form.project_name}
              onChange={e => setForm(f => ({ ...f, project_name: e.target.value }))}
              placeholder="Display name (e.g. Production DB, Staging)"
              className="w-full text-sm px-3 py-2 border border-[#E5E2DE] rounded-lg focus:outline-none"
              style={{ "--tw-ring-color": ACCENT } as React.CSSProperties}
              required
            />
            <input
              value={form.project_url}
              onChange={e => setForm(f => ({ ...f, project_url: e.target.value }))}
              placeholder="Project URL (e.g. https://xxxx.supabase.co)"
              className="w-full text-sm px-3 py-2 border border-[#E5E2DE] rounded-lg focus:outline-none font-mono"
              required
            />
            <input
              type="password"
              value={form.anon_key}
              onChange={e => setForm(f => ({ ...f, anon_key: e.target.value }))}
              placeholder="Anon (public) Key — eyJ…"
              className="w-full text-sm px-3 py-2 border border-[#E5E2DE] rounded-lg focus:outline-none font-mono"
              required
              autoComplete="off"
            />
            <input
              type="password"
              value={form.service_role_key}
              onChange={e => setForm(f => ({ ...f, service_role_key: e.target.value }))}
              placeholder="Service Role Key (optional) — eyJ…"
              className="w-full text-sm px-3 py-2 border border-[#E5E2DE] rounded-lg focus:outline-none font-mono"
              autoComplete="off"
            />
            <p className="flex items-center gap-1 text-[10px] text-[#B0ADA9]">
              <Lock className="w-3 h-3 shrink-0" />
              Keys are masked (first 6 + last 4 chars) before saving — never stored in plaintext. Find your keys at{" "}
              <a
                href="https://supabase.com/dashboard/project/_/settings/api"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:opacity-80"
                style={{ color: ACCENT }}
              >
                Project Settings → API
              </a>
            </p>
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-1.5 px-4 py-2 text-white text-sm font-semibold rounded-lg disabled:opacity-40"
              style={{ backgroundColor: ACCENT }}
            >
              {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Database className="w-3.5 h-3.5" />}
              {submitting ? "Attaching..." : "Attach Project"}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setError(""); }}
              className="px-4 py-2 text-sm text-[#737373] border border-[#E5E2DE] rounded-lg hover:bg-[#F5F5F5]"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-[#B0ADA9]" />
        </div>
      )}

      {/* Project list */}
      {!loading && projects.length > 0 && (
        <div className="space-y-3">
          {projects.map(p => (
            <div key={p.id} className="bg-white rounded-xl border border-[#E5E2DE] p-4 flex items-start gap-3">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${ACCENT}20` }}
              >
                <Database className="w-4 h-4" style={{ color: ACCENT }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-sm text-[#1A1A1A]">{p.project_name}</span>
                  {p.service_role_key && (
                    <span
                      className="text-[9px] px-1.5 py-0.5 rounded-full text-white font-bold"
                      style={{ backgroundColor: ACCENT }}
                    >
                      SERVICE ROLE
                    </span>
                  )}
                </div>
                <a
                  href={p.project_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-[#737373] hover:underline font-mono"
                >
                  {p.project_url}
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
                <p className="text-[10px] text-[#B0ADA9] mt-1 font-mono">
                  anon: {p.anon_key}
                  {p.service_role_key && (
                    <span className="ml-2 text-[#B0ADA9]">· service: {p.service_role_key}</span>
                  )}
                </p>
                <p className="text-[10px] text-[#B0ADA9] mt-0.5">
                  {new Date(p.created_at).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => handleDelete(p.id)}
                disabled={deletingId === p.id}
                className="p-1.5 rounded-lg text-[#B0ADA9] hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40 shrink-0"
                title="Disconnect"
              >
                {deletingId === p.id
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Trash2 className="w-3.5 h-3.5" />}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && projects.length === 0 && !showForm && (
        <div className="text-center py-10 text-[#737373]">
          <Database className="w-8 h-8 mx-auto mb-2 opacity-20" style={{ color: ACCENT }} />
          <p className="text-sm font-medium">No Supabase projects connected</p>
          <p className="text-xs mt-1 text-[#B0ADA9]">
            Attach a project so Buddies agents can query your database.
          </p>
        </div>
      )}
    </div>
  );
}
