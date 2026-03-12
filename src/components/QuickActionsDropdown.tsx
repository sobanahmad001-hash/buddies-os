'use client';

import { useState } from 'react';
import { Zap, Smile, CheckSquare, AlertCircle, ListTodo, Shield, TrendingUp, ChevronUp } from 'lucide-react';

interface QuickAction {
  id: string;
  icon: React.ReactNode;
  label: string;
  command: string;
  hint: string;
}

const ACTIONS: QuickAction[] = [
  {
    id: 'mood',
    icon: <Smile className="w-3.5 h-3.5" />,
    label: 'Log Mood/Stress',
    command: 'log mood ',
    hint: 'log mood exhausted stress 8 sleep 6',
  },
  {
    id: 'decision',
    icon: <CheckSquare className="w-3.5 h-3.5" />,
    label: 'Mark Decision',
    command: 'decision GO ',
    hint: 'decision GO ProjectName context 80%',
  },
  {
    id: 'blocker',
    icon: <AlertCircle className="w-3.5 h-3.5" />,
    label: 'Report Blocker',
    command: 'blocker ',
    hint: 'blocker ProjectName what is blocked',
  },
  {
    id: 'task',
    icon: <ListTodo className="w-3.5 h-3.5" />,
    label: 'Add Task',
    command: 'task ',
    hint: 'task ProjectName what needs to be done',
  },
  {
    id: 'rule',
    icon: <Shield className="w-3.5 h-3.5" />,
    label: 'Set Rule',
    command: 'rule ',
    hint: 'rule no meetings before 10am',
  },
  {
    id: 'update',
    icon: <TrendingUp className="w-3.5 h-3.5" />,
    label: 'Quick Update',
    command: 'update ',
    hint: 'update ProjectName: finished the login flow',
  },
];

interface QuickActionsDropdownProps {
  onSelectAction: (command: string) => void;
}

export default function QuickActionsDropdown({ onSelectAction }: QuickActionsDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleSelect = (command: string) => {
    onSelectAction(command);
    setIsOpen(false);
  };

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setIsOpen(v => !v)}
        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-semibold transition-all ${
          isOpen
            ? 'bg-[#E8521A] text-white'
            : 'bg-[#F0EDE9] hover:bg-[#E5E2DE] text-[#1A1A1A]'
        }`}
        title="Quick Actions"
      >
        <Zap className="w-3.5 h-3.5" />
        <span>Actions</span>
        <ChevronUp className={`w-3 h-3 transition-transform ${isOpen ? '' : 'rotate-180'}`} />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute bottom-full left-0 mb-2 w-72 bg-[#0F0F0F] border border-[#2D2D2D] rounded-xl shadow-2xl z-20 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-[#1E1E1E]">
              <div className="flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-[#E8521A]" />
                <span className="text-[11px] font-bold text-white uppercase tracking-widest">Quick Actions</span>
              </div>
              <p className="text-[10px] text-[#525252] mt-0.5">Select to prefill the command</p>
            </div>

            <div className="py-1">
              {ACTIONS.map(action => (
                <button
                  key={action.id}
                  onClick={() => handleSelect(action.command)}
                  className="w-full flex items-start gap-3 px-4 py-2.5 hover:bg-[#1A1A1A] transition-colors text-left"
                >
                  <div className="mt-0.5 text-[#737373] shrink-0">{action.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-medium text-white">{action.label}</div>
                    <div className="text-[10px] font-mono text-[#525252] mt-0.5 truncate">{action.hint}</div>
                  </div>
                </button>
              ))}
            </div>

            <div className="px-4 py-2.5 border-t border-[#1E1E1E] bg-[#0A0A0A]">
              <p className="text-[10px] text-[#3A3A3A]">
                💡 Commands save directly — no AI call needed
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
