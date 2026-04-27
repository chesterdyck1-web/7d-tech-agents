// Alistair — Maintenance Agent.
// Runs hourly health checks on every integration and Make scenario.
// Auto-fixes known issues (reactivating a dead Make scenario).
// Alerts Chester for anything it cannot fix autonomously.

import { readSheetAsObjects } from "@/lib/google-sheets";
import { getScenario, activateScenario, listScenarios } from "@/lib/make";
import { sendToChester } from "@/lib/telegram";
import { log } from "@/lib/logger";

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

// ─── Main runner ──────────────────────────────────────────────────────────────

export async function runMaintenanceCheck(): Promise<void> {
  const [sheetsIssue, makeIssue, claudeIssue, failureIssue, scenarioIssues] =
    await Promise.all([
      checkSheets().catch((e): HealthIssue => ({ area: "Sheets check", description: String(e), fixed: false })),
      checkMakeConnection().catch((e): HealthIssue => ({ area: "Make check", description: String(e), fixed: false })),
      checkClaude().catch((e): HealthIssue => ({ area: "Claude check", description: String(e), fixed: false })),
      checkRecentFailures().catch(() => null),
      checkClientScenarios().catch(() => [] as HealthIssue[]),
    ]);

  const allIssues: HealthIssue[] = [
    sheetsIssue,
    makeIssue,
    claudeIssue,
    failureIssue,
    ...scenarioIssues,
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

  // Only alert Chester if there are unfixed issues
  const unfixed = allIssues.filter((i) => !i.fixed);
  const fixed = allIssues.filter((i) => i.fixed);

  if (unfixed.length === 0 && fixed.length === 0) return; // All clear — silent

  let message = "";

  if (fixed.length > 0) {
    const fixLines = fixed.map((i) => `✓ Fixed — ${i.area}: ${i.fixNote}`).join("\n");
    message += `*ALISTAIR — AUTO-FIXED*\n${fixLines}\n\n`;
  }

  if (unfixed.length > 0) {
    const issueLines = unfixed.map((i) => `⚠ ${i.area}: ${i.description}`).join("\n");
    message += `*ALISTAIR — ACTION REQUIRED*\n${issueLines}`;
    await sendToChester(message.trim());
  } else if (fixed.length > 0) {
    await sendToChester(message.trim());
  }
}
