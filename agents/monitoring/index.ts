// Monitoring Agent — watches the Action Log for failure spikes and alerts Chester immediately.
// Runs every 6 hours. A "spike" = same agent:action fails 3+ times in the last 6 hours.
// Uses the Action Log to track when it last alerted, preventing duplicate notifications.

import { readSheetAsObjects } from "@/lib/google-sheets";
import { sendToChester } from "@/lib/telegram";
import { log } from "@/lib/logger";

const WINDOW_HOURS = 6;
const FAILURE_THRESHOLD = 3;

function isInLastNHours(dateStr: string, hours: number): boolean {
  if (!dateStr) return false;
  return new Date(dateStr) >= new Date(Date.now() - hours * 60 * 60 * 1000);
}

export async function runFailureCheck(): Promise<void> {
  const actionLog = await readSheetAsObjects("Action Log");

  // Entries from the monitoring window
  const recent = actionLog.filter((r) => isInLastNHours(r["timestamp"] ?? "", WINDOW_HOURS));

  // Track which agent:action combos we already alerted on this window
  const alreadyAlerted = new Set(
    actionLog
      .filter(
        (r) =>
          r["agent"] === "monitoring" &&
          r["action"] === "failure_alert_sent" &&
          isInLastNHours(r["timestamp"] ?? "", WINDOW_HOURS)
      )
      .map((r) => r["entity_id"] ?? "")
  );

  // Group failures by agent:action
  const failureCounts = new Map<string, number>();
  for (const row of recent) {
    if (row["status"] !== "failure") continue;
    const key = `${row["agent"] ?? "unknown"}:${row["action"] ?? "unknown"}`;
    failureCounts.set(key, (failureCounts.get(key) ?? 0) + 1);
  }

  const spikes: string[] = [];

  for (const [key, count] of failureCounts) {
    if (count < FAILURE_THRESHOLD) continue;
    if (alreadyAlerted.has(key)) continue;

    spikes.push(`• ${key}: ${count} failures in the last ${WINDOW_HOURS}h`);

    await log({
      agent: "monitoring",
      action: "failure_alert_sent",
      entityId: key,
      status: "success",
      metadata: { failureCount: count } as unknown as Record<string, unknown>,
    });
  }

  if (spikes.length === 0) return;

  await sendToChester(
    `*SYSTEM ALERT — FAILURE SPIKE DETECTED*\n\n${spikes.join("\n")}\n\nCheck the Action Log sheet for error details.`
  );
}
