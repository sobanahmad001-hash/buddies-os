"use client";

interface Props {
  totalTasks: number;
  inProgress: number;
  done: number;
  todo: number;
  memberCount: number;
  lastActivity?: string | null;
  accentColor: string;
}

export default function MiniDashboard({ totalTasks, inProgress, done, todo, memberCount, lastActivity, accentColor }: Props) {
  return (
    <div className="bg-white rounded-2xl border border-[#E5E2DE] p-4 mb-6">
      <div className="grid grid-cols-4 gap-4">
        <div className="text-center">
          <div className="text-2xl font-bold" style={{ color: accentColor }}>{inProgress}</div>
          <div className="text-[10px] text-[#737373] font-medium uppercase tracking-wide mt-0.5">In Progress</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-[#737373]">{todo}</div>
          <div className="text-[10px] text-[#737373] font-medium uppercase tracking-wide mt-0.5">Queued</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-[#10B981]">{done}</div>
          <div className="text-[10px] text-[#737373] font-medium uppercase tracking-wide mt-0.5">Done</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-[#1A1A1A]">{memberCount}</div>
          <div className="text-[10px] text-[#737373] font-medium uppercase tracking-wide mt-0.5">Members</div>
        </div>
      </div>
      {lastActivity && (
        <div className="mt-3 pt-3 border-t border-[#F0EDE9] text-[10px] text-[#B0ADA9] truncate">
          ↑ Latest: {lastActivity}
        </div>
      )}
    </div>
  );
}
