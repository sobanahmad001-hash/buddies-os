"use client";
import { useState } from "react";
import { FileText, Download, FolderKanban, Check, Loader2, ChevronDown, X } from "lucide-react";

interface Project { id: string; name: string; }

interface DocumentCardProps {
  title: string;
  content: string;
}

export default function DocumentCard({ title, content }: DocumentCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedProjectName, setSavedProjectName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function openProjectPicker() {
    setPickerOpen(true);
    if (projects.length) return;
    setLoadingProjects(true);
    const res = await fetch("/api/projects").then(r => r.json()).catch(() => ({}));
    setProjects(res.projects ?? []);
    setLoadingProjects(false);
  }

  async function saveToProject(project: Project) {
    setSaving(true);
    setPickerOpen(false);
    setError(null);
    const res = await fetch("/api/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        content,
        status: "draft",
        project_id: project.id,
      }),
    }).then(r => r.json()).catch(() => ({}));
    setSaving(false);
    if (res.document?.id) {
      setSavedProjectName(project.name);
    } else {
      setError(res.error ?? "Failed to save document.");
    }
  }

  function download() {
    const blob = new Blob([`# ${title}\n\n${content}`], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const preview = content.slice(0, 320).trim();
  const hasMore = content.length > 320;

  return (
    <div className="mt-3 border border-[#E5E2DE] rounded-2xl overflow-hidden bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-[#F7F5F2] border-b border-[#E5E2DE]">
        <div className="w-7 h-7 rounded-lg bg-[#B5622A]/10 flex items-center justify-center shrink-0">
          <FileText className="w-3.5 h-3.5 text-[#B5622A]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-[#1A1A1A] truncate">{title}</p>
          <p className="text-[10px] text-[#B0ADA9]">Generated document · not saved</p>
        </div>
      </div>

      {/* Content preview */}
      <div className="px-4 py-3">
        <pre className={`text-[12px] text-[#525252] whitespace-pre-wrap leading-relaxed font-sans ${expanded ? "" : "line-clamp-6"}`}>
          {preview}{!expanded && hasMore ? "…" : expanded ? content.slice(320) : ""}
        </pre>
        {hasMore && (
          <button
            onClick={() => setExpanded(v => !v)}
            className="mt-1 flex items-center gap-1 text-[11px] text-[#B0ADA9] hover:text-[#B5622A] transition-colors"
          >
            <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
            {expanded ? "Show less" : "Show full document"}
          </button>
        )}
      </div>

      {/* Actions */}
      <div className="px-4 py-3 border-t border-[#F0EDE9] flex items-center gap-2 flex-wrap">
        {savedProjectName ? (
          <div className="flex items-center gap-1.5 text-[12px] text-[#10B981] font-medium">
            <Check className="w-3.5 h-3.5" />
            Saved to <span className="font-semibold">{savedProjectName}</span>
          </div>
        ) : (
          <>
            {/* Add to project */}
            <div className="relative">
              <button
                onClick={openProjectPicker}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#B5622A] hover:bg-[#9A4E20] disabled:opacity-50 text-white text-[12px] font-semibold rounded-lg transition-colors"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FolderKanban className="w-3.5 h-3.5" />}
                {saving ? "Saving…" : "Add to Project"}
              </button>

              {pickerOpen && (
                <div className="absolute left-0 bottom-full mb-2 w-64 bg-white border border-[#E5E2DE] rounded-xl shadow-xl z-50 overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-[#F0EDE9]">
                    <span className="text-[11px] font-semibold text-[#525252] uppercase tracking-wide">Choose project</span>
                    <button onClick={() => setPickerOpen(false)} className="text-[#B0ADA9] hover:text-[#525252]">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {loadingProjects ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="w-4 h-4 animate-spin text-[#B0ADA9]" />
                    </div>
                  ) : projects.length === 0 ? (
                    <div className="px-4 py-5 text-center text-[12px] text-[#B0ADA9]">No projects found</div>
                  ) : (
                    <div className="max-h-52 overflow-y-auto py-1">
                      {projects.map(p => (
                        <button
                          key={p.id}
                          onClick={() => saveToProject(p)}
                          className="w-full text-left px-4 py-2.5 text-[13px] text-[#1A1A1A] hover:bg-[#F7F5F2] transition-colors"
                        >
                          {p.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Download */}
            <button
              onClick={download}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F0EDE9] hover:bg-[#E5E2DE] text-[#1A1A1A] text-[12px] font-semibold rounded-lg transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Download .md
            </button>
          </>
        )}

        {error && (
          <span className="text-[11px] text-red-500">{error}</span>
        )}
      </div>
    </div>
  );
}
