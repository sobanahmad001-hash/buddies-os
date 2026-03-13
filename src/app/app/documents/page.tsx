"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FileText, Plus, Search, Trash2, ExternalLink, Loader2,
  BookOpen, Archive, CheckCircle2, Clock
} from "lucide-react";

interface Doc {
  id: string;
  title: string;
  status: "draft" | "published" | "archived";
  department_id: string | null;
  project_id: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "#F59E0B", published: "#10B981", archived: "#737373",
};
const STATUS_ICONS: Record<string, any> = {
  draft: Clock, published: CheckCircle2, archived: Archive,
};

export default function DocumentsPage() {
  const router = useRouter();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [newTitle, setNewTitle] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/documents").then(r => r.json()).catch(() => ({}));
    setDocs(res.documents ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  async function createDoc() {
    if (!newTitle.trim()) return;
    setCreating(true);
    const res = await fetch("/api/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle.trim(), content: "", status: "draft" }),
    }).then(r => r.json()).catch(() => ({}));
    setCreating(false);
    if (res.document?.id) {
      router.push(`/app/documents/${res.document.id}`);
    } else {
      await fetchDocs();
      setShowNewForm(false);
      setNewTitle("");
    }
  }

  async function deleteDoc(id: string) {
    setDeletingId(id);
    await fetch(`/api/documents/${id}`, { method: "DELETE" });
    setDocs(prev => prev.filter(d => d.id !== id));
    setDeletingId(null);
  }

  const filtered = docs.filter(d => {
    const matchesSearch = d.title.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || d.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const counts = {
    all: docs.length,
    draft: docs.filter(d => d.status === "draft").length,
    published: docs.filter(d => d.status === "published").length,
    archived: docs.filter(d => d.status === "archived").length,
  };

  return (
    <div className="flex-1 overflow-auto bg-[#F7F5F2]">
      {/* Header */}
      <div className="px-6 py-5 border-b border-[#E5E2DE] bg-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-[#E8521A]" />
            <h1 className="text-[18px] font-semibold text-[#0F0F0F]">Documents</h1>
          </div>
          <button
            onClick={() => setShowNewForm(v => !v)}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#E8521A] hover:bg-[#c94415] text-white text-sm font-semibold rounded-xl transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Document
          </button>
        </div>
        {showNewForm && (
          <div className="mt-4 flex gap-2">
            <input
              autoFocus
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => e.key === "Enter" && createDoc()}
              placeholder="Document title..."
              className="flex-1 text-sm px-3 py-2 border border-[#E5E2DE] rounded-xl focus:outline-none focus:border-[#E8521A] bg-[#F7F5F2]"
            />
            <button
              onClick={createDoc}
              disabled={!newTitle.trim() || creating}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#E8521A] hover:bg-[#c94415] disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create & Edit"}
            </button>
            <button
              onClick={() => { setShowNewForm(false); setNewTitle(""); }}
              className="px-3 py-2 text-sm text-[#737373] border border-[#E5E2DE] rounded-xl hover:bg-[#F0EDE9]"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      <div className="p-6 max-w-[900px]">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#B0ADA9]" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search documents..."
              className="w-full text-sm pl-9 pr-3 py-2 bg-white border border-[#E5E2DE] rounded-xl focus:outline-none focus:border-[#E8521A]"
            />
          </div>
          <div className="flex gap-1 bg-[#F0EDE9] p-1 rounded-xl">
            {(["all", "draft", "published", "archived"] as const).map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg capitalize transition-colors ${
                  statusFilter === s ? "bg-white text-[#1A1A1A] shadow-sm" : "text-[#737373] hover:text-[#1A1A1A]"
                }`}
              >
                {s} <span className="ml-0.5 opacity-60">({counts[s]})</span>
              </button>
            ))}
          </div>
        </div>

        {/* Doc list */}
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-[#B0ADA9]" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <FileText className="w-10 h-10 text-[#E5E2DE] mx-auto mb-3" />
            <p className="text-sm text-[#737373]">
              {search ? "No documents match your search." : "No documents yet."}
            </p>
            {!search && (
              <button
                onClick={() => setShowNewForm(true)}
                className="mt-3 text-sm text-[#E8521A] hover:underline"
              >
                Create your first document →
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(doc => {
              const StatusIcon = STATUS_ICONS[doc.status] ?? Clock;
              return (
                <div
                  key={doc.id}
                  className="bg-white border border-[#E5E2DE] rounded-xl p-4 flex items-center gap-3 hover:border-[#E8521A] transition-colors group"
                >
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${STATUS_COLORS[doc.status]}15` }}>
                    <StatusIcon className="w-4 h-4" style={{ color: STATUS_COLORS[doc.status] }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#1A1A1A] truncate">{doc.title}</p>
                    <p className="text-[10px] text-[#B0ADA9] mt-0.5">
                      Updated {new Date(doc.updated_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span
                    className="text-[10px] px-2 py-0.5 rounded-full font-semibold capitalize shrink-0"
                    style={{ backgroundColor: `${STATUS_COLORS[doc.status]}20`, color: STATUS_COLORS[doc.status] }}
                  >
                    {doc.status}
                  </span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Link
                      href={`/app/documents/${doc.id}`}
                      className="p-1.5 rounded-lg text-[#B0ADA9] hover:text-[#E8521A] hover:bg-[#FFF4EF] transition-colors"
                      title="Open document"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Link>
                    <button
                      onClick={() => deleteDoc(doc.id)}
                      disabled={deletingId === doc.id}
                      className="p-1.5 rounded-lg text-[#B0ADA9] hover:text-red-500 hover:bg-red-50 transition-colors"
                      title="Delete document"
                    >
                      {deletingId === doc.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
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
