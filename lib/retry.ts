// Universal retry wrapper with exponential backoff.
// Attempt 1: immediate. Attempts 2/3/4: wait 2s/4s/8s before retrying.
// All external API calls in lib/ use this — never scatter retry logic in agents.

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  shouldRetry?: (err: Error) => boolean;
  onRetry?: (attempt: number, error: Error) => void;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 4,
    baseDelayMs = 2000,
    shouldRetry = isRetryableError,
    onRetry,
  } = options;

  let lastError: Error = new Error("Unknown error");

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Never retry if the error is permanent (auth failure, not-found, etc.)
      if (!shouldRetry(lastError)) throw lastError;

      // Last attempt — surface the error
      if (attempt === maxAttempts) break;

      if (onRetry) onRetry(attempt, lastError);

      // 2s → 4s → 8s between attempts 1→2, 2→3, 3→4
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastError;
}

// Returns true for errors worth retrying (transient / temporary failures).
// Returns false for permanent errors (auth, not-found, validation).
export function isRetryableError(err: Error): boolean {
  const msg = err.message.toLowerCase();
  return (
    msg.includes("429") ||
    msg.includes("rate limit") ||
    msg.includes("quota") ||
    msg.includes("resource exhausted") ||
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("econnreset") ||
    msg.includes("econnrefused") ||
    msg.includes("enotfound") ||
    msg.includes("network") ||
    msg.includes("socket") ||
    msg.includes("503") ||
    msg.includes("502") ||
    msg.includes("500") ||
    msg.includes("internal server error") ||
    msg.includes("service unavailable") ||
    msg.includes("temporarily unavailable")
  );
}
