import { NextRequest, NextResponse } from 'next/server';
import { tavily } from '@tavily/core';

const client = tavily({ apiKey: process.env.TAVILY_API_KEY! });

export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json();

    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'Query required' }, { status: 400 });
    }

    const response = await client.search(query, {
      maxResults: 5,
      searchDepth: 'basic',
      includeAnswer: true,
    });

    return NextResponse.json({
      answer: response.answer ?? null,
      results: (response.results ?? []).map((r: any) => ({
        title: r.title,
        url: r.url,
        content: r.content,
        score: r.score,
      })),
    });
  } catch (error) {
    console.error('Web search error:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
