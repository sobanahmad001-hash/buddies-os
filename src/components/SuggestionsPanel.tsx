'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Loader2, Sparkles } from 'lucide-react';
import SuggestionCard, { type Suggestion } from './SuggestionCard';
import { useRouter } from 'next/navigation';

interface RawSuggestion {
  id: string;
  type: 'pattern' | 'nudge' | 'insight' | 'warning';
  title: string;
  message: string;
  action?: { label: string; data: { action: string; href?: string; [key: string]: unknown } };
}

export default function SuggestionsPanel() {
  const router = useRouter();
  const [suggestions, setSuggestions] = useState<RawSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    const saved = localStorage.getItem('dismissed_suggestions');
    if (saved) {
      try { setDismissed(new Set(JSON.parse(saved))); } catch { /* ignore */ }
    }
  }, []);

  const fetchSuggestions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ai/proactive');
      const data = await res.json();
      setSuggestions(data.suggestions ?? []);
    } catch {
      // fail silently — suggestions are non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);

  const handleDismiss = (id: string) => {
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    localStorage.setItem('dismissed_suggestions', JSON.stringify([...next]));
  };

  const handleAction = (data: { action: string; href?: string; [key: string]: unknown }) => {
    if (data.action === 'navigate' && data.href) {
      router.push(data.href as string);
    }
  };

  const visible = suggestions.filter(s => !dismissed.has(s.id));

  const mapped: Suggestion[] = visible.map(s => ({
    ...s,
    action: s.action
      ? { label: s.action.label, onClick: () => handleAction(s.action!.data) }
      : undefined,
  }));

  return (
    <div>
      <div className="flex items-center justify-between mb-2.5 px-0.5">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-[#B5622A]" />
          <span className="text-[11px] font-bold text-[#3A3A3A] uppercase tracking-widest">
            Suggestions{visible.length > 0 ? ` (${visible.length})` : ''}
          </span>
        </div>
        <button
          onClick={fetchSuggestions}
          disabled={loading}
          className="p-1 text-[#737373] hover:text-[#1A1A1A] transition-colors disabled:opacity-40 rounded"
          title="Refresh suggestions"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-4 h-4 animate-spin text-[#B0ADA9]" />
        </div>
      ) : mapped.length === 0 ? (
        <div className="text-center py-5">
          <p className="text-[11px] text-[#737373]">All good — no suggestions right now 🎉</p>
        </div>
      ) : (
        <div className="space-y-2">
          {mapped.map(s => (
            <SuggestionCard key={s.id} suggestion={s} onDismiss={handleDismiss} />
          ))}
        </div>
      )}
    </div>
  );
}
