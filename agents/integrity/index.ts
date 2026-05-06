// Data Integrity Agent — runs at 5 AM ET daily before prospecting starts.
// Checks cross-sheet consistency and alerts Chester if anything is off.
// Does NOT block prospecting — flags issues and moves on.

import { readSheetAsObjects } from "@/lib/google-sheets";
import { sendToChester } from "@/lib/telegram";
import { log } from "@/lib/logger";

export interface IntegrityReport {
  passed: boolean;
  issues: string[];
  checked: string[];
}

export async function runIntegrityCheck(): Promise<IntegrityReport> {
  const issues: string[] = [];
  const checked: string[] = [];
  const start = Date.now();

  try {
    const [dailyLeads, masterLeads, approvalQueue, clients, actionLog] =
      await Promise.all([
        readSheetAsObjects("Daily Leads").catch(() => [] as Record<string, string>[]),
        readSheetAsObjects("Master Leads").catch(() => [] as Record<string, string>[]),
        readSheetAsObjects("Approval Queue").catch(() => [] as Record<string, string>[]),
        readSheetAsObjects("Clients").catch(() => [] as Record<string, string>[]),
        readSheetAsObjects("Action Log").catch(() => [] as Record<string, string>[]),
      ]);

    // Check 1: Every Daily Leads entry has a business_id
    checked.push("daily_leads_have_ids");
    const missingIds = dailyLeads.filter((r) => !r["business_id"] && !r["google_place_id"]);
    if (missingIds.length > 0) {
      issues.push(`Daily Leads: ${missingIds.length} row(s) missing business_id`);
    }

    // Check 2: Every Approval Queue entry has a to_email
    checked.push("approval_queue_has_emails");
    const pendingNoEmail = approvalQueue.filter(
      (r) => r["status"] === "pending" && !r["to_email"]
    );
    if (pendingNoEmail.length > 0) {
      issues.push(
        `Approval Queue: ${pendingNoEmail.length} pending item(s) missing to_email`
      );
    }

    // Check 3: No Approval Queue entry has been pending for more than 48 hours
    checked.push("no_stale_approvals");
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const staleApprovals = approvalQueue.filter(
      (r) => r["status"] === "pending" && r["created_at"] && r["created_at"] < cutoff
    );
    if (staleApprovals.length > 0) {
      issues.push(
        `Approval Queue: ${staleApprovals.length} item(s) pending for >48 hours (possible stuck approvals)`
      );
    }

    // Check 4: Active clients all have a Stripe payment record
    checked.push("clients_have_payment_status");
    const activeClients = clients.filter((c) => c["status"] === "active");
    const noPayment = activeClients.filter(
      (c) => !c["stripe_payment_status"] && !c["stripe_payment_link"]
    );
    if (noPayment.length > 0) {
      issues.push(
        `Clients: ${noPayment.length} active client(s) missing Stripe payment record: ${noPayment
          .map((c) => c["business_name"] ?? "unknown")
          .join(", ")}`
      );
    }

    // Check 5: Action Log entries have required fields
    checked.push("action_log_schema");
    const today = new Date().toISOString().slice(0, 10);
    const todayLogs = actionLog.filter((r) => (r["timestamp"] ?? "").startsWith(today));
    const malformed = todayLogs.filter(
      (r) => !r["timestamp"] || !r["agent"] || !r["action"] || !r["status"]
    );
    if (malformed.length > 0) {
      issues.push(`Action Log: ${malformed.length} today's entries missing required fields`);
    }

    // Check 6: Master Leads has no obvious corruption (empty business names in recent rows)
    checked.push("master_leads_integrity");
    const recentLeads = masterLeads.slice(-50); // check last 50 rows
    const emptyNames = recentLeads.filter((r) => !r["business_name"]);
    if (emptyNames.length > 5) {
      // allow a few blanks but flag if more than 5 in recent batch
      issues.push(`Master Leads: ${emptyNames.length} of last 50 rows have empty business_name`);
    }

    const passed = issues.length === 0;
    const durationMs = Date.now() - start;

    await log({
      agent: "integrity",
      action: "integrity_check_completed",
      status: passed ? "success" : "failure",
      durationMs,
      metadata: { checked: checked.length, issues: issues.length } as unknown as Record<string, unknown>,
      errorMessage: issues.length > 0 ? issues.join(" | ") : undefined,
    });

    if (!passed) {
      const lines = [
        `<b>INTEGRITY CHECK — ${issues.length} ISSUE${issues.length !== 1 ? "S" : ""} FOUND</b>`,
        ...issues.map((i) => `  ⚠ ${i}`),
        `\nCheck the sheets and fix before the 6 AM prospecting run.`,
      ];
      await sendToChester(lines.join("\n"), "HTML").catch(() => null);
    }

    return { passed, issues, checked };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await log({
      agent: "integrity",
      action: "integrity_check_failed",
      status: "failure",
      errorMessage,
      durationMs: Date.now() - start,
    });
    return { passed: false, issues: [`Integrity check itself failed: ${errorMessage}`], checked };
  }
}
