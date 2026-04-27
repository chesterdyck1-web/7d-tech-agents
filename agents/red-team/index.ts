// Red Team Agent (Red) — monthly audit of agent health and outreach scripts.
// Runs the first Monday of each month. The cron fires every Monday but skips
// if it is not the first Monday (checked inside the handler).
// Writes findings to Red Team Reports sheet and delivers to Chester via Telegram.

import { appendToSheet, readSheetAsObjects } from "@/lib/google-sheets";
import { sendToChester } from "@/lib/telegram";
import { log } from "@/lib/logger";
import { auditActionLog, type Severity } from "./log-auditor";
import { evaluateScripts } from "./script-evaluator";
import { randomUUID } from "crypto";

// Returns true only on the first Monday of the month
export function isFirstMondayOfMonth(): boolean {
  const today = new Date();
  // Monday = 1 in getDay()
  return today.getDay() === 1 && today.getDate() <= 7;
}

const SEVERITY_RANK: Record<Severity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

function maxSeverity(a: Severity, b: Severity): Severity {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

export async function runRedTeamAudit(): Promise<void> {
  const reportId = randomUUID();
  const month = new Date().toISOString().slice(0, 7); // YYYY-MM

  await sendToChester("Running monthly Red Team audit — reviewing agent logs and outreach scripts.");

  // Run both audits in parallel
  const [logResult, scriptResult] = await Promise.all([
    auditActionLog().catch((err) => ({
      findings: [],
      summary: `Log audit failed: ${String(err)}`,
    })),
    evaluateScripts().catch((err) => ({
      issues: [],
      summary: `Script evaluation failed: ${String(err)}`,
    })),
  ]);

  // Determine overall severity
  let overallSeverity: Severity = "low";
  for (const f of logResult.findings) {
    overallSeverity = maxSeverity(overallSeverity, f.severity);
  }
  for (const issue of scriptResult.issues) {
    overallSeverity = maxSeverity(overallSeverity, issue.severity);
  }

  const severityEmoji = {
    low: "✓",
    medium: "⚠",
    high: "⚠⚠",
    critical: "🚨",
  }[overallSeverity];

  const dateStr = new Date().toLocaleDateString("en-CA", {
    year: "numeric",
    month: "long",
    timeZone: "America/Toronto",
  });

  const fullReport = [
    `*RED TEAM REPORT — ${dateStr}* ${severityEmoji}`,
    `Overall severity: ${overallSeverity.toUpperCase()}`,
    "",
    `*ACTION LOG AUDIT*`,
    logResult.summary,
    "",
    `*SCRIPT EVALUATION*`,
    scriptResult.summary,
  ].join("\n");

  // Write to Red Team Reports sheet
  // Columns: report_id | month | log_anomalies | script_issues | severity | full_report | created_at
  await appendToSheet("Red Team Reports", [
    reportId,
    month,
    logResult.summary,
    scriptResult.summary,
    overallSeverity,
    fullReport,
    new Date().toISOString(),
  ]);

  await log({
    agent: "redteam",
    action: "monthly_audit_complete",
    entityId: reportId,
    status: "success",
    metadata: { month, overallSeverity } as unknown as Record<string, unknown>,
  });

  await sendToChester(fullReport);
}

// Returns the latest Red Team report — used by Coordinator to answer "red team report" queries.
export async function getLatestRedTeamReport(): Promise<string> {
  const rows = await readSheetAsObjects("Red Team Reports");
  if (rows.length === 0) return "No Red Team reports have been generated yet.";

  const latest = rows[rows.length - 1]!;
  return latest["full_report"] ?? "Report content unavailable.";
}
