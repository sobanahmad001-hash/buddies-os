"use client";

const TYPE_ICONS: Record<string, string> = {
  task: "✓", update: "📝", project: "📁", message: "💬",
  file: "📎", bug: "🐛", campaign: "📣", asset: "🎨"
};

export default function ActivityFeed({ activity }: { activity: any[] }) {
  if (activity.length === 0) return (
    <p className="text-sm text-[#737373] py-4 text-center">No activity yet. Start working!</p>
  );
  return (
    <div className="space-y-2">
      {activity.map((a: any) => (
        <div key={a.id} className="flex gap-3 py-2.5 border-b border-[#F7F5F2] last:border-0">
          <span className="text-base shrink-0 mt-0.5">{TYPE_ICONS[a.activity_type] ?? "·"}</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm text-[#1A1A1A] font-medium">{a.title}</div>
            {a.content && <div className="text-xs text-[#737373] mt-0.5 truncate">{a.content}</div>}
          </div>
          <div className="text-[10px] text-[#B0ADA9] shrink-0">
            {new Date(a.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
      ))}
    </div>
  );
}
