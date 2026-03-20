import os

# ---------- dashboard ----------
content = open("src/app/app/page.tsx", encoding="utf-8").read()
replacements = [
    ("bg-white border border-[#E5E2DE]", "bg-[#1A1A1A] border border-[#2D2D2D]"),
    ("bg-white border border-[#2D2D2D]", "bg-[#1A1A1A] border border-[#2D2D2D]"),
    ("bg-[#FAF9F7] border border-[#EDE8E2]", "bg-[#161616] border border-[#2D2D2D]"),
    ("bg-[#FAF9F7]", "bg-[#161616]"),
    ("bg-[#F0FDF4]", "bg-[#0D1A12]"),
    ("border-[#BBF7D0]", "border-[#10B98140]"),
    ("bg-[#FEF2F2]", "bg-[#1A0D0D]"),
    ("border-[#FEE2E2]", "border-[#EF444430]"),
    ("bg-[#EFF6FF]", "bg-[#0D1220]"),
    ("border-[#DBEAFE]", "border-[#3B82F630]"),
    ("bg-[#FEFCE8]", "bg-[#1A1800]"),
    ("border-[#FEF9C3]", "border-[#EAB30830]"),
    ("bg-[#F7F5F2] rounded-full", "bg-[#2D2D2D] rounded-full"),
    ('"bg-[#DCFCE7] text-[#2D6A4F]"', '"bg-[#10B98120] text-[#10B981]"'),
    ('"bg-[#FEF9C3] text-[#92400E]"', '"bg-[#EAB30820] text-[#EAB308]"'),
    ('"bg-[#FEE2E2] text-[#DC2626]"', '"bg-[#EF444420] text-[#EF4444]"'),
    ('"bg-[#F0EDE9] text-[#737373]"', '"bg-[#2D2D2D] text-[#737373]"'),
]
original = content
for old, new in replacements:
    content = content.replace(old, new)
if content != original:
    open("src/app/app/page.tsx", "w", encoding="utf-8").write(content)
    print("OK src/app/app/page.tsx (dashboard deep clean)")
else:
    print("-- src/app/app/page.tsx (no extra changes)")

# ---------- project pages ----------
project_paths = [
    "src/app/app/projects/page.tsx",
    "src/app/app/projects/[id]/page.tsx",
    "src/app/app/projects/[id]/tasks/page.tsx",
    "src/app/app/projects/[id]/documents/page.tsx",
]
proj_replacements = [
    ("bg-white border border-[#E5E2DE]", "bg-[#1A1A1A] border border-[#2D2D2D]"),
    ("bg-white border border-[#2D2D2D]", "bg-[#1A1A1A] border border-[#2D2D2D]"),
    ("bg-[#F7F5F2]", "bg-[#111111]"),
    ("bg-[#FAF9F7]", "bg-[#161616]"),
    ("bg-[#F0EDE9]", "bg-[#1E1E1E]"),
    ("border-[#E5E2DE]", "border-[#2D2D2D]"),
    ("bg-white", "bg-[#1A1A1A]"),
    ("focus:border-[#E8521A]", "focus:border-[#B5622A]"),
]
for path in project_paths:
    if not os.path.exists(path):
        print(f"SKIP {path}")
        continue
    content = open(path, encoding="utf-8").read()
    original = content
    for old, new in proj_replacements:
        content = content.replace(old, new)
    if content != original:
        open(path, "w", encoding="utf-8").write(content)
        print(f"OK {path}")
    else:
        print(f"-- {path} (no extra changes)")

# ---------- AI assistant page ----------
content = open("src/app/app/ai/page.tsx", encoding="utf-8").read()
ai_replacements = [
    ("bg-white border border-[#E5E2DE]", "bg-[#1A1A1A] border border-[#2D2D2D]"),
    ("bg-white border-t border-[#E5E2DE]", "bg-[#111111] border-t border-[#2D2D2D]"),
    ("bg-white border-b border-[#E5E2DE]", "bg-[#111111] border-b border-[#2D2D2D]"),
    ("bg-[#F0EDE9] rounded-2xl", "bg-[#1E1E1E] rounded-2xl"),
    ("text-[#1A1A1A] leading-relaxed whitespace-pre-wrap", "text-[#C8C5C0] leading-relaxed whitespace-pre-wrap"),
    ("placeholder-[#B0ADA9]", "placeholder-[#3A3A3A]"),
    ("hover:bg-[#F0EDE9]", "hover:bg-[#1E1E1E]"),
    ("bg-[#0F0F0F]", "bg-[#1A1A1A]"),
    ("bg-white", "bg-[#1A1A1A]"),
]
original = content
for old, new in ai_replacements:
    content = content.replace(old, new)
if content != original:
    open("src/app/app/ai/page.tsx", "w", encoding="utf-8").write(content)
    print("OK src/app/app/ai/page.tsx (AI page deep clean)")
else:
    print("-- src/app/app/ai/page.tsx (no extra changes)")

print("Done")
