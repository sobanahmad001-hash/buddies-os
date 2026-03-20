"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  Plus,
  Bot,
  CheckSquare,
  Scale,
  ShieldCheck,
  FlaskConical,
  FileText,
  Code2,
  ArrowRight,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

type Project = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  priority: string | null;
  tags: string[] | null;
  updated_at: string;
  memory: string | null;
};

type Update = {
  id: string;
  update_type: string;
  content: string;
  outcomes: string | null;
  next_actions: string | null;
  created_at: string;
};

type Task = { id: string; title: string; status: string };
type ProjectDecision = { id: string; title: string; verdict: string | null; created_at: string };
type ProjectRule = { id: string; rule_text: string; severity: number; active: boolean };
type ProjectResearch = { id: string; topic: string; created_at: string };
type ProjectDocument = { id: string; title: string; created_at: string };

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function TypeBadge({ type }: { type: string }) {
  const map: Record<string, string> = {
    progress: "bg-[#DBEAFE] text-[#2C5F8A]",
    decision: "bg-[#DCFCE7] text-[#2D6A4F]",
    blocker: "bg-[#FEE2E2] text-[#EF4444]",
    milestone: "bg-[#FEF9C3] text-[#92400E]",
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold capitalize ${map[type] ?? map.progress}`}>
      {type}
    </span>
  );
}

function SectionCard({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-[#1A1A1A] border border-[#2D2D2D] rounded-xl p-4">
      <div className="flex items-start justify-between mb-3 gap-3">
        <div>
          <h2 className="text-[14px] font-semibold text-[#C8C5C0]">{title}</h2>
          {subtitle && <p className="text-[12px] text-[#737373] mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function LinkTile({
  icon: Icon,
  title,
  subtitle,
  onClick,
}: {
  icon: any;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-[#111111] border border-[#2D2D2D] rounded-xl p-3 hover:border-[#CC785C]/40 hover:bg-[#1A1A1A] transition-colors"
    >
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-[#1A1A1A] border border-[#2D2D2D] flex items-center justify-center shrink-0">
          <Icon size={15} className="text-[#CC785C]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13px] font-semibold text-[#C8C5C0]">{title}</p>
            <ArrowRight size={13} className="text-[#525252] shrink-0" />
          </div>
          <p className="text-[12px] text-[#737373] mt-1 leading-relaxed">{subtitle}</p>
        </div>
      </div>
    </button>
  );
}

function ProjectTimeline({ nodes }: { nodes: any[] }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!nodes?.length || !containerRef.current) return;

    const nodeColors: Record<string, string> = {
      research: "fill:#EFF6FF,stroke:#3B82F6,color:#1e40af",
      decision: "fill:#FAF0E8,stroke:#F59E0B,color:#92400e",
      task_batch: "fill:#ECFDF5,stroke:#10B981,color:#065f46",
      document: "fill:#F5F3FF,stroke:#8B5CF6,color:#4c1d95",
      pivot: "fill:#FEE2E2,stroke:#EF4444,color:#991b1b",
    };

    const lines = ["flowchart LR"];
    nodes.forEach((node, i) => {
      const label = (node.label ?? "").replace(/"/g, "'").slice(0, 28);
      const detail = node.detail ? `\n${node.detail.slice(0, 30)}` : "";
      const shape =
        node.type === "decision" ? `{"${label}"}` :
        node.type === "pivot"    ? `[/"${label}"/]` :
                                   `["${label}"]`;
      lines.push(`  N${i}${shape}`);
      if (i > 0) lines.push(`  N${i - 1} --> N${i}`);
      const style = nodeColors[node.type] ?? "fill:#1A1A1A,stroke:#2D2D2D,color:#C8C5C0";
      lines.push(`  style N${i} ${style}`);
    });

    const diagram = lines.join("\n");

    async function render() {
      try {
        // Dynamically import mermaid — avoids SSR issues
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "base",
          themeVariables: {
            fontFamily: "Inter, system-ui, sans-serif",
            fontSize: "13px",
          },
          flowchart: { curve: "basis", padding: 20 },
        });

        const id = `timeline-${Date.now()}`;
        const { svg } = await mermaid.render(id, diagram);
        if (containerRef.current) {
          containerRef.current.innerHTML = svg;
          // Make SVG responsive
          const svgEl = containerRef.current.querySelector("svg");
          if (svgEl) {
            svgEl.style.maxWidth = "100%";
            svgEl.style.height = "auto";
          }
        }
      } catch (err) {
        // Fallback: show node list if mermaid fails
        if (containerRef.current) {
          containerRef.current.innerHTML = `
            <div class="flex gap-2 overflow-x-auto pb-2">
              ${nodes.map((n, i) => `
                <div class="flex items-center gap-2 shrink-0">
                  <div class="px-3 py-1.5 rounded-lg text-[11px] font-semibold border" style="
                    background: ${n.type === "research" ? "#EFF6FF" : n.type === "decision" ? "#FAF0E8" : n.type === "task_batch" ? "#ECFDF5" : "#F5F3FF"};
                    border-color: ${n.type === "research" ? "#3B82F6" : n.type === "decision" ? "#F59E0B" : n.type === "task_batch" ? "#10B981" : "#8B5CF6"};
                    color: #1A1A1A;
                  ">
                    ${n.label?.slice(0, 25) ?? ""}
                  </div>
                  ${i < nodes.length - 1 ? '<span style="color:#B0ADA9;font-size:16px;">→</span>' : ""}
                </div>
              `).join("")}
            </div>`;
        }
      }
    }

    render();
  }, [nodes]);

  if (!nodes?.length) return (
    <div className="text-center py-8 text-[#525252] text-sm">
      No timeline events yet. Research, decisions, and task batches will appear here automatically.
    </div>
  );

  return (
    <div>
      <div className="text-[11px] text-[#737373] mb-3 flex items-center gap-2">
        <span>{nodes.length} event{nodes.length !== 1 ? "s" : ""}</span>
        <span>·</span>
        <span className="capitalize">{nodes[nodes.length - 1]?.type}</span>
        <span>·</span>
        <span>{new Date(nodes[nodes.length - 1]?.timestamp).toLocaleDateString()}</span>
      </div>
      <div ref={containerRef} className="overflow-x-auto min-h-[80px] flex items-center" />
    </div>
  );
}

export default function ProjectOverviewPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [updates, setUpdates] = useState<Update[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [decisions, setDecisions] = useState<ProjectDecision[]>([]);
  const [rules, setRules] = useState<ProjectRule[]>([]);
  const [research, setResearch] = useState<ProjectResearch[]>([]);
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [livingDoc, setLivingDoc] = useState<any>(null);
  const [updatingDoc, setUpdatingDoc] = useState(false);

  useEffect(() => {
    loadAll();
  }, [id]);

  useEffect(() => {
    if (id) {
      fetch(`/api/projects/timeline?projectId=${id}`).then(r => r.json()).then(d => setTimeline(d.timeline ?? []));
      fetch(`/api/projects/living-doc?projectId=${id}`).then(r => r.json()).then(d => setLivingDoc(d.doc ?? null));
    }
  }, [id]);

  async function updateLivingDoc() {
    setUpdatingDoc(true);
    await fetch("/api/projects/living-doc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: id }),
    });
    const res = await fetch(`/api/projects/living-doc?projectId=${id}`);
    const data = await res.json();
    setLivingDoc(data.doc ?? null);
    setUpdatingDoc(false);
  }

  async function loadAll() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return;
    }

    const [
      { data: p },
      { data: u },
      taskRes,
      decisionsRes,
      rulesRes,
      researchRes,
      documentsRes,
    ] = await Promise.all([
      supabase.from("projects").select("*").eq("id", id).eq("user_id", user.id).single(),
      supabase.from("project_updates").select("*").eq("project_id", id).order("created_at", { ascending: false }),
      fetch(`/api/projects/tasks?projectId=${id}`).then((r) => r.json()).catch(() => ({ tasks: [] })),
      fetch(`/api/projects/decisions?projectId=${id}`).then((r) => r.json()).catch(() => ({ decisions: [] })),
      fetch(`/api/projects/rules?projectId=${id}`).then((r) => r.json()).catch(() => ({ rules: [] })),
      fetch(`/api/projects/research?projectId=${id}`).then((r) => r.json()).catch(() => ({ research: [] })),
      fetch(`/api/projects/documents?projectId=${id}`).then((r) => r.json()).catch(() => ({ documents: [] })),
    ]);

    setProject(p);
    setUpdates(u ?? []);
    setTasks(taskRes.tasks ?? []);
    setDecisions(decisionsRes.decisions ?? []);
    setRules(rulesRes.rules ?? []);
    setResearch(researchRes.research ?? []);
    setDocuments(documentsRes.documents ?? []);
    setLoading(false);
  }

  async function handleArchive() {
    await supabase.from("projects").update({ status: "archived" }).eq("id", id);
    router.push("/app/projects");
  }

  const assistantHref = `/app/projects/${id}/assistant`;

  const openTasks = useMemo(() => tasks.filter((t) => t.status !== "done"), [tasks]);
  const doneTasks = useMemo(() => tasks.filter((t) => t.status === "done"), [tasks]);
  const activeRules = useMemo(() => rules.filter((r) => r.active), [rules]);
  const recentUpdates = updates.slice(0, 4);

  if (loading) {
    return <div className="flex items-center justify-center h-40"><p className="text-[14px] text-[#737373]">Loading…</p></div>;
  }

  if (!project) {
    return <div className="flex items-center justify-center h-40"><p className="text-[14px] text-[#737373]">Project not found.</p></div>;
  }

  return (
    <div className="p-4 md:p-6 max-w-[980px]">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-5">
        <div className="min-w-0">
          {project.description && (
            <p className="text-[14px] text-[#737373] mt-1 max-w-[640px] leading-relaxed">
              {project.description}
            </p>
          )}

          {project.memory && (
            <p className="text-[12px] text-[#737373] mt-2 italic">
              {project.memory.split("\n").find((l) => l.startsWith("Current focus:"))?.replace("Current focus:", "→ ") ?? ""}
            </p>
          )}

          {project.tags && project.tags.length > 0 && (
            <div className="flex gap-1.5 mt-3 flex-wrap">
              {project.tags.map((t) => (
                <span
                  key={t}
                  className="text-[11px] px-2 py-0.5 rounded-full bg-[#111111] text-[#737373] border border-[#2D2D2D]"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => router.push(assistantHref)}
            className="flex items-center gap-2 px-4 py-2 bg-[#1A1A1A] text-white text-[13px] font-semibold rounded-lg hover:bg-[#333] transition-colors"
          >
            <Plus size={14} /> Work with Assistant
          </button>

          <button
            onClick={handleArchive}
            className="px-4 py-2 border border-[#2D2D2D] text-[#737373] text-[13px] rounded-lg hover:border-[#EF4444] hover:text-[#EF4444] transition-colors"
          >
            Archive
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <div className="bg-[#1A1A1A] border border-[#2D2D2D] rounded-xl p-4">
          <p className="text-[11px] text-[#737373] uppercase tracking-wide">Updates</p>
          <p className="text-[20px] font-semibold text-[#C8C5C0] mt-1">{updates.length}</p>
        </div>
        <div className="bg-[#1A1A1A] border border-[#2D2D2D] rounded-xl p-4">
          <p className="text-[11px] text-[#737373] uppercase tracking-wide">Open Work</p>
          <p className="text-[20px] font-semibold text-[#C8C5C0] mt-1">{openTasks.length}</p>
        </div>
        <div className="bg-[#1A1A1A] border border-[#2D2D2D] rounded-xl p-4">
          <p className="text-[11px] text-[#737373] uppercase tracking-wide">Decisions</p>
          <p className="text-[20px] font-semibold text-[#C8C5C0] mt-1">{decisions.length}</p>
        </div>
        <div className="bg-[#1A1A1A] border border-[#2D2D2D] rounded-xl p-4">
          <p className="text-[11px] text-[#737373] uppercase tracking-wide">Documents</p>
          <p className="text-[20px] font-semibold text-[#C8C5C0] mt-1">{documents.length}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-4">
        <div className="space-y-4">
          <SectionCard
            title="Project Control"
            subtitle="Use the assistant as the main working surface for this project."
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <LinkTile
                icon={Bot}
                title="Project Assistant"
                subtitle="Discuss work, generate updates, plan next steps, and move the project forward."
                onClick={() => router.push(`/app/projects/${id}/assistant`)}
              />
              <LinkTile
                icon={CheckSquare}
                title="Work Queue"
                subtitle="Review open tasks, priorities, and current execution items."
                onClick={() => router.push(`/app/projects/${id}/tasks`)}
              />
              <LinkTile
                icon={FlaskConical}
                title="Research"
                subtitle="Open research notes, references, and supporting analysis."
                onClick={() => router.push(`/app/projects/${id}/research`)}
              />
              <LinkTile
                icon={FileText}
                title="Documents"
                subtitle="Access saved project documents, outputs, and generated files."
                onClick={() => router.push(`/app/projects/${id}/documents`)}
              />
              <LinkTile
                icon={Scale}
                title="Decisions"
                subtitle="Review project decisions captured so far and their direction."
                onClick={() => router.push(`/app/projects/${id}/decisions`)}
              />
              <LinkTile
                icon={ShieldCheck}
                title="Rules and Constraints"
                subtitle="Inspect project rules, constraints, and operating boundaries."
                onClick={() => router.push(`/app/projects/${id}/rules`)}
              />
            </div>
          </SectionCard>

          {/* Living Product Document card */}
          <div className="bg-[#1A1A1A] border border-[#2D2D2D] rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm">📄</span>
                <h3 className="text-[12px] font-semibold text-[#C8C5C0] uppercase tracking-wide">Living Product Document</h3>
                {livingDoc && <span className="text-[10px] text-[#10B981] bg-[#ECFDF5] px-2 py-0.5 rounded-full">Always current</span>}
              </div>
              <button onClick={updateLivingDoc} disabled={updatingDoc}
                className="text-[11px] px-3 py-1.5 bg-[#B5622A] text-white rounded-lg font-semibold hover:bg-[#9A4E20] disabled:opacity-40 transition-colors">
                {updatingDoc ? "Updating…" : livingDoc ? "Refresh" : "Generate"}
              </button>
            </div>
            {livingDoc ? (
              <div>
                <p className="text-[12px] text-[#A8A5A0] leading-relaxed line-clamp-4 whitespace-pre-wrap">{livingDoc.content.slice(0, 400)}…</p>
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-[10px] text-[#737373]">Updated {livingDoc.auto_updated_at ? new Date(livingDoc.auto_updated_at).toLocaleDateString() : "—"}</span>
                  <button onClick={() => router.push(`/app/projects/${id}/documents`)}
                    className="text-[11px] text-[#B5622A] hover:underline">View full →</button>
                </div>
              </div>
            ) : (
              <p className="text-[12px] text-[#737373]">Click Generate to create your living product document from all project data.</p>
            )}
          </div>

          {/* Project Timeline card */}
          <div className="bg-[#1A1A1A] border border-[#2D2D2D] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm">🗺️</span>
              <h3 className="text-[12px] font-semibold text-[#C8C5C0] uppercase tracking-wide">Project Timeline</h3>
            </div>
            <ProjectTimeline nodes={timeline} />
          </div>

          <SectionCard
            title="Recent Project Activity"
            subtitle="Latest updates and movement inside this project."
            action={
              <button
                onClick={() => router.push(assistantHref)}
                className="text-[12px] text-[#CC785C] hover:underline"
              >
                Add update
              </button>
            }
          >
            {recentUpdates.length === 0 ? (
              <p className="text-[13px] text-[#737373]">No updates yet. Use the project assistant to log progress naturally.</p>
            ) : (
              <div className="space-y-3">
                {recentUpdates.map((u) => (
                  <div key={u.id} className="bg-[#111111] border border-[#2D2D2D] rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <TypeBadge type={u.update_type} />
                      <span className="text-[12px] text-[#737373]">{timeAgo(u.created_at)}</span>
                    </div>

                    <p className="text-[14px] text-[#A8A5A0] mb-2 leading-relaxed">{u.content}</p>

                    {u.outcomes && (
                      <div className="mb-2">
                        <span className="text-[11px] font-semibold text-[#737373] uppercase tracking-wide">Outcomes</span>
                        <p className="text-[12px] text-[#737373] mt-1 pl-3 border-l-2 border-[#CC785C]">{u.outcomes}</p>
                      </div>
                    )}

                    {u.next_actions && (
                      <div>
                        <span className="text-[11px] font-semibold text-[#737373] uppercase tracking-wide">Next Actions</span>
                        <p className="text-[12px] text-[#737373] mt-1 pl-3 border-l-2 border-[#CC785C]">{u.next_actions}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>

        <div className="space-y-4">
          <SectionCard title="Work Snapshot" subtitle="Current execution state">
            <div className="space-y-3">
              <div className="bg-[#111111] rounded-xl p-3">
                <p className="text-[11px] text-[#737373] uppercase tracking-wide">Open Tasks</p>
                {openTasks.length === 0 ? (
                  <p className="text-[13px] text-[#737373] mt-2">No open tasks.</p>
                ) : (
                  <div className="space-y-2 mt-2">
                    {openTasks.slice(0, 4).map((t) => (
                      <div key={t.id} className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#CC785C] shrink-0" />
                        <p className="text-[12px] text-[#A8A5A0] truncate">{t.title}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-[#111111] rounded-xl p-3">
                <p className="text-[11px] text-[#737373] uppercase tracking-wide">Completed Tasks</p>
                <p className="text-[18px] font-semibold text-[#C8C5C0] mt-1">{doneTasks.length}</p>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Knowledge Snapshot" subtitle="Decision, rule, research, and document context">
            <div className="space-y-3">
              <div className="bg-[#111111] rounded-xl p-3">
                <p className="text-[11px] text-[#737373] uppercase tracking-wide">Recent Decisions</p>
                {decisions.length === 0 ? (
                  <p className="text-[13px] text-[#737373] mt-2">No decisions logged yet.</p>
                ) : (
                  <div className="space-y-2 mt-2">
                    {decisions.slice(0, 3).map((d) => (
                      <div key={d.id}>
                        <p className="text-[12px] text-[#A8A5A0]">{d.title}</p>
                        <p className="text-[10px] text-[#737373] mt-0.5">{d.verdict ?? "pending"} · {timeAgo(d.created_at)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-[#111111] rounded-xl p-3">
                <p className="text-[11px] text-[#737373] uppercase tracking-wide">Active Rules</p>
                {activeRules.length === 0 ? (
                  <p className="text-[13px] text-[#737373] mt-2">No active rules.</p>
                ) : (
                  <div className="space-y-2 mt-2">
                    {activeRules.slice(0, 3).map((r) => (
                      <div key={r.id} className="flex items-center justify-between gap-2">
                        <p className="text-[12px] text-[#A8A5A0] line-clamp-2">{r.rule_text}</p>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#111111] text-[#737373] shrink-0">
                          S{r.severity}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-[#111111] rounded-xl p-3">
                <p className="text-[11px] text-[#737373] uppercase tracking-wide">Research Topics</p>
                {research.length === 0 ? (
                  <p className="text-[13px] text-[#737373] mt-2">No research notes yet.</p>
                ) : (
                  <div className="space-y-2 mt-2">
                    {research.slice(0, 3).map((r) => (
                      <div key={r.id}>
                        <p className="text-[12px] text-[#A8A5A0]">{r.topic}</p>
                        <p className="text-[10px] text-[#737373] mt-0.5">{timeAgo(r.created_at)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-[#111111] rounded-xl p-3">
                <p className="text-[11px] text-[#737373] uppercase tracking-wide">Recent Documents</p>
                {documents.length === 0 ? (
                  <p className="text-[13px] text-[#737373] mt-2">No documents saved yet.</p>
                ) : (
                  <div className="space-y-2 mt-2">
                    {documents.slice(0, 3).map((d) => (
                      <div key={d.id}>
                        <p className="text-[12px] text-[#A8A5A0]">{d.title}</p>
                        <p className="text-[10px] text-[#737373] mt-0.5">{timeAgo(d.created_at)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Developer Surface" subtitle="Code and technical context">
            <LinkTile
              icon={Code2}
              title="Code Workspace"
              subtitle="Open the code view and connected technical context for this project."
              onClick={() => router.push(`/app/projects/${id}/code`)}
            />
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

