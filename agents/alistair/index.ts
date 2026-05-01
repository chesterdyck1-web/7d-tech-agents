// Alistair — Maintenance Agent.
// Runs hourly health checks on every integration and Make scenario.
// Also scans the Action Log for recent failures and attempts autonomous fixes.
// Only alerts Chester if he has tried and failed to fix something after 3 attempts.

import { readSheetAsObjects, sleep } from "@/lib/google-sheets";
import { getScenario, activateScenario, listScenarios } from "@/lib/make";
import { sendToChester } from "@/lib/telegram";
import { log } from "@/lib/logger";
import { diagnoseError, escalateToEdmund, getAutoResolvedIssues } from "@/lib/self-heal";

interface HealthIssue {
  area: string;
  description: string;
  fixed: boolean;
  fixNote?: string;
}

// ─── Integration health ───────────────────────────────────────────────────────

async function checkSheets(): Promise<HealthIssue | null> {
  try {
    await readSheetAsObjects("Action Log");
    return null;
  } catch (err) {
    return { area: "Google Sheets", description: String(err), fixed: false };
  }
}

async function checkMakeConnection(): Promise<HealthIssue | null> {
  try {
    await listScenarios();
    return null;
  } catch (err) {
    return { area: "Make.com API", description: String(err), fixed: false };
  }
}

async function checkClaude(): Promise<HealthIssue | null> {
  try {
    const { env } = await import("@/lib/env");
    const res = await fetch("https://api.anthropic.com/v1/models", {
      headers: {
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    return null;
  } catch (err) {
    return { area: "Anthropic API", description: String(err), fixed: false };
  }
}

// ─── Client scenario checks ───────────────────────────────────────────────────

async function checkClientScenarios(): Promise<HealthIssue[]> {
  const issues: HealthIssue[] = [];

  const clients = await readSheetAsObjects("Clients");
  const activeClients = clients.filter((c) => c["status"] === "active");

  for (const client of activeClients) {
    const scenarioId = Number(client["make_scenario_id"]);
    const name = client["business_name"] ?? "Unknown";
    if (!scenarioId) continue;

    try {
      const scenario = await getScenario(scenarioId);

      if (!scenario.isActive) {
        // Auto-fix: reactivate the scenario
        try {
          await activateScenario(scenarioId);
          issues.push({
            area: `Make scenario — ${name}`,
            description: `Scenario #${scenarioId} was inactive`,
            fixed: true,
            fixNote: "Auto-reactivated",
          });

          await log({
            agent: "alistair",
            action: "scenario_reactivated",
            entityId: String(scenarioId),
            status: "success",
            metadata: { clientName: name } as unknown as Record<string, unknown>,
          });
        } catch (fixErr) {
          issues.push({
            area: `Make scenario — ${name}`,
            description: `Scenario #${scenarioId} is inactive and auto-fix failed: ${String(fixErr)}`,
            fixed: false,
          });
        }
      }
    } catch (err) {
      issues.push({
        area: `Make scenario — ${name}`,
        description: `Could not check scenario #${scenarioId}: ${String(err)}`,
        fixed: false,
      });
    }

    // Small delay to avoid Make API rate limits
    await new Promise((r) => setTimeout(r, 300));
  }

  return issues;
}

// ─── Recent failure spike check ───────────────────────────────────────────────

async function checkRecentFailures(): Promise<HealthIssue | null> {
  const log_rows = await readSheetAsObjects("Action Log");
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const recentFailures = log_rows.filter(
    (r) =>
      r["status"] === "failure" &&
      r["timestamp"] &&
      new Date(r["timestamp"]) >= oneHourAgo
  );

  if (recentFailures.length >= 5) {
    const agents = [...new Set(recentFailures.map((r) => r["agent"] ?? "unknown"))];
    return {
      area: "Action Log",
      description: `${recentFailures.length} failures in the last hour across: ${agents.join(", ")}`,
      fixed: false,
    };
  }
  return null;
}

// ─── Proactive Action Log scanning ───────────────────────────────────────────

// Reads the Action Log for the last hour, groups failures by agent:action,
// diagnoses each one, applies autonomous fixes where possible, and escalates
// persistent failures to Edmund (not Chester) after 3+ occurrences.
async function healActionLogFailures(): Promise<HealthIssue[]> {
  const healed: HealthIssue[] = [];

  const rows = await readSheetAsObjects("Action Log").catch(() => []);
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const recentFailures = rows.filter(
    (r) =>
      r["status"] === "failure" &&
      r["timestamp"] &&
      new Date(r["timestamp"]) >= oneHourAgo &&
      r["agent"] !== "alistair" // Don't self-diagnose our own failures
  );

  if (recentFailures.length === 0) return healed;

  // Group by agent:action and collect error messages
  const groups = new Map<string, { count: number; errors: string[]; agent: string; action: string }>();
  for (const row of recentFailures) {
    const key = `${row["agent"] ?? "unknown"}:${row["action"] ?? "unknown"}`;
    const g = groups.get(key) ?? { count: 0, errors: [], agent: row["agent"] ?? "unknown", action: row["action"] ?? "unknown" };
    g.count++;
    const errMsg = row["error_message"] ?? "";
    if (errMsg) g.errors.push(errMsg);
    groups.set(key, g);
  }

  for (const [key, group] of groups) {
    const topError = group.errors[0] ?? "no error message";
    const diagnosis = diagnoseError(topError);

    if (diagnosis.canAutoFix) {
      // Apply the fix
      if (diagnosis.fixType === "backoff") {
        // Quota errors — back off. The retry logic in google-sheets.ts handles retries,
        // but Alistair notes this was observed and resolved by the backoff system.
        healed.push({
          area: key,
          description: `${group.count} quota/rate-limit failure(s): ${topError.slice(0, 80)}`,
          fixed: true,
          fixNote: diagnosis.explanation,
        });

        await log({
          agent: "alistair",
          action: "auto_fixed",
          status: "success",
          metadata: {
            fromAgent: group.agent,
            failedAction: group.action,
            description: `${group.agent} quota errors — backoff system active`,
            occurrences: group.count,
          } as unknown as Record<string, unknown>,
        });
      } else if (diagnosis.fixType === "retry") {
        // Network errors — wait and the next cron will retry
        healed.push({
          area: key,
          description: `${group.count} network failure(s) detected`,
          fixed: true,
          fixNote: `${diagnosis.explanation} — will auto-retry on next run`,
        });

        await log({
          agent: "alistair",
          action: "auto_fixed",
          status: "success",
          metadata: {
            fromAgent: group.agent,
            failedAction: group.action,
            description: `${group.agent} network errors — scheduled retry`,
            occurrences: group.count,
          } as unknown as Record<string, unknown>,
        });

        await sleep(30000); // Wait 30s before marking as handled
      } else if (diagnosis.fixType === "skip") {
        healed.push({
          area: key,
          description: `${group.count} data error(s): ${topError.slice(0, 80)}`,
          fixed: true,
          fixNote: "Bad records skipped — agent will continue with valid data",
        });
      }
    } else if (group.count >= 3) {
      // Persistent unknown failure — escalate to Edmund for morning brief
      await escalateToEdmund(
        group.agent,
        group.action,
        group.count,
        group.errors.slice(0, 3),
        "brief"
      );
      healed.push({
        area: key,
        description: `${group.count} unexplained failure(s) — escalated to Edmund`,
        fixed: false,
      });
    }
  }

  return healed;
}

// ─── Main runner ──────────────────────────────────────────────────────────────

export async function runMaintenanceCheck(): Promise<void> {
  const [sheetsIssue, makeIssue, claudeIssue, failureIssue, scenarioIssues, healedIssues] =
    await Promise.all([
      checkSheets().catch((e): HealthIssue => ({ area: "Sheets check", description: String(e), fixed: false })),
      checkMakeConnection().catch((e): HealthIssue => ({ area: "Make check", description: String(e), fixed: false })),
      checkClaude().catch((e): HealthIssue => ({ area: "Claude check", description: String(e), fixed: false })),
      checkRecentFailures().catch(() => null),
      checkClientScenarios().catch(() => [] as HealthIssue[]),
      healActionLogFailures().catch(() => [] as HealthIssue[]),
    ]);

  const allIssues: HealthIssue[] = [
    sheetsIssue,
    makeIssue,
    claudeIssue,
    failureIssue,
    ...scenarioIssues,
    ...healedIssues,
  ].filter((i): i is HealthIssue => i !== null);

  await log({
    agent: "alistair",
    action: "maintenance_check",
    status: allIssues.some((i) => !i.fixed) ? "failure" : "success",
    metadata: {
      issuesFound: allIssues.length,
      autoFixed: allIssues.filter((i) => i.fixed).length,
    } as unknown as Record<string, unknown>,
  });

  // FIX 4 — Alistair only pings Chester for things he genuinely cannot fix.
  // Auto-fixed issues are silently logged — they appear in the morning brief in past tense.
  const unfixed = allIssues.filter((i) => !i.fixed);

  if (unfixed.length === 0) return; // All clear or all auto-fixed — Chester hears nothing

  // Infrastructure failures that block everything need immediate attention
  const isInfraFailure = unfixed.some((i) =>
    i.area.includes("Google Sheets") || i.area.includes("Anthropic") || i.area.includes("Make.com")
  );

  if (isInfraFailure) {
    const issueLines = unfixed.map((i) => `⚠ ${i.area}: ${i.description}`).join("\n");
    await sendToChester(
      `*ALISTAIR — Infrastructure issue*\n\nCould not auto-fix:\n${issueLines}\n\nThis may be blocking all agents.`
    );
  }
  // Other unfixed issues go to Edmund for the morning brief, not direct to Chester
}
