import { Activity, BarChart3, Brain, Database, FlaskConical, LockKeyhole, TrendingUp } from "lucide-react";
import { CONNECTOR_CATALOG } from "@/lib/trading-lab/connectors";

const modules = [
  { icon: LockKeyhole, title: "Connector Hub", copy: "Encrypted provider credentials, health checks and capability routing.", phase: "Phase 1" },
  { icon: Database, title: "Market Data Hub", copy: "Gold spot, COMEX futures, macro, positioning and data-quality states.", phase: "Phase 2" },
  { icon: FlaskConical, title: "Strategy Lab", copy: "Versioned short-term and long-term strategies with reusable templates.", phase: "Phase 3" },
  { icon: BarChart3, title: "Backtesting", copy: "Deterministic fills, costs, walk-forward evaluation and ladder simulation.", phase: "Phase 4" },
  { icon: Brain, title: "AI Copilot", copy: "Turn ideas into testable rules and explain verified results.", phase: "Phase 5" },
  { icon: Activity, title: "Decision Desk", copy: "Fundamental, technical and volume/Wyckoff evidence with controlled states.", phase: "Phase 6" },
] as const;

export default function TradingLabFoundationPage() {
  return (
    <main className="min-h-screen bg-canvas px-4 py-6 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-panel">
          <div className="grid gap-0 lg:grid-cols-[1.3fr_.7fr]">
            <div className="p-6 sm:p-8">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
                <TrendingUp size={14} /> Foundation workspace
              </div>
              <h1 className="max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl">Trading Lab</h1>
              <p className="mt-4 max-w-3xl text-sm leading-6 text-muted sm:text-base">
                A new evidence-driven strategy, backtesting, decision and journaling system inside Buddies OS.
                The current Trading Agent remains operational until every migration gate passes.
              </p>
            </div>
            <div className="border-t border-line bg-surface-subtle p-6 lg:border-l lg:border-t-0">
              <p className="text-xs font-bold uppercase tracking-wider text-muted">Current gate</p>
              <p className="mt-2 text-lg font-bold">Phase 0 - Foundation</p>
              <p className="mt-2 text-sm leading-5 text-muted">Protected route, capability contracts, strategy schema and legacy migration map.</p>
              <div className="mt-5 h-2 overflow-hidden rounded-full bg-line"><div className="h-full w-[10%] rounded-full bg-accent" /></div>
              <p className="mt-2 text-xs text-muted">No production navigation or database cutover yet.</p>
            </div>
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-end justify-between gap-4">
            <div><p className="text-xs font-bold uppercase tracking-wider text-muted">Architecture</p><h2 className="mt-1 text-xl font-bold">Build sequence</h2></div>
            <span className="text-xs text-muted">Execution remains external</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {modules.map(({ icon: Icon, title, copy, phase }) => (
              <article key={title} className="rounded-xl border border-line bg-surface p-5">
                <div className="flex items-start justify-between gap-3"><Icon className="text-accent" size={20} /><span className="rounded bg-surface-subtle px-2 py-1 text-[10px] font-bold text-muted">{phase}</span></div>
                <h3 className="mt-4 text-sm font-bold">{title}</h3><p className="mt-2 text-xs leading-5 text-muted">{copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
          <p className="text-xs font-bold uppercase tracking-wider text-muted">Planned connector catalogue</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {CONNECTOR_CATALOG.map(connector => (
              <div key={connector.id} className="flex items-start justify-between gap-4 rounded-xl border border-line bg-surface-subtle p-4">
                <div><p className="text-sm font-bold">{connector.name}</p><p className="mt-1 text-xs leading-5 text-muted">{connector.note}</p></div>
                <span className="shrink-0 rounded-full border border-line bg-surface px-2 py-1 text-[10px] font-bold text-muted">Phase {connector.phase}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
