"use client";
import { useState } from "react";
import {
  ShieldCheck, AlertTriangle, X, Loader2, CheckCircle2,
  Github, Database, FolderKanban, Scale, ListTodo, FileText
} from "lucide-react";

export interface PendingAction {
  type: string;
  description: string;
  warning: string | null;
  params: Record<string, unknown>;
}

interface Props {
  action: PendingAction;
  onApprove: () => Promise<void>;
  onDeny: () => void;
}

const ACTION_META: Record<string, { label: string; icon: any; color: string; bg: string }> = {
  "app.create_project":      { label: "Create Project",        icon: FolderKanban, color: "#6366F1", bg: "#EEF2FF" },
  "app.generate_document":   { label: "Generate Document",     icon: FileText,     color: "#B5622A", bg: "#FFF4EF" },
  "app.create_task":         { label: "Create Task",           icon: ListTodo,     color: "#3B82F6", bg: "#EFF6FF" },
  "app.complete_task":       { label: "Complete Task",         icon: CheckCircle2, color: "#10B981", bg: "#ECFDF5" },
  "app.create_decision":     { label: "Log Decision",          icon: Scale,        color: "#8B5CF6", bg: "#F5F3FF" },
  "app.update_project":      { label: "Update Project",        icon: FolderKanban, color: "#10B981", bg: "#ECFDF5" },
  "app.add_project_update":  { label: "Add Project Update",    icon: FileText,     color: "#F59E0B", bg: "#FFFBEB" },
  "github.create_issue":     { label: "Create GitHub Issue",   icon: Github,       color: "#24292E", bg: "#F6F8FA" },
  "github.create_branch":    { label: "Create GitHub Branch",  icon: Github,       color: "#24292E", bg: "#F6F8FA" },
  "supabase.run_sql":        { label: "Run SQL Query",         icon: Database,     color: "#3ECF8E", bg: "#F0FDF4" },
};

function ParamRow({ k, v }: { k: string; v: unknown }) {
  const label = k.replace(/_/g, " ");
  const display = typeof v === "object" ? JSON.stringify(v) : String(v ?? "—");
  return (
    <div className="flex gap-3 py-1.5 border-b border-[#F0EDE8] last:border-0">
      <span className="text-[11px] font-semibold text-[#8A8A8A] uppercase tracking-wide w-28 shrink-0 mt-0.5">{label}</span>
      <span className="text-[13px] text-[#1A1A1A] break-all font-mono leading-snug">{display}</span>
    </div>
  );
}

export default function ApprovalModal({ action, onApprove, onDeny }: Props) {
  const [approving, setApproving] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [resultOk, setResultOk] = useState(true);

  const meta = ACTION_META[action.type] ?? {
    label: action.type, icon: ShieldCheck, color: "#6B7280", bg: "#F9FAFB",
  };
  const Icon = meta.icon;

  async function handleApprove() {
    setApproving(true);
    try {
      await onApprove();
    } catch (e: any) {
      setResult(e.message ?? "Action failed");
      setResultOk(false);
      setApproving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden border border-[#E8E3DC]">
        {/* Header */}
        <div className="flex items-start gap-3 p-5 border-b border-[#F0EDE8]" style={{ backgroundColor: meta.bg }}>
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${meta.color}18`, border: `1px solid ${meta.color}30` }}
          >
            <Icon className="w-5 h-5" style={{ color: meta.color }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-widest text-[#8A8A8A]">Action Request</span>
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white"
                style={{ backgroundColor: meta.color }}
              >
                {meta.label}
              </span>
            </div>
            <p className="text-[15px] font-semibold text-[#1A1A1A] mt-1 leading-snug">{action.description}</p>
          </div>
          <button onClick={onDeny} className="p-1 rounded-lg text-[#8A8A8A] hover:bg-black/10 transition-colors shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Params */}
        <div className="px-5 py-3 max-h-48 overflow-y-auto">
          {Object.entries(action.params).map(([k, v]) => (
            <ParamRow key={k} k={k} v={v} />
          ))}
        </div>

        {/* Warning */}
        {action.warning && (
          <div className="mx-5 mb-3 flex items-start gap-2 p-3 rounded-xl bg-[#FFFBEB] border border-[#FDE68A]">
            <AlertTriangle className="w-4 h-4 text-[#F59E0B] shrink-0 mt-0.5" />
            <p className="text-[12px] text-[#92400E]">{action.warning}</p>
          </div>
        )}

        {/* Result after execution */}
        {result && (
          <div className={`mx-5 mb-3 flex items-start gap-2 p-3 rounded-xl ${
            resultOk ? "bg-[#ECFDF5] border border-[#A7F3D0]" : "bg-[#FEF2F2] border border-[#FECACA]"
          }`}>
            {resultOk
              ? <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0 mt-0.5" />
              : <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />}
            <p className="text-[12px]" style={{ color: resultOk ? "#065F46" : "#991B1B" }}>{result}</p>
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-3 px-5 py-4 border-t border-[#F0EDE8] bg-[#FAFAF8]">
          {!result && (
            <>
              <button
                onClick={handleApprove}
                disabled={approving}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-white text-[13px] font-semibold disabled:opacity-50 transition-opacity hover:opacity-90"
                style={{ backgroundColor: meta.color }}
              >
                {approving
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Executing…</>
                  : <><ShieldCheck className="w-4 h-4" /> Approve & Execute</>}
              </button>
              <button
                onClick={onDeny}
                disabled={approving}
                className="flex-1 py-2.5 rounded-xl border border-[#E8E3DC] text-[#6B6B6B] text-[13px] font-semibold hover:bg-[#F5F0EA] transition-colors disabled:opacity-40"
              >
                Deny
              </button>
            </>
          )}
          {result && (
            <button
              onClick={onDeny}
              className="flex-1 py-2.5 rounded-xl border border-[#E8E3DC] text-[#1A1A1A] text-[13px] font-semibold hover:bg-[#F5F0EA] transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
