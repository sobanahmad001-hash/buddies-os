'use client';

import { X, Lightbulb, AlertTriangle, CheckCircle, Clock } from 'lucide-react';

export interface Suggestion {
  id: string;
  type: 'pattern' | 'nudge' | 'insight' | 'warning';
  title: string;
  message: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  dismissable?: boolean;
}

interface SuggestionCardProps {
  suggestion: Suggestion;
  onDismiss?: (id: string) => void;
}

export default function SuggestionCard({ suggestion, onDismiss }: SuggestionCardProps) {
  const config = {
    pattern: {
      icon: <Lightbulb className="w-4 h-4 shrink-0" />,
      bar: 'bg-blue-500',
      bg: 'bg-[#F0F4FF]',
      border: 'border-[#DBEAFE]',
      text: 'text-[#1E40AF]',
      btn: 'bg-blue-100 hover:bg-blue-200 text-blue-800',
    },
    nudge: {
      icon: <Clock className="w-4 h-4 shrink-0" />,
      bar: 'bg-amber-400',
      bg: 'bg-[#FFFBEB]',
      border: 'border-[#FDE68A]',
      text: 'text-[#92400E]',
      btn: 'bg-amber-100 hover:bg-amber-200 text-amber-900',
    },
    insight: {
      icon: <CheckCircle className="w-4 h-4 shrink-0" />,
      bar: 'bg-[#10B981]',
      bg: 'bg-[#F0FDF4]',
      border: 'border-[#BBF7D0]',
      text: 'text-[#065F46]',
      btn: 'bg-emerald-100 hover:bg-emerald-200 text-emerald-900',
    },
    warning: {
      icon: <AlertTriangle className="w-4 h-4 shrink-0" />,
      bar: 'bg-red-500',
      bg: 'bg-[#FFF1F2]',
      border: 'border-[#FECDD3]',
      text: 'text-[#9F1239]',
      btn: 'bg-red-100 hover:bg-red-200 text-red-900',
    },
  }[suggestion.type];

  return (
    <div className={`relative rounded-xl border ${config.bg} ${config.border} overflow-hidden`}>
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${config.bar}`} />
      <div className="pl-4 pr-3 py-3 flex items-start gap-3">
        <div className={`mt-0.5 ${config.text}`}>{config.icon}</div>
        <div className="flex-1 min-w-0">
          <p className={`text-[12px] font-semibold ${config.text} mb-0.5`}>{suggestion.title}</p>
          <p className={`text-[12px] leading-snug opacity-80 ${config.text}`}>{suggestion.message}</p>
          {suggestion.action && (
            <button
              onClick={suggestion.action.onClick}
              className={`mt-2 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${config.btn}`}
            >
              {suggestion.action.label}
            </button>
          )}
        </div>
        {suggestion.dismissable !== false && onDismiss && (
          <button
            onClick={() => onDismiss(suggestion.id)}
            className={`p-0.5 rounded transition-colors opacity-50 hover:opacity-100 ${config.text}`}
            aria-label="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
