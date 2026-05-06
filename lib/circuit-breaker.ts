// Circuit breaker pattern — stops hammering a service that is repeatedly failing.
// After 5 consecutive failures: opens the circuit (blocks all calls).
// After 5 minutes in open state: allows one test request (half-open).
// On test success: closes circuit, resumes normal operation.
// On test failure: stays open for another 5 minutes.
//
// NOTE: State is in-memory per Vercel function instance.
// Cross-instance state would require a KV store — see DEBT.md.

import { log } from "@/lib/logger";

type CircuitState = "closed" | "open" | "half_open";

interface CircuitRecord {
  state: CircuitState;
  failureCount: number;
  openedAt?: number;
  lastAlertedAt?: number;
}

const circuits = new Map<string, CircuitRecord>();

const FAILURE_THRESHOLD = 5;
const RESET_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const ALERT_COOLDOWN_MS = 10 * 60 * 1000; // don't re-alert within 10 minutes

function getRecord(name: string): CircuitRecord {
  if (!circuits.has(name)) {
    circuits.set(name, { state: "closed", failureCount: 0 });
  }
  return circuits.get(name)!;
}

export function isCircuitOpen(name: string): boolean {
  const rec = getRecord(name);
  if (rec.state === "closed" || rec.state === "half_open") return false;
  // open — check if enough time has passed to try again
  if (Date.now() - (rec.openedAt ?? 0) > RESET_TIMEOUT_MS) {
    rec.state = "half_open";
    return false;
  }
  return true;
}

function onSuccess(name: string): void {
  const rec = getRecord(name);
  rec.failureCount = 0;
  rec.state = "closed";
}

function onFailure(name: string): void {
  const rec = getRecord(name);
  rec.failureCount++;
  if (rec.failureCount >= FAILURE_THRESHOLD && rec.state !== "open") {
    rec.state = "open";
    rec.openedAt = Date.now();

    // Alert Alistair (via Action Log) — but rate-limit the alert
    const now = Date.now();
    if (!rec.lastAlertedAt || now - rec.lastAlertedAt > ALERT_COOLDOWN_MS) {
      rec.lastAlertedAt = now;
      void log({
        agent: "alistair",
        action: "circuit_opened",
        status: "failure",
        errorMessage: `Circuit breaker opened for "${name}" after ${FAILURE_THRESHOLD} consecutive failures. All calls to this service are blocked for 5 minutes.`,
        metadata: { service: name, failureCount: rec.failureCount } as unknown as Record<string, unknown>,
      });
    }
  }
}

// Wrap any async call with circuit-breaker protection.
// Throws immediately if the circuit is open instead of making the API call.
export async function withCircuitBreaker<T>(
  name: string,
  fn: () => Promise<T>
): Promise<T> {
  if (isCircuitOpen(name)) {
    throw new Error(
      `Service "${name}" is temporarily unavailable — circuit breaker is open. Retry in 5 minutes.`
    );
  }

  try {
    const result = await fn();
    onSuccess(name);
    return result;
  } catch (err) {
    onFailure(name);
    throw err;
  }
}

// Returns current state of all tracked circuits — used by /api/health.
export function getCircuitStatus(): Record<
  string,
  { state: CircuitState; failures: number; openedAt?: string }
> {
  const result: Record<string, { state: CircuitState; failures: number; openedAt?: string }> = {};
  for (const [name, rec] of circuits.entries()) {
    result[name] = {
      state: rec.state,
      failures: rec.failureCount,
      openedAt: rec.openedAt ? new Date(rec.openedAt).toISOString() : undefined,
    };
  }
  return result;
}

// Named circuit instances — import these in lib files instead of passing strings.
export const CIRCUIT = {
  ANTHROPIC: "anthropic",
  SHEETS: "google_sheets",
  GMAIL: "gmail",
  CALENDAR: "google_calendar",
  PLACES: "google_places",
  MAKE: "make",
  STRIPE: "stripe",
  VAPI: "vapi",
  TELEGRAM: "telegram",
  GITHUB: "github",
} as const;
