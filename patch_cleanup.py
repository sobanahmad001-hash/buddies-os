import os, re

# All pages except coding-agent
PAGES = [
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
]

# Regex-based replacements (broad, catch all variants)
REGEX_RULES = [
    (r'bg-\[#FAFAF8\]',     'bg-[#0D0D0D]'),
    (r'bg-\[#F7F5F2\]',     'bg-[#111111]'),
    (r'bg-\[#F0EDE9\]',     'bg-[#1E1E1E]'),
    (r'bg-\[#FAF9F7\]',     'bg-[#161616]'),
    (r'bg-\[#FAFAFA\]',     'bg-[#111111]'),
    (r'bg-\[#FAF5EF\]',     'bg-[#1A1A1A]'),
    (r'bg-\[#FAF9F8\]',     'bg-[#161616]'),
    (r'bg-\[#F5F5F5\]',     'bg-[#161616]'),
    # bg-white — match in class strings (followed by space, quote, or newline)
    (r'bg-white(?=[\s"\'\]>])', 'bg-[#1A1A1A]'),
    # Borders - all variants
    (r'border-\[#E5E2DE\]', 'border-[#2D2D2D]'),
    (r'border-\[#EDE8E2\]', 'border-[#2D2D2D]'),
    (r'border-\[#E8E5E0\]', 'border-[#2D2D2D]'),
    # Text
    (r'text-\[#1A1A1A\]',   'text-[#C8C5C0]'),
    (r'text-\[#404040\]',   'text-[#A8A5A0]'),
    (r'text-\[#B0ADA9\]',   'text-[#525252]'),
]

for path in PAGES:
    if not os.path.exists(path):
        print('SKIP ' + path)
        continue
    content = open(path, encoding='utf-8').read()
    original = content
    for pattern, replacement in REGEX_RULES:
        content = re.sub(pattern, replacement, content)
    if content != original:
        open(path, 'w', encoding='utf-8').write(content)
        print('OK ' + path)
    else:
        print('-- ' + path + ' (clean)')

print('Cleanup complete')
