"use client";

import Link from "next/link";
import { BookOpen, FileText, Search, Brain, ArrowUpRight, Database } from "lucide-react";

const spaces = [
  {
    href: "/app/research",
    icon: BookOpen,
    title: "Research",
    description: "Run web-backed research, continue sessions, and turn findings into project work.",
    tone: "text-[#6BA3D6] bg-[#102033]",
  },
  {
    href: "/app/documents",
    icon: FileText,
    title: "Documents",
    description: "Create, edit, and organize durable documents outside individual conversations.",
    tone: "text-[#C47B4A] bg-[#291A12]",
  },
  {
    href: "/app/search",
    icon: Search,
    title: "Search",
    description: "Find projects, decisions, tasks, memories, research, and operational records.",
    tone: "text-[#8A7CC7] bg-[#1C1830]",
  },
  {
    href: "/app/ai",
    icon: Brain,
    title: "AI Memory",
    description: "Review context through the assistant while the dedicated memory control center is built.",
    tone: "text-[#61A785] bg-[#12271D]",
  },
];

export default function KnowledgePage() {
  return (
    <div className="flex-1 overflow-y-auto bg-[#0D0D0D] text-[#C8C5C0]">
      <div className="max-w-6xl mx-auto px-5 md:px-8 py-7">
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#B5622A] mb-2">Shared intelligence</p>
            <h1 className="text-2xl font-semibold text-[#E4E1DC]">Knowledge</h1>
            <p className="text-[13px] text-[#737373] mt-2 max-w-2xl leading-relaxed">
              Research, documents, files, decisions, and approved memory belong here—not inside disconnected chat history.
            </p>
          </div>
          <Database className="w-8 h-8 text-[#2D2D2D]" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {spaces.map(({ href, icon: Icon, title, description, tone }) => (
            <Link key={href} href={href} className="group rounded-2xl border border-[#252525] bg-[#151515] p-5 hover:border-[#3A3A3A] hover:bg-[#181818] transition-all">
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${tone}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-[14px] font-semibold text-[#D4D1CC]">{title}</h2>
                    <ArrowUpRight className="w-4 h-4 text-[#444] group-hover:text-[#B5622A] transition-colors" />
                  </div>
                  <p className="text-[12px] text-[#737373] leading-relaxed mt-2">{description}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-6 rounded-2xl border border-[#252525] bg-[#111] px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#737373]">Next capability</p>
          <p className="text-[13px] text-[#A8A5A0] mt-1">A source-aware memory control center with confidence, scope, approval, supersession, and forgetting controls.</p>
        </div>
      </div>
    </div>
  );
}
