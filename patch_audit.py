import os, re

patterns = ['#FAFAF8', '#F7F5F2', '#F0EDE9', '#FAF9F7', '#FAFAFA', '#FAF5EF',
            '#E5E2DE', '#EDE8E2', '#E8E5E0', '#FAF9F8', '#F5F5F5',
            r'bg-white\b', r'text-\[#1A1A1A\]', r'text-\[#404040\]']

pages = [
    'src/app/app/page.tsx',
    'src/app/app/ai/page.tsx',
    'src/app/app/projects/page.tsx',
    'src/app/app/research/page.tsx',
    'src/app/app/projects/[id]/page.tsx',
    'src/app/app/projects/[id]/assistant/page.tsx',
    'src/app/app/projects/[id]/documents/page.tsx',
    'src/app/app/projects/[id]/tasks/page.tsx',
    'src/app/app/projects/[id]/research/page.tsx',
    'src/app/app/search/page.tsx',
    'src/app/app/integrations/page.tsx',
    'src/app/app/layout.tsx',
]

for path in pages:
    if not os.path.exists(path):
        continue
    content = open(path, encoding='utf-8').read()
    hits = []
    for p in patterns:
        matches = re.findall(p, content)
        if matches:
            hits.append(p + "(" + str(len(matches)) + ")")
    if hits:
        print("  " + path + ": " + " | ".join(hits))
print('Audit complete')
