from pathlib import Path

targets = [
    Path("src/app/app/layout.tsx"),
    Path("src/app/app/search/page.tsx"),
    Path("src/app/api/ai/proactive/route.ts"),
    Path("src/app/app/ai/page.tsx"),
]

replacements = {
    "/app/clients": "/app",
    "/app/command": "/app/ai",
    "/app/daily-check": "/app",
    "/app/decisions": "/app/search",
    "/app/new-decision": "/app/ai",
    "/app/project-update": "/app/ai",
    "/app/rules": "/app/search",
}

for path in targets:
    if not path.exists():
        continue
    text = path.read_text(encoding="utf-8")
    original = text
    for old, new in replacements.items():
        text = text.replace(old, new)
    if text != original:
        path.write_text(text, encoding="utf-8")
        print(f"Patched {path}")

print("Reference patching complete")
