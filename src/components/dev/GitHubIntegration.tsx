"use client";
import { useState, useEffect } from "react";
import { Github, Trash2, Plus, ExternalLink, GitBranch, Loader2 } from "lucide-react";

const ACCENT = "#3B82F6";

interface Repo {
  id: string;
  repo_name: string;
  repo_url: string | null;
  created_at: string;
}

interface Props {
  departmentId: string;
}

export default function GitHubIntegration({ departmentId }: Props) {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState({ repo_name: "", repo_url: "", access_token: "" });
  const [error, setError] = useState("");

  useEffect(() => { fetchRepos(); }, [departmentId]);

  async function fetchRepos() {
    setLoading(true);
    const res = await fetch(`/api/dev/github/repos?department_id=${departmentId}`)
      .then(r => r.json())
      .catch(() => ({}));
    setRepos(res.repos ?? []);
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.repo_name.trim() || !form.access_token.trim()) {
      setError("Repository name and access token are required.");
      return;
    }
    setSubmitting(true);
    const res = await fetch("/api/dev/github/repos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ department_id: departmentId, ...form }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed to attach repository.");
    } else {
      setForm({ repo_name: "", repo_url: "", access_token: "" });
      setShowForm(false);
      await fetchRepos();
    }
    setSubmitting(false);
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    await fetch(`/api/dev/github/repos/${id}`, { method: "DELETE" });
    setRepos(prev => prev.filter(r => r.id !== id));
    setDeletingId(null);
  }

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Github className="w-4 h-4 text-[#1A1A1A]" />
          <span className="text-sm font-semibold text-[#1A1A1A]">GitHub Repositories</span>
          {repos.length > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full text-white font-bold" style={{ backgroundColor: ACCENT }}>
              {repos.length}
            </span>
          )}
        </div>
        <button
          onClick={() => { setShowForm(v => !v); setError(""); }}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: ACCENT }}
        >
          <Plus className="w-3.5 h-3.5" />
          Attach Repo
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border border-[#E5E2DE] rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold text-[#1A1A1A]">Attach GitHub Repository</p>

          <div className="space-y-2">
            <input
              value={form.repo_name}
              onChange={e => setForm(f => ({ ...f, repo_name: e.target.value }))}
              placeholder="Repository name (e.g. org/repo or my-project)"
              className="w-full text-sm px-3 py-2 border border-[#E5E2DE] rounded-lg focus:outline-none focus:border-[#3B82F6]"
              required
            />
            <input
              value={form.repo_url}
              onChange={e => setForm(f => ({ ...f, repo_url: e.target.value }))}
              placeholder="Repository URL (optional, e.g. https://github.com/org/repo)"
              className="w-full text-sm px-3 py-2 border border-[#E5E2DE] rounded-lg focus:outline-none focus:border-[#3B82F6]"
            />
            <input
              type="password"
              value={form.access_token}
              onChange={e => setForm(f => ({ ...f, access_token: e.target.value }))}
              placeholder="GitHub Personal Access Token (ghp_...)"
              className="w-full text-sm px-3 py-2 border border-[#E5E2DE] rounded-lg focus:outline-none focus:border-[#3B82F6] font-mono"
              required
            />
            <p className="text-[10px] text-[#B0ADA9]">
              Token is masked before saving — only create, read, delete scopes needed. Generate at{" "}
              <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer"
                className="underline hover:text-[#3B82F6]">
                github.com/settings/tokens
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
              {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Github className="w-3.5 h-3.5" />}
              {submitting ? "Attaching..." : "Attach Repository"}
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

      {/* Repos list */}
      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-[#B0ADA9]" />
        </div>
      ) : repos.length === 0 ? (
        <div className="text-center py-8 bg-white border border-dashed border-[#E5E2DE] rounded-xl">
          <GitBranch className="w-8 h-8 mx-auto mb-2 text-[#E5E2DE]" />
          <p className="text-sm text-[#737373]">No repositories attached yet.</p>
          <p className="text-xs text-[#B0ADA9] mt-1">Attach a GitHub repo to link your work here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {repos.map(repo => (
            <div key={repo.id} className="bg-white border border-[#E5E2DE] rounded-xl p-4 flex items-center gap-3">
              <Github className="w-5 h-5 text-[#1A1A1A] shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#1A1A1A] truncate">{repo.repo_name}</p>
                <p className="text-[10px] text-[#B0ADA9]">
                  Added {new Date(repo.created_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {repo.repo_url && (
                  <a
                    href={repo.repo_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-lg text-[#B0ADA9] hover:text-[#3B82F6] hover:bg-blue-50 transition-colors"
                    title="Open repository"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
                <button
                  onClick={() => handleDelete(repo.id)}
                  disabled={deletingId === repo.id}
                  className="p-1.5 rounded-lg text-[#B0ADA9] hover:text-red-500 hover:bg-red-50 transition-colors"
                  title="Remove repository"
                >
                  {deletingId === repo.id
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Trash2 className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
