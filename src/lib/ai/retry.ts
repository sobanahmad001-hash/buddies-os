/**
 * Exponential backoff retry for AI API calls.
 * Tries up to maxAttempts times with exponential delay.
 * Only retries on transient errors (5xx, network errors).
 * Never retries on 4xx (auth, validation) — those won't self-heal.
 */

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  onRetry?: (attempt: number, error: unknown) => void;
}

function isTransientError(err: unknown): boolean {
  const e = err as Record<string, unknown>;
  const status = (e?.status ?? e?.statusCode ?? 0) as number;
  const message = String((e?.message as string) ?? "").toLowerCase();

  if (status >= 500 && status < 600) return true;
  if (message.includes("network") || message.includes("fetch") || message.includes("econnreset")) return true;
  if (message.includes("timeout") || message.includes("timed out") || status === 408) return true;
  if (status === 429) return true;
  return false;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelayMs = 1000,
    maxDelayMs = 8000,
    onRetry,
  } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;

      if (attempt === maxAttempts || !isTransientError(err)) {
        throw err;
      }

      const e = err as Record<string, unknown>;
      const isRateLimit = ((e?.status ?? e?.statusCode) as number) === 429;
      const delay = Math.min(
        isRateLimit
          ? baseDelayMs * 4 * attempt
          : baseDelayMs * Math.pow(2, attempt - 1),
        maxDelayMs
      );

      onRetry?.(attempt, err);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
