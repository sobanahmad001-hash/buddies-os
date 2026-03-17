import { NextRequest, NextResponse } from "next/server";
import { tavily } from "@tavily/core";
import { isProbablyUrl, readWebPage } from "@/lib/server/web-read";

export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json();

    if (!query || typeof query !== "string") {
      return NextResponse.json({ error: "Query required" }, { status: 400 });
    }

    const trimmed = query.trim();

    if (isProbablyUrl(trimmed)) {
      const page = await readWebPage(trimmed);
      return NextResponse.json({
        mode: "url",
        answer: page.summary,
        results: [
          {
            title: page.title,
            url: page.url,
            content: page.excerpt,
            score: 1,
          },
        ],
      });
    }

    if (!process.env.TAVILY_API_KEY) {
      return NextResponse.json({
        error: "Tavily is not configured for broad web search. Paste a direct URL to read a page, or add TAVILY_API_KEY for search queries.",
      }, { status: 400 });
    }

    const client = tavily({ apiKey: process.env.TAVILY_API_KEY });
    const response = await client.search(trimmed, {
      maxResults: 5,
      searchDepth: "basic",
      includeAnswer: true,
    });

    return NextResponse.json({
      mode: "search",
      answer: response.answer ?? null,
      results: (response.results ?? []).map((r: any) => ({
        title: r.title,
        url: r.url,
        content: r.content,
        score: r.score,
      })),
    });
  } catch (error) {
    console.error("Web search error:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
