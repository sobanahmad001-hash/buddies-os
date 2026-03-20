'use client';

import { useState, useEffect } from 'react';
import { Brain, BrainCircuit } from 'lucide-react';

interface ContextToggleProps {
  onChange?: (enabled: boolean) => void;
}

export default function ContextToggle({ onChange }: ContextToggleProps) {
  const [contextEnabled, setContextEnabled] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem('context_enabled');
    if (saved !== null) {
      setContextEnabled(saved === 'true');
    }
  }, []);

  const toggleContext = () => {
    const newValue = !contextEnabled;
    setContextEnabled(newValue);
    localStorage.setItem('context_enabled', String(newValue));
    onChange?.(newValue);
  };

  return (
    <button
      onClick={toggleContext}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-medium transition-all ${
        contextEnabled
          ? 'bg-[#0F0F0F] hover:bg-[#1A1A1A] text-white'
          : 'bg-[#F0EDE9] hover:bg-[#E5E2DE] text-[#737373]'
      }`}
      title={
        contextEnabled
          ? 'Memory ON — Buddies uses layered context and retrieval'
          : 'Memory OFF — Buddies uses only the live conversation'
      }
    >
      {contextEnabled ? (
        <BrainCircuit className="w-3.5 h-3.5 text-[#B5622A]" />
      ) : (
        <Brain className="w-3.5 h-3.5" />
      )}
      <span>Memory: {contextEnabled ? 'ON' : 'OFF'}</span>
      {contextEnabled && <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />}
    </button>
  );
}
