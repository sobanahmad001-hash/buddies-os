'use client';

import { useState, useEffect } from 'react';
import { X, RefreshCw, Loader2 } from 'lucide-react';

interface ContextData {
  projects: Array<{ id: string; name: string; status: string }>;
  recent_updates: Array<{ project: string; type: string; content: string }>;
  decisions: Array<{
    project: string;
    decision: string;
    status: string;
    confidence?: number;
    deadline?: string;
  }>;
  active_rules: Array<{ severity: number; rule: string }>;
  behavior: Array<{ mood?: string; stress?: number; sleep?: number }>;
}

interface ContextPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ContextPreviewModal({ isOpen, onClose }: ContextPreviewModalProps) {
  const [context, setContext] = useState<ContextData | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  async function fetchContext() {
    setLoading(true);
    try {
      const res = await fetch('/api/ai/context');
      const data = await res.json();
      setContext(data);
    } catch (e) {
      console.error('Failed to fetch context:', e);
    } finally {
      setLoading(false);
    }
  }

  async function refreshContext() {
    setRefreshing(true);
    await fetchContext();
    setRefreshing(false);
  }

  useEffect(() => {
    if (isOpen) fetchContext();
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden border border-[#E5E2DE]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E2DE]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#0F0F0F] rounded-xl flex items-center justify-center">
              <span className="text-xl">🧠</span>
            </div>
            <div>
              <h2 className="text-[16px] font-bold text-[#1A1A1A]">Buddies Memory View</h2>
              <p className="text-[12px] text-[#737373]">The working context Buddies is drawing from right now</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[#F0EDE9] rounded-lg transition-colors">
            <X size={18} className="text-[#737373]" />
          </button>
        </div>

        <div className="overflow-y-auto p-6 space-y-5" style={{ maxHeight: 'calc(85vh - 140px)' }}>
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={28} className="animate-spin text-[#B5622A]" />
            </div>
          ) : context ? (
            <>
              {context.projects?.length > 0 && (
                <Section title="Active Projects" count={context.projects.length}>
                  <div className="space-y-2">
                    {context.projects.map((p, i) => (
                      <div key={i} className="flex items-center justify-between px-3 py-2.5 bg-[#F7F5F2] rounded-lg">
                        <span className="text-[14px] font-medium text-[#1A1A1A]">{p.name}</span>
                        <span className={`px-2 py-0.5 text-[11px] rounded-full font-medium ${
                          p.status === 'active' ? 'bg-[#DCFCE7] text-[#16A34A]' : 'bg-[#F0EDE9] text-[#737373]'
                        }`}>{p.status}</span>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {context.recent_updates?.length > 0 && (
                <Section title="Recent Updates" count={context.recent_updates.length}>
                  <div className="space-y-2">
                    {context.recent_updates.map((u, i) => (
                      <div key={i} className="px-3 py-2.5 bg-[#F7F5F2] rounded-lg">
                        <div className="flex items-start gap-2">
                          <span className="text-[11px] font-bold text-[#B5622A] mt-0.5 shrink-0">[{u.project}]</span>
                          <span className="text-[13px] text-[#1A1A1A] leading-relaxed">{u.type}: {u.content}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {context.decisions?.length > 0 && (
                <Section title="Recent Decisions" count={context.decisions.length}>
                  <div className="space-y-2">
                    {context.decisions.map((d, i) => (
                      <div key={i} className="px-3 py-2.5 bg-[#F7F5F2] rounded-lg">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-2 py-0.5 text-[11px] font-bold rounded ${
                            d.status === 'WAIT' ? 'bg-[#FEF9C3] text-[#CA8A04]' :
                            d.status === 'GO'   ? 'bg-[#DCFCE7] text-[#16A34A]' :
                                                  'bg-[#FEE2E2] text-[#DC2626]'
                          }`}>{d.status}</span>
                          {d.confidence !== undefined && (
                            <span className="text-[11px] text-[#737373]">{d.confidence}% confidence</span>
                          )}
                        </div>
                        <p className="text-[13px] text-[#1A1A1A]">[{d.project}] {d.decision}</p>
                        {d.deadline && <p className="text-[11px] text-[#737373] mt-1">Due: {d.deadline}</p>}
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {context.active_rules?.length > 0 && (
                <Section title="Active Constraints" count={context.active_rules.length}>
                  <div className="space-y-2">
                    {context.active_rules.map((r, i) => (
                      <div key={i} className="flex items-start gap-2 px-3 py-2.5 bg-[#F7F5F2] rounded-lg">
                        <span className={`px-2 py-0.5 text-[11px] font-bold rounded shrink-0 ${
                          r.severity >= 3 ? 'bg-[#FEE2E2] text-[#DC2626]' :
                          r.severity === 2 ? 'bg-[#FEF9C3] text-[#CA8A04]' :
                                             'bg-[#DBEAFE] text-[#2563EB]'
                        }`}>sev {r.severity}</span>
                        <span className="text-[13px] text-[#1A1A1A] leading-relaxed">{r.rule}</span>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {context.behavior?.length > 0 && (
                <Section title="Behavior Signals" count={context.behavior.length}>
                  <div className="space-y-2">
                    {context.behavior.map((b, i) => (
                      <div key={i} className="flex items-center gap-5 px-3 py-2.5 bg-[#F7F5F2] rounded-lg text-[13px] text-[#1A1A1A]">
                        {b.mood && <span>mood: <strong>{b.mood}</strong></span>}
                        {b.stress !== undefined && <span>stress: <strong>{b.stress}/10</strong></span>}
                        {b.sleep !== undefined && <span>sleep: <strong>{b.sleep}h</strong></span>}
                      </div>
                    ))}
                  </div>
                </Section>
              )}
            </>
          ) : (
            <div className="text-center py-16 text-[#737373] text-[14px]">No memory context available</div>
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-[#E5E2DE]">
          <button
            onClick={refreshContext}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 bg-[#0F0F0F] hover:bg-[#1A1A1A] disabled:opacity-50 text-white text-[13px] font-medium rounded-lg transition-colors"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#F0EDE9] hover:bg-[#E5E2DE] text-[#1A1A1A] text-[13px] font-medium rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[13px] font-bold text-[#1A1A1A] mb-3 flex items-center gap-2">
        {title}
        <span className="px-2 py-0.5 text-[11px] bg-[#F0EDE9] text-[#737373] rounded-full">{count}</span>
      </h3>
      {children}
    </div>
  );
}
