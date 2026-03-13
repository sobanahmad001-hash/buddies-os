"use client";
import { useEffect, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, LayoutGrid, CheckSquare, Bot, Scale, ShieldCheck, FlaskConical, FileText } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

const DEPT_META: Record<string, { label: string; color: string }> = {
  design:      { label: "Design",      color: "#8B5CF6" },
  development: { label: "Development", color: "#3B82F6" },
  marketing:   { label: "Marketing",   color: "#10B981" },
};

const TABS = [
  { label: "Overview",   suffix: "",            icon: LayoutGrid   },
  { label: "Tasks",      suffix: "/tasks",      icon: CheckSquare  },
  { label: "Assistant",  suffix: "/assistant",  icon: Bot          },
  { label: "Decisions",  suffix: "/decisions",  icon: Scale        },
  { label: "Rules",      suffix: "/rules",      icon: ShieldCheck  },
  { label: "Research",   suffix: "/research",   icon: FlaskConical },
  { label: "Documents",  suffix: "/documents",  icon: FileText     },
];

export default function DeptProjectLayout({ children }: { children: React.ReactNode }) {
  const { slug, projectId } = useParams() as { slug: string; projectId: string };
  const pathname = usePathname();
  const router = useRouter();
  const [project, setProject] = useState<any>(null);
  const meta = DEPT_META[slug] ?? { label: slug, color: "#E8521A" };

  useEffect(() => {
    supabase.from("dept_projects").select("id, name, status").eq("id", projectId).maybeSingle()
      .then(({ data }) => setProject(data));
  }, [projectId]);

  const base = `/app/dept/${slug}/projects/${projectId}`;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="bg-white border-b border-[#E5E2DE] px-6 pt-5 pb-0 shrink-0">
        <div className="flex items-center gap-2 mb-3 text-[13px]">
          <button onClick={() => router.push(`/app/dept/${slug}/projects`)}
            className="flex items-center gap-1 font-medium hover:underline"
            style={{ color: meta.color }}>
            <ArrowLeft size={13} /> {meta.label} Projects
          </button>
          <span className="text-[#D1CCCC]">/</span>
          <span className="text-[#404040] font-semibold truncate max-w-[240px]">{project?.name ?? "…"}</span>
          {project?.status && (
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${
              project.status === "active" ? "bg-green-100 text-green-700" :
              project.status === "paused" ? "bg-yellow-100 text-yellow-700" :
              "bg-[#F7F5F2] text-[#737373]"
            }`}>{project.status}</span>
          )}
        </div>

        <div className="flex gap-0.5 overflow-x-auto -mb-px">
          {TABS.map(tab => {
            const href   = base + tab.suffix;
            const active = tab.suffix === "" ? pathname === base : pathname.startsWith(href);
            const Icon   = tab.icon;
            return (
              <Link key={tab.label} href={href}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-[12px] font-medium border-b-2 transition-colors whitespace-nowrap ${
                  active
                    ? "border-b-2 text-[#1A1A1A]"
                    : "border-transparent text-[#8A8A8A] hover:text-[#404040] hover:border-[#D1CCCC]"
                }`}
                style={active ? { borderColor: meta.color, color: meta.color } : {}}>
                <Icon size={13} />
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>
      {children}
    </div>
  );
}
