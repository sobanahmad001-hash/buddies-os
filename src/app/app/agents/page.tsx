"use client";

import Link from "next/link";
import { Brain, Code2, Search, FileText, TrendingUp, ShieldCheck, ArrowRight } from "lucide-react";

const agents = [
  { name: "Chief of Staff", role: "Priorities, summaries, recommendations, and structured actions", icon: Brain, href: "/app/ai", state: "Available" },
  { name: "Coding Agent", role: "Repository analysis, code changes, validation, and pull requests", icon: Code2, href: "/app/coding-agent", state: "Available" },
  { name: "Researcher", role: "Web research, synthesis, follow-up questions, and project handoff", icon: Search, href: "/app/research", state: "Available" },
  { name: "Documentation Agent", role: "Durable project documents and approved knowledge updates", icon: FileText, href: "/app/documents", state: "Planned" },
  { name: "Trading Lab", role: "Evidence checks, strategy testing, ladder simulations, and manual journaling", icon: TrendingUp, href: "/app/trading-lab", state: "Available" },
];

export default function AgentsPage() {
  return (
    <div className="flex-1 overflow-y-auto bg-[#0D0D0D] text-[#C8C5C0]">
      <div className="max-w-6xl mx-auto px-5 md:px-8 py-7">
        <div className="mb-8">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#B5622A] mb-2">Human-controlled execution</p>
          <h1 className="text-2xl font-semibold text-[#E4E1DC]">Agents</h1>
          <p className="text-[13px] text-[#737373] mt-2 max-w-2xl leading-relaxed">
            One place to understand what each agent can access, what it is doing, and which actions require approval.
          </p>
        </div>

        <div className="rounded-2xl border border-[#2A2A2A] bg-[#151515] overflow-hidden">
          {agents.map(({ name, role, icon: Icon, href, state }, index) => (
            <Link key={name} href={href} className={`group flex items-center gap-4 px-5 py-4 hover:bg-[#191919] transition-colors ${index ? "border-t border-[#252525]" : ""}`}>
              <div className="w-9 h-9 rounded-xl bg-[#20170F] text-[#B5622A] flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-[13px] font-semibold text-[#D4D1CC]">{name}</h2>
                  <span className={`text-[9px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${state === "Available" ? "bg-[#123020] text-[#61A785]" : "bg-[#242424] text-[#737373]"}`}>{state}</span>
                </div>
                <p className="text-[11px] text-[#737373] mt-1">{role}</p>
              </div>
              <ArrowRight className="w-4 h-4 text-[#3A3A3A] group-hover:text-[#B5622A] transition-colors" />
            </Link>
          ))}
        </div>

        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-[#2B2A21] bg-[#17160F] p-4">
          <ShieldCheck className="w-5 h-5 text-[#C59B45] shrink-0" />
          <div>
            <p className="text-[12px] font-semibold text-[#CFC6AA]">Approval-first by default</p>
            <p className="text-[11px] text-[#77736A] mt-1 leading-relaxed">Agent definitions, live run status, costs, checkpoints, cancellation, and a unified approval inbox will be connected in the runtime phase.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
