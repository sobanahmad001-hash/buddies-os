/**
 * Helper to construct a NextRequest-compatible object for testing.
 * Avoids needing the full Next.js runtime.
 */
import { NextRequest } from "next/server";

export function makeRequest(
  url: string,
  options: {
    method?: string;
    body?: object;
    headers?: Record<string, string>;
  } = {}
): NextRequest {
  const { method = "GET", body, headers = {} } = options;
  const init: RequestInit = { method, headers: { "Content-Type": "application/json", ...headers } };
  if (body) init.body = JSON.stringify(body);
  return new NextRequest(url, init);
}

/** Extract JSON body from a NextResponse */
export async function json(res: Response): Promise<any> {
  return res.json();
}
