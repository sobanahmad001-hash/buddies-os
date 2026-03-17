import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

export function isProbablyUrl(input: string): boolean {
  try {
    const normalized = input.trim().match(/^https?:\/\//i) ? input.trim() : `https://${input.trim()}`;
    const url = new URL(normalized);
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<\/?(div|p|section|article|main|aside|header|footer|li|ul|ol|h1|h2|h3|h4|h5|h6|br|tr|td|th)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function extractTitle(html: string, url: string): string {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return (m?.[1] || url).replace(/\s+/g, " ").trim();
}

async function summarizePage(url: string, title: string, text: string): Promise<string> {
  const content = text.slice(0, 12000);
  const prompt = `Summarize this webpage for Buddies OS.

URL: ${url}
TITLE: ${title}

CONTENT:
${content}

Return a concise summary in 4 parts:
1. What this page is
2. Main points
3. Important facts or actions
4. Why it may matter

Keep it practical and brief.`;

  if (process.env.OPENAI_API_KEY) {
    try {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const res = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      });
      const text = res.choices[0]?.message?.content?.trim();
      if (text) return text;
    } catch {}
  }

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const res = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      });
      const text = res.content
        .filter((b: any) => b.type === "text")
        .map((b: any) => b.text)
        .join("\n")
        .trim();
      if (text) return text;
    } catch {}
  }

  return text.slice(0, 1500);
}

export async function readWebPage(inputUrl: string) {
  const url = normalizeUrl(inputUrl);

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 BuddiesOS/1.0",
      "Accept": "text/html,application/xhtml+xml",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch URL (${res.status})`);
  }

  const html = await res.text();
  const title = extractTitle(html, url);
  const text = stripHtml(html);
  const excerpt = text.slice(0, 4000);
  const summary = await summarizePage(url, title, text);

  return {
    url,
    title,
    excerpt,
    summary,
    content: text,
  };
}
