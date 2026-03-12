/**
 * Shared Supabase mock factory.
 * Returned chainable builder mirrors the real Supabase query interface so
 * route handlers work exactly as written in production code.
 */

/** Build a fluent query mock that always resolves to { data, error }. */
export function makeQuery(data: unknown = null, error: unknown = null) {
  const q: any = {
    data,
    error,
    // Chainable no-ops — each returns `this` so .eq().eq()... works
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq:     jest.fn().mockReturnThis(),
    in:     jest.fn().mockReturnThis(),
    ilike:  jest.fn().mockReturnThis(),
    order:  jest.fn().mockReturnThis(),
    limit:  jest.fn().mockReturnThis(),
    // Terminals
    single:     jest.fn().mockResolvedValue({ data, error }),
    maybeSingle:jest.fn().mockResolvedValue({ data, error }),
  };
  // Make the query itself awaitable (for patterns like `await supabase.from(...).select(...)`)
  q.then = (resolve: Function) => Promise.resolve({ data, error }).then(resolve as any);
  return q;
}

/** Build a full Supabase client mock. */
export function makeSb(overrides: {
  user?: object | null;
  fromResults?: Record<string, { data?: unknown; error?: unknown }>;
} = {}) {
  const user = overrides.user !== undefined ? overrides.user : { id: "user-123" };
  const fromResults = overrides.fromResults ?? {};

  const supabase = {
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user }, error: null }),
    },
    from: jest.fn((table: string) => {
      const res = fromResults[table] ?? { data: [], error: null };
      return makeQuery(res.data ?? null, res.error ?? null);
    }),
  };
  return supabase as unknown as ReturnType<typeof import("@supabase/ssr").createServerClient>;
}
