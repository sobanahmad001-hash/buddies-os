from pathlib import Path

p = Path("src/app/app/search/page.tsx")
text = p.read_text(encoding="utf-8")

text = text.replace('onClick={() => router.push("/app/decisions")}',
                    'onClick={() => router.push("/app/search")}')

text = text.replace('onClick={() => router.push("/app/rules")}',
                    'onClick={() => router.push("/app/search")}')

p.write_text(text, encoding="utf-8")
print("Patched search/page.tsx")
