"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  Loader2, Wand2, CheckCircle2, Terminal, Search, GitFork,
  Eye, ArrowRight, Trash2, Edit3, Check, X, ChevronDown,
  ChevronUp, Layers, Plus,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import type { PlanStep } from "@/app/api/projects/plan/route";

// ─── Types ────────────────────────────────────────────────────────────────────
type Task = { id: string; title: string; description?: string; status: string; priority: number };

type StepType = PlanStep["type"];
type EffortSize = PlanStep["estimated_effort"];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const TYPE_META: Record<StepType, { label: string; color: string; icon: React.ReactNode }> = {
  research:  { label: "Research",  color: "bg-blue-900/40 text-blue-300 border-blue-800",    icon: <Search size={10} /> },
  code:      { label: "Code",      color: "bg-orange-900/40 text-orange-300 border-orange-800", icon: <GitFork size={10} /> },
  command:   { label: "Command",   color: "bg-green-900/40 text-green-300 border-green-800",  icon: <Terminal size={10} /> },
  decision:  { label: "Decision",  color: "bg-purple-900/40 text-purple-300 border-purple-800", icon: <GitFork size={10} /> },
  review:    { label: "Review",    color: "bg-yellow-900/40 text-yellow-300 border-yellow-800", icon: <Eye size={10} /> },
};

const EFFORT_META: Record<EffortSize, { label: string; dots: number }> = {
  small:  { label: "Small",  dots: 1 },
  medium: { label: "Medium", dots: 2 },
  large:  { label: "Large",  dots: 3 },
};

function TypeBadge({ type }: { type: StepType }) {
  const m = TYPE_META[type] ?? TYPE_META.code;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${m.color}`}>
      {m.icon} {m.label}
    </span>
  );
}

function EffortDots({ effort }: { effort: EffortSize }) {
  const m = EFFORT_META[effort] ?? EFFORT_META.medium;
  return (
    <span className="flex items-center gap-0.5" title={m.label}>
      {[1, 2, 3].map((i) => (
        <span key={i} className={`w-1.5 h-1.5 rounded-full ${i <= m.dots ? "bg-[#CC785C]" : "bg-[#3A3A3A]"}`} />
      ))}
    </span>
  );
}

// ─── Editable Step Card ───────────────────────────────────────────────────────
function StepCard({
  step, index, onUpdate, onRemove,
}: {
  step: PlanStep;
  index: number;
  onUpdate: (updated: PlanStep) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(step);
  const [expanded, setExpanded] = useState(false);

  function save() {
    onUpdate(draft);
    setEditing(false);
  }

  function cancel() {
    setDraft(step);
    setEditing(false);
  }

  return (
    <div className="rounded-xl border border-[#2D2D2D] bg-[#1A1A1A] overflow-hidden">
      <div className="flex items-start gap-3 p-4">
        {/* Step number */}
        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-[#CC785C]/20 border border-[#CC785C]/40 flex items-center justify-center text-[11px] font-bold text-[#CC785C]">
          {step.step_number}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="space-y-2">
              <input
                className="w-full bg-[#111] border border-[#3A3A3A] rounded-lg px-3 py-1.5 text-[13px] text-white focus:outline-none focus:border-[#CC785C]"
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
              <textarea
                className="w-full bg-[#111] border border-[#3A3A3A] rounded-lg px-3 py-1.5 text-[12px] text-[#AAAAAA] focus:outline-none focus:border-[#CC785C] resize-none"
                rows={3}
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
              <div className="flex gap-2">
                <select
                  className="bg-[#111] border border-[#3A3A3A] rounded-lg px-2 py-1 text-[11px] text-[#AAAAAA] focus:outline-none"
                  value={draft.type}
                  onChange={(e) => setDraft({ ...draft, type: e.target.value as StepType })}
                >
                  {(Object.keys(TYPE_META) as StepType[]).map((t) => (
                    <option key={t} value={t}>{TYPE_META[t].label}</option>
                  ))}
                </select>
                <select
                  className="bg-[#111] border border-[#3A3A3A] rounded-lg px-2 py-1 text-[11px] text-[#AAAAAA] focus:outline-none"
                  value={draft.estimated_effort}
                  onChange={(e) => setDraft({ ...draft, estimated_effort: e.target.value as EffortSize })}
                >
                  {(Object.keys(EFFORT_META) as EffortSize[]).map((e) => (
                    <option key={e} value={e}>{EFFORT_META[e].label}</option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <>
              <div className="text-[13px] font-semibold text-white leading-snug">{step.title}</div>
              {(expanded || step.description.length < 120) && (
                <p className="mt-1 text-[12px] text-[#888] leading-relaxed">{step.description}</p>
              )}
              {step.description.length >= 120 && (
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="mt-1 flex items-center gap-1 text-[11px] text-[#CC785C] hover:text-[#e08860]"
                >
                  {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                  {expanded ? "Less" : "More"}
                </button>
              )}
            </>
          )}

          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <TypeBadge type={step.type} />
            <EffortDots effort={step.estimated_effort} />
          </div>
        </div>

        {/* Actions */}
        <div className="flex-shrink-0 flex gap-1.5 items-center">
          {editing ? (
            <>
              <button onClick={save} className="p-1.5 rounded-lg bg-[#2D5A3D] hover:bg-[#3a7050] text-green-400 transition-colors">
                <Check size={13} />
              </button>
              <button onClick={cancel} className="p-1.5 rounded-lg bg-[#2D2D2D] hover:bg-[#3A3A3A] text-[#888] transition-colors">
                <X size={13} />
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setEditing(true)} className="p-1.5 rounded-lg hover:bg-[#2D2D2D] text-[#666] hover:text-[#AAAAAA] transition-colors">
                <Edit3 size={13} />
              </button>
              <button onClick={onRemove} className="p-1.5 rounded-lg hover:bg-[#2D2D2D] text-[#666] hover:text-red-400 transition-colors">
                <Trash2 size={13} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function PlanPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const preloadTaskId = searchParams.get("taskId");

  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [customTitle, setCustomTitle] = useState("");
  const [customDesc, setCustomDesc] = useState("");
  const [useCustom, setUseCustom] = useState(false);

  const [steps, setSteps] = useState<PlanStep[]>([]);
  const [planTaskTitle, setPlanTaskTitle] = useState("");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load tasks
  useEffect(() => {
    supabase
      .from("project_tasks")
      .select("id, title, description, status, priority")
      .eq("project_id", id)
      .not("status", "in", '("done","cancelled")')
      .order("priority", { ascending: true })
      .then(({ data }) => {
        const list = data ?? [];
        setTasks(list);
        if (preloadTaskId) {
          const found = list.find((t) => t.id === preloadTaskId);
          if (found) setSelectedTask(found);
        }
      });
  }, [id, preloadTaskId]);

  const effectiveTitle = useCustom ? customTitle : (selectedTask?.title ?? "");
  const effectiveDesc  = useCustom ? customDesc  : (selectedTask?.description ?? "");

  async function generate() {
    if (!effectiveTitle.trim()) return;
    setGenerating(true);
    setError(null);
    setSteps([]);
    setSaved(false);

    try {
      const res = await fetch("/api/projects/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: id,
          taskId: useCustom ? undefined : selectedTask?.id,
          taskTitle: effectiveTitle,
          taskDescription: effectiveDesc,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to generate plan");
      setSteps(json.steps ?? []);
      setPlanTaskTitle(json.taskTitle ?? effectiveTitle);
    } catch (e: any) {
      setError(e.message ?? "Unknown error");
    } finally {
      setGenerating(false);
    }
  }

  async function savePlan() {
    if (!steps.length) return;
    setSaving(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not logged in");

      // Create one sub-task per step
      const inserts = steps.map((step) => ({
        project_id: id,
        user_id: user.id,
        title: `[Step ${step.step_number}] ${step.title}`,
        description: step.description,
        priority: 2,
        status: "todo",
        source_message_id: selectedTask?.id ?? null,
      }));

      const { error: insertErr } = await supabase
        .from("project_tasks")
        .insert(inserts);

      if (insertErr) throw insertErr;

      setSaved(true);
    } catch (e: any) {
      setError(e.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function sendToCode() {
    const param = selectedTask?.id ? `?taskId=${selectedTask.id}` : "";
    router.push(`/app/projects/${id}/code${param}`);
  }

  function addStep() {
    const next = steps.length + 1;
    setSteps([...steps, {
      step_number: next,
      title: "New step",
      description: "",
      type: "code",
      estimated_effort: "small",
    }]);
  }

  const canGenerate = effectiveTitle.trim().length > 0;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#111111]">
      {/* Header */}
      <div className="shrink-0 border-b border-[#2D2D2D] px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers size={16} className="text-[#CC785C]" />
            <span className="text-[14px] font-semibold text-white">Plan</span>
            <span className="text-[12px] text-[#666]">— break a task into executable steps</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-6 space-y-6">

          {/* Task selector */}
          <div className="rounded-xl border border-[#2D2D2D] bg-[#171717] p-5 space-y-4">
            <p className="text-[12px] font-semibold text-[#AAAAAA] uppercase tracking-wider">Select Task</p>

            <div className="flex gap-2">
              <button
                onClick={() => { setUseCustom(false); setSteps([]); setSaved(false); }}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
                  !useCustom ? "bg-[#CC785C] text-white" : "bg-[#2D2D2D] text-[#888] hover:text-white"
                }`}
              >
                From project
              </button>
              <button
                onClick={() => { setUseCustom(true); setSelectedTask(null); setSteps([]); setSaved(false); }}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
                  useCustom ? "bg-[#CC785C] text-white" : "bg-[#2D2D2D] text-[#888] hover:text-white"
                }`}
              >
                Custom task
              </button>
            </div>

            {!useCustom ? (
              tasks.length === 0 ? (
                <p className="text-[12px] text-[#666] italic">No open tasks in this project.</p>
              ) : (
                <div className="space-y-1.5 max-h-56 overflow-y-auto">
                  {tasks.map((task) => (
                    <button
                      key={task.id}
                      onClick={() => { setSelectedTask(task); setSteps([]); setSaved(false); }}
                      className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all text-[12px] ${
                        selectedTask?.id === task.id
                          ? "border-[#CC785C] bg-[#CC785C]/10 text-white"
                          : "border-[#2D2D2D] bg-[#111] text-[#AAAAAA] hover:border-[#3A3A3A] hover:text-white"
                      }`}
                    >
                      <span className="font-medium">{task.title}</span>
                      {task.description && (
                        <span className="block mt-0.5 text-[11px] text-[#666] truncate">{task.description}</span>
                      )}
                    </button>
                  ))}
                </div>
              )
            ) : (
              <div className="space-y-2">
                <input
                  className="w-full bg-[#111] border border-[#2D2D2D] rounded-lg px-3 py-2 text-[13px] text-white placeholder-[#555] focus:outline-none focus:border-[#CC785C]"
                  placeholder="Task title…"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                />
                <textarea
                  className="w-full bg-[#111] border border-[#2D2D2D] rounded-lg px-3 py-2 text-[12px] text-[#AAAAAA] placeholder-[#555] focus:outline-none focus:border-[#CC785C] resize-none"
                  rows={2}
                  placeholder="Description (optional)…"
                  value={customDesc}
                  onChange={(e) => setCustomDesc(e.target.value)}
                />
              </div>
            )}

            <button
              onClick={generate}
              disabled={!canGenerate || generating}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#CC785C] hover:bg-[#b5684e] text-white text-[13px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {generating ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
              {generating ? "Generating plan…" : "Generate Plan"}
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-xl border border-red-800 bg-red-900/20 px-4 py-3 text-[12px] text-red-400">
              {error}
            </div>
          )}

          {/* Plan steps */}
          {steps.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-semibold text-white">Plan for: <span className="text-[#CC785C]">{planTaskTitle}</span></p>
                  <p className="text-[11px] text-[#666] mt-0.5">{steps.length} steps — edit or remove before saving</p>
                </div>
                <button
                  onClick={addStep}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[#2D2D2D] bg-[#1A1A1A] hover:border-[#3A3A3A] text-[12px] text-[#AAAAAA] hover:text-white transition-colors"
                >
                  <Plus size={12} /> Add step
                </button>
              </div>

              <div className="space-y-3">
                {steps.map((step, i) => (
                  <StepCard
                    key={i}
                    step={step}
                    index={i}
                    onUpdate={(updated) => setSteps(steps.map((s, j) => j === i ? updated : s))}
                    onRemove={() => setSteps(steps.filter((_, j) => j !== i).map((s, j) => ({ ...s, step_number: j + 1 })))}
                  />
                ))}
              </div>

              {/* Action bar */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={savePlan}
                  disabled={saving || saved}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold transition-colors ${
                    saved
                      ? "bg-[#2D5A3D] text-green-400 cursor-default"
                      : "bg-[#CC785C] hover:bg-[#b5684e] text-white disabled:opacity-40 disabled:cursor-not-allowed"
                  }`}
                >
                  {saving ? (
                    <><Loader2 size={13} className="animate-spin" /> Saving…</>
                  ) : saved ? (
                    <><CheckCircle2 size={13} /> Saved to tasks</>
                  ) : (
                    <><Check size={13} /> Accept plan</>
                  )}
                </button>

                <button
                  onClick={sendToCode}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[#2D2D2D] bg-[#1A1A1A] hover:border-[#CC785C] text-[13px] text-[#AAAAAA] hover:text-[#CC785C] font-semibold transition-colors"
                >
                  <Terminal size={13} /> Send to Coding Agent <ArrowRight size={12} />
                </button>
              </div>
            </div>
          )}

          {/* Empty state — no plan yet */}
          {!generating && steps.length === 0 && !error && (
            <div className="rounded-xl border border-dashed border-[#2D2D2D] px-6 py-12 text-center">
              <Layers size={28} className="mx-auto text-[#3A3A3A] mb-3" />
              <p className="text-[13px] text-[#666]">Select a task and generate a plan to get started.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
