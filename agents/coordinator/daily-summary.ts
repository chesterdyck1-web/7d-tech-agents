// Builds and sends the 8 AM daily brief to Chester via Telegram.
// Monday briefs include the Iris intel summary and any Red Team flags.
// All data is read live from Google Sheets each morning.

import { readSheetAsObjects } from "@/lib/google-sheets";
import { sendToChester } from "@/lib/telegram";
import { getFinancialSummary } from "@/agents/franklin/index";
import { getTopMontgomerySignals } from "@/agents/montgomery/index";

function getMondayISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

function isToday(dayOfWeek: number): boolean {
  // 0=Sun, 1=Mon, ..., 6=Sat
  return new Date().getDay() === dayOfWeek;
}

function getCurrentMonthISO(): string {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

export async function sendDailySummary(): Promise<void> {
  const [approvals, leads, clients, metrics, content, intelBriefs, redTeamReports, financialSummary, montgomerySignals] =
    await Promise.all([
      readSheetAsObjects("Approval Queue"),
      readSheetAsObjects("Daily Leads"),
      readSheetAsObjects("Clients"),
      readSheetAsObjects("Performance Metrics"),
      readSheetAsObjects("Content Queue"),
      readSheetAsObjects("Intelligence Briefs").catch(() => []),
      readSheetAsObjects("Red Team Reports").catch(() => []),
      getFinancialSummary().catch(() => null),
      isToday(1) ? getTopMontgomerySignals().catch(() => null) : Promise.resolve(null),
    ]);

  const today = new Date().toISOString().slice(0, 10);
  const thisMonday = getMondayISO();
  const thisMonth = getCurrentMonthISO();

  const pendingApprovals = approvals.filter((r) => r["status"] === "pending");
  const pendingContent = content.filter((r) => r["status"] === "pending_approval");
  const postedContent = content.filter((r) => r["status"] === "posted");
  const todayLeads = leads.filter((r) => r["date"] === today);
  const activeClients = clients.filter((r) => r["status"] === "active");
  const onboardingClients = clients.filter((r) => r["status"] === "onboarding");

  // Performance: most recent row per metric key that is flagged
  const latestByKey = new Map<string, Record<string, string>>();
  for (const row of metrics) {
    if (row["metric_key"]) latestByKey.set(row["metric_key"], row);
  }
  const flaggedMetrics = [...latestByKey.values()].filter(
    (r) => r["flagged"] === "TRUE" || r["flagged"] === "true"
  );

  // Intel: this week's brief (only on Mondays, or if brief is from this week)
  const thisWeekBrief = intelBriefs.find((r) => r["week_start"] === thisMonday);

  // Red Team: most recent report this month with severity high or critical
  const thisMonthReport = redTeamReports
    .filter((r) => r["month"] === thisMonth)
    .slice(-1)[0];
  const redTeamFlag =
    thisMonthReport &&
    (thisMonthReport["severity"] === "high" || thisMonthReport["severity"] === "critical")
      ? thisMonthReport
      : null;

  const dateStr = new Date().toLocaleDateString("en-CA", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "America/Toronto",
  });

  let brief = `*GOOD MORNING CHESTER — 7D BRIEF*\n${dateStr}\n\n`;

  // Pipeline
  brief += `*PIPELINE*\n`;
  brief += `  New leads today: ${todayLeads.length}\n`;
  brief += `  Pending your approval: ${pendingApprovals.length}${pendingApprovals.length > 0 ? " ← approve at /dashboard" : ""}\n\n`;

  // Clients
  brief += `*CLIENTS*\n`;
  brief += `  Active: ${activeClients.length}`;
  if (onboardingClients.length > 0) {
    const names = onboardingClients.map((c) => c["business_name"]).join(", ");
    brief += `  |  Onboarding: ${onboardingClients.length} (${names})`;
  }
  brief += "\n\n";

  // Content
  brief += `*CONTENT*\n`;
  brief += `  Posted: ${postedContent.length}  |  Pending your approval: ${pendingContent.length}${pendingContent.length > 0 ? " ← approve at /dashboard" : ""}\n\n`;

  // Performance flags
  if (flaggedMetrics.length > 0) {
    brief += `*AGENT PERFORMANCE ALERTS*\n`;
    for (const f of flaggedMetrics) {
      const value = f["metric_value"] ?? "?";
      const alert = f["alert_threshold"] ?? "?";
      const unit = f["unit"] ?? "";
      brief += `  ⚠ ${f["metric_name"]}: ${value}${unit} (below ${alert}${unit} threshold)\n`;
    }
    brief += "\n";
  }

  // Intelligence brief — show on Mondays or when a new brief exists for this week
  if (thisWeekBrief && isToday(1)) {
    brief += `*INTELLIGENCE BRIEF — NEW THIS WEEK*\n`;
    brief += `  Iris published your weekly market brief — reply "intel brief" for the full report\n`;
    if (thisWeekBrief["rating"]) {
      brief += `  Your rating last week: ${thisWeekBrief["rating"]}/5\n`;
    }
    brief += "\n";
  } else if (thisWeekBrief && !thisWeekBrief["rating"]) {
    // Brief exists but Chester hasn't rated it yet — nudge
    brief += `*INTELLIGENCE BRIEF*\n`;
    brief += `  This week's brief is ready — reply "intel brief" to view it, then rate 1–5 in the sheet\n\n`;
  }

  // Red Team flag — show whenever there's an active high/critical finding this month
  if (redTeamFlag) {
    brief += `*RED TEAM ALERT*\n`;
    brief += `  ${redTeamFlag["severity"]!.toUpperCase()} severity finding this month — reply "red team report" for details\n\n`;
  }

  // Montgomery Black Swan signals — Mondays only, high/existential only
  if (montgomerySignals) {
    brief += `*MONTGOMERY — BLACK SWAN SIGNALS*\n`;
    brief += montgomerySignals + "\n";
    brief += `  Reply "black swan brief" for the full report\n\n`;
  }

  // Financial summary (from Franklin)
  if (financialSummary) {
    brief += `*FINANCIALS*\n`;
    brief += `  ${financialSummary}\n\n`;
  }

  // Approvals reminder at the bottom
  if (pendingApprovals.length > 0) {
    brief += `*APPROVALS NEEDED* ← open /dashboard to approve\n`;
    brief += `  ${pendingApprovals.length} item${pendingApprovals.length !== 1 ? "s" : ""} awaiting your review\n`;
  }

  await sendToChester(brief);
}
