// Scans the Action Log for the last 30 days looking for failure patterns,
// high error rates, and anomalies that could indicate bugs or operational risk.

import { readSheetAsObjects } from "@/lib/google-sheets";
import { claude } from "@/lib/claude";

export type Severity = "low" | "medium" | "high" | "critical";

export interface AuditFinding {
  severity: Severity;
  description: string;
}

function isInLast30Days(dateStr: string): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  return d >= cutoff && d <= new Date();
}

export async function auditActionLog(): Promise<{ findings: AuditFinding[]; summary: string }> {
  const rows = await readSheetAsObjects("Action Log");
  const recent = rows.filter((r) => isInLast30Days(r["timestamp"] ?? ""));

  if (recent.length === 0) {
    return { findings: [], summary: "No action log entries in the last 30 days." };
  }

  // Group by agent:action and count outcomes
  const groups = new Map<string, { success: number; failure: number; errors: string[] }>();
  for (const row of recent) {
    const key = `${row["agent"] ?? "unknown"}:${row["action"] ?? "unknown"}`;
    const g = groups.get(key) ?? { success: 0, failure: 0, errors: [] };
    if (row["status"] === "success") {
      g.success++;
    } else if (row["status"] === "failure") {
      g.failure++;
      const errMsg = row["error_message"] ?? row["errorMessage"] ?? "";
      if (errMsg) g.errors.push(errMsg.slice(0, 100));
    }
    groups.set(key, g);
  }

  const findings: AuditFinding[] = [];
  const statLines: string[] = [];

  for (const [key, stats] of groups) {
    const total = stats.success + stats.failure;
    if (total === 0) continue;
    const failureRate = stats.failure / total;

    statLines.push(
      `${key}: ${stats.success} success, ${stats.failure} failure${stats.errors.length > 0 ? ` (sample error: "${stats.errors[0]}")` : ""}`
    );

    if (failureRate >= 0.5 && stats.failure >= 3) {
      findings.push({
        severity: failureRate >= 0.8 ? "critical" : "high",
        description: `${key}: ${Math.round(failureRate * 100)}% failure rate (${stats.failure} of ${total} attempts)`,
      });
    } else if (failureRate >= 0.25 && stats.failure >= 2) {
      findings.push({
        severity: "medium",
        description: `${key}: ${Math.round(failureRate * 100)}% failure rate (${stats.failure} of ${total} attempts)`,
      });
    }
  }

  // Claude looks for non-obvious patterns beyond raw failure rates
  const logText = statLines.slice(0, 30).join("\n");
  const patternRes = await claude({
    system:
      "You are a security auditor reviewing an AI agent system's operational log. Identify anomalies beyond simple failure rates — e.g. suspicious timing patterns, repeated identical errors, unexpected action sequences, or signs of data corruption. Be brief and specific.",
    userMessage: `30-day action log summary (agent:action — success/failure counts):
${logText}

Existing findings: ${findings.length > 0 ? findings.map((f) => f.description).join("; ") : "None"}

List up to 3 additional anomalies worth investigating, or reply "No anomalies detected."`,
    maxTokens: 200,
    label: "red-team:audit-log",
  });

  const patternNote = patternRes.text.trim();

  const headerLine =
    findings.length > 0
      ? `${findings.length} issue${findings.length !== 1 ? "s" : ""} flagged:\n${findings.map((f) => `• [${f.severity.toUpperCase()}] ${f.description}`).join("\n")}`
      : "No high failure rates detected.";

  return {
    findings,
    summary: `${headerLine}\n\nPattern analysis: ${patternNote}`,
  };
}
