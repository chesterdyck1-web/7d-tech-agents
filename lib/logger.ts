// Writes every agent action to the Action Log sheet (immutable audit trail).
// Call log() after every significant action — success, failure, or pending.
// Never logs sensitive data: no email body content, no API keys.

import { appendToSheet } from "@/lib/google-sheets";
import { randomUUID } from "crypto";

type Agent =
  | "coordinator"
  | "prospecting"
  | "outreach"
  | "fulfillment"
  | "content"
  | "intelligence"
  | "redteam"
  | "builder"
  | "qa"
  | "audit"
  | "monitoring"
  | "alistair"
  | "franklin"
  | "lexington"
  | "chichester"
  | "dorian"
  | "montgomery"
  | "integrity";

type LogStatus = "success" | "failure" | "pending" | "retrying";

interface LogEntry {
  agent: Agent;
  action: string;
  entityId?: string;
  status: LogStatus;
  metadata?: Record<string, unknown>;
  errorMessage?: string;
  retryCount?: number;
  durationMs?: number; // how long the operation took in milliseconds
}

// Action Log columns (append order — do not reorder, existing rows depend on positions):
// 0: log_id (UUID)
// 1: timestamp (ISO 8601)
// 2: agent
// 3: action
// 4: entity_id
// 5: status
// 6: metadata (JSON)
// 7: error_message
// 8: retry_count
// 9: duration_ms
export async function log(entry: LogEntry): Promise<void> {
  const row = [
    randomUUID(),
    new Date().toISOString(),
    entry.agent,
    entry.action,
    entry.entityId ?? "",
    entry.status,
    entry.metadata ? JSON.stringify(entry.metadata) : "",
    entry.errorMessage ?? "",
    entry.retryCount ?? 0,
    entry.durationMs ?? "",
  ];

  try {
    await appendToSheet("Action Log", row);
  } catch (err) {
    // Logger must never crash the calling agent — emit to console as last resort
    console.error("[logger] Failed to write to Action Log sheet:", err);
  }
}

// Convenience: time an async operation and log the result with duration.
export async function logTimed<T>(
  entry: Omit<LogEntry, "status" | "durationMs">,
  fn: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    await log({ ...entry, status: "success", durationMs: Date.now() - start });
    return result;
  } catch (err) {
    await log({
      ...entry,
      status: "failure",
      durationMs: Date.now() - start,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
