// In-process token bucket rate limiters for external APIs.
// Prevents a single Vercel function invocation from spiking quota usage.
//
// NOTE: State is in-memory — does NOT persist across Vercel instances.
// For cross-invocation rate limiting a KV store is required. See DEBT.md.

interface TokenBucket {
  tokens: number;
  lastRefill: number;
  tokensPerMinute: number;
}

const buckets = new Map<string, TokenBucket>();

function getBucket(name: string, tokensPerMinute: number): TokenBucket {
  if (!buckets.has(name)) {
    buckets.set(name, {
      tokens: tokensPerMinute,
      lastRefill: Date.now(),
      tokensPerMinute,
    });
  }
  return buckets.get(name)!;
}

// Acquire one token, waiting if needed until the bucket refills.
async function acquire(name: string, tokensPerMinute: number): Promise<void> {
  const bucket = getBucket(name, tokensPerMinute);
  const now = Date.now();

  // Refill proportionally to elapsed time
  const elapsed = now - bucket.lastRefill;
  if (elapsed >= 60_000) {
    bucket.tokens = bucket.tokensPerMinute;
    bucket.lastRefill = now;
  } else if (elapsed > 0) {
    const refill = Math.floor((elapsed / 60_000) * bucket.tokensPerMinute);
    if (refill > 0) {
      bucket.tokens = Math.min(bucket.tokensPerMinute, bucket.tokens + refill);
      bucket.lastRefill = now;
    }
  }

  if (bucket.tokens > 0) {
    bucket.tokens--;
    return;
  }

  // Wait until the next refill window, then take a token
  const waitMs = Math.max(0, 60_000 - (Date.now() - bucket.lastRefill));
  await new Promise((r) => setTimeout(r, waitMs));
  bucket.tokens = bucket.tokensPerMinute - 1;
  bucket.lastRefill = Date.now();
}

// Pre-configured rate limiters for each service.
// Usage: await rateLimiter.sheets.read() before calling readSheet().
export const rateLimiter = {
  sheets: {
    read: () => acquire("sheets_read", 50),
    write: () => acquire("sheets_write", 50),
  },
  anthropic: {
    request: () => acquire("anthropic", 20),
  },
  gmail: {
    send: () => acquire("gmail_send", 10),
  },
  places: {
    search: () => acquire("places_search", 10),
  },
};

// Check if we've hit the daily Gmail send limit (100 emails/day).
// Counts entries in the Approval Queue approved today + Action Log system emails.
// Returns { sent, limit, allowed }.
export async function checkGmailDailyQuota(): Promise<{
  sent: number;
  limit: number;
  allowed: boolean;
}> {
  const DAILY_LIMIT = 100;
  const today = new Date().toISOString().slice(0, 10);

  try {
    const { readSheetAsObjects } = await import("@/lib/google-sheets");
    const [queue, actionLog] = await Promise.all([
      readSheetAsObjects("Approval Queue").catch(() => [] as Record<string, string>[]),
      readSheetAsObjects("Action Log").catch(() => [] as Record<string, string>[]),
    ]);

    const approvedToday = queue.filter(
      (r) =>
        (r["status"] === "approved" || r["status"] === "sent") &&
        (r["decided_at"] ?? "").startsWith(today)
    ).length;

    const systemEmailsToday = actionLog.filter(
      (r) =>
        r["action"] === "system_email_sent" &&
        (r["timestamp"] ?? "").startsWith(today)
    ).length;

    const sent = approvedToday + systemEmailsToday;
    return { sent, limit: DAILY_LIMIT, allowed: sent < DAILY_LIMIT };
  } catch {
    // If we can't check, allow the send (fail open)
    return { sent: 0, limit: DAILY_LIMIT, allowed: true };
  }
}
