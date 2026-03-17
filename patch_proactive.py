from pathlib import Path

p = Path("src/app/api/ai/proactive/route.ts")
text = p.read_text(encoding="utf-8")

text = text.replace('action: { label: "Open Daily Check", data: { action: "navigate", href: "/app/daily-check" } },',
                    'action: { label: "Open Dashboard", data: { action: "navigate", href: "/app" } },')

text = text.replace('action: { label: "Log Check-in", data: { action: "navigate", href: "/app/daily-check" } },',
                    'action: { label: "Open Buddies AI", data: { action: "navigate", href: "/app/ai" } },')

text = text.replace('action: { label: "Check In Now", data: { action: "navigate", href: "/app/daily-check" } },',
                    'action: { label: "Review 7-Day Patterns", data: { action: "navigate", href: "/app" } },')

text = text.replace('action: { label: "Decide Now", data: { action: "navigate", href: "/app/decisions" } },',
                    'action: { label: "Review In Search", data: { action: "navigate", href: "/app/search" } },')

text = text.replace('action: { label: "Review", data: { action: "navigate", href: "/app/decisions" } },',
                    'action: { label: "Review In Search", data: { action: "navigate", href: "/app/search" } },')

text = text.replace('action: { label: "Add Update", data: { action: "navigate", href: "/app/project-update" } },',
                    'action: { label: "Open Buddies AI", data: { action: "navigate", href: "/app/ai" } },')

p.write_text(text, encoding="utf-8")
print("Patched proactive/route.ts")
