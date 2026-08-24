"use client";

import Link from "next/link";
import { BookOpen, FileText, Search, Brain, ArrowUpRight, Database } from "lucide-react";

const spaces = [
  {
    href: "/app/research",
    icon: BookOpen,
    title: "Research",
    description: "Run web-backed research, continue sessions, and turn findings into project work.",
    tone: "text-accent bg-accent-soft",
  },
  {
    href: "/app/documents",
    icon: FileText,
    title: "Documents",
    description: "Create, edit, and organize durable documents outside individual conversations.",
    tone: "text-caution bg-surface-subtle",
  },
  {
    href: "/app/search",
    icon: Search,
    title: "Search",
    description: "Find projects, decisions, tasks, memories, research, and operational records.",
    tone: "text-ink bg-surface-subtle",
  },
  {
    href: "/app/memory",
    icon: Brain,
    title: "AI Memory",
    description: "Confirm, correct, expire, or forget the context Buddies uses across your work.",
    tone: "text-positive bg-surface-subtle",
  },
];

export default function KnowledgePage() {
  return (
    <div className="flex-1 overflow-y-auto bg-canvas text-ink">
      <div className="max-w-6xl mx-auto px-5 md:px-8 py-7">
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent mb-2">Shared intelligence</p>
            <h1 className="text-2xl font-semibold text-ink">Knowledge</h1>
            <p className="text-[13px] text-muted mt-2 max-w-2xl leading-relaxed">
              Research, documents, files, decisions, and approved memory belong here—not inside disconnected chat history.
            </p>
          </div>
          <Database className="w-8 h-8 text-faint" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {spaces.map(({ href, icon: Icon, title, description, tone }) => (
            <Link key={href} href={href} className="group rounded-2xl border border-line bg-surface p-5 hover:border-accent/40 hover:shadow-panel transition-all">
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${tone}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-[14px] font-semibold text-ink">{title}</h2>
                    <ArrowUpRight className="w-4 h-4 text-faint group-hover:text-accent transition-colors" />
                  </div>
                  <p className="text-[12px] text-muted leading-relaxed mt-2">{description}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-6 rounded-2xl border border-line bg-surface-subtle px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Knowledge policy</p>
          <p className="text-[13px] text-ink mt-1">Buddies separates sourced records, confirmed memory and inference—and lets you correct or forget stored context.</p>
        </div>
      </div>
    </div>
  );
}
