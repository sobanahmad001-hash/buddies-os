"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { ThemePreference, useTheme } from "@/components/ThemeProvider";

const options: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme();

  if (compact) {
    const currentIndex = options.findIndex(option => option.value === theme);
    const next = options[(currentIndex + 1) % options.length];
    const CurrentIcon = options[currentIndex]?.icon ?? Monitor;
    return (
      <button
        type="button"
        onClick={() => setTheme(next.value)}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-subtle hover:text-ink"
        title={`Theme: ${theme}. Switch to ${next.label}.`}
        aria-label={`Theme: ${theme}. Switch to ${next.label}.`}
      >
        <CurrentIcon className="h-4 w-4" />
      </button>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-1 rounded-xl border border-line bg-surface-subtle p-1" role="radiogroup" aria-label="Color theme">
      {options.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          onClick={() => setTheme(value)}
          className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
            theme === value ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"
          }`}
        >
          <Icon className="h-4 w-4" />
          {label}
        </button>
      ))}
    </div>
  );
}
