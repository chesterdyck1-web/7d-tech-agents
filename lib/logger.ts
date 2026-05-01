// Writes every agent action to the Action Log sheet (immutable audit trail).
// Call log() after every significant action — success, failure, or pending.

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
  | "montgomery";

type LogStatus = "success" | "failure" | "pending";

interface LogEntry {
  agent: Agent;
  action: string;
  entityId?: string;
  status: LogStatus;
  metadata?: Record<string, unknown>;
  errorMessage?: string;
  // How many times this action was retried before this log entry was written.
  // 0 or undefined = first attempt. Gives Chester visibility into self-healing effort.
  retryCount?: number;
}

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
  ];

  try {
    await appendToSheet("Action Log", row);
  } catch (err) {
    // Logger must never crash the calling agent — emit to console as last resort
    console.error("[logger] Failed to write to Action Log sheet:", err);
  }
}
