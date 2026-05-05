// Builds and sends the 8 AM daily brief to Chester via Telegram.
// Uses HTML parse_mode — more forgiving than Markdown because business names,
// financial figures, and external data can contain Markdown special characters.
// Monday briefs include the Iris intel summary and any Red Team flags.
// All data is read live from Google Sheets each morning.

import { readSheetAsObjects } from "@/lib/google-sheets";
import { sendToChester } from "@/lib/telegram";
import { getFinancialSummary } from "@/agents/franklin/index";
import { getTopMontgomerySignals } from "@/agents/montgomery/index";
import { getAutoResolvedIssues } from "@/lib/self-heal";
import { getAvailableSlots, DAILY_EMAIL_MAX } from "@/lib/capacity";

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

// Escape characters that have special meaning in Telegram HTML mode
function esc(text: string): string {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function sendDailySummary(): Promise<void> {
  const [approvals, leads, clients, metrics, content, intelBriefs, redTeamReports, financialSummary, montgomerySignals, autoResolved, remainingSlots] =
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
      getAutoResolvedIssues(24).catch(() => [] as string[]),
      getAvailableSlots().catch(() => null as number | null),
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

  // Pull MRR from Franklin's financial summary for the brief header
  const mrrMatch = financialSummary?.match(/MRR[:\s]+\$?([\d,]+)/i);
  const mrrDisplay = mrrMatch ? `$${mrrMatch[1]} CAD` : null;

  const callsBookedThisWeek = 0; // Dorian tracks this — placeholder until Sales Intelligence sheet is live

  let brief = `<b>GOOD MORNING CHESTER — 7D BRIEF</b>\n${esc(dateStr)}\n\n`;

  // Today's flow result from Action Log (written by runDailyOutreachFlow at 6 AM)
  const actionLogAll = await readSheetAsObjects("Action Log").catch(() => []);
  const todayFlowEntry = actionLogAll
    .filter(r => r["agent"] === "coordinator" && r["action"] === "daily_flow_completed" && r["timestamp"]?.startsWith(today))
    .slice(-1)[0];
  let flowMeta: Record<string, unknown> = {};
  try { flowMeta = JSON.parse(todayFlowEntry?.["metadata"] ?? "{}") as Record<string, unknown>; } catch { /* ok */ }

  // Capacity — show what the 6 AM flow did and what's left today
  brief += `<b>CAPACITY</b>\n`;
  if (todayFlowEntry) {
    const totalQ = flowMeta["totalQueued"] as number | undefined;
    const uncontacted = flowMeta["uncontactedUsed"] as number | undefined;
    const prospected = flowMeta["prospectsFound"] as number | undefined;
    const shortfall = flowMeta["shortfall"] as number | undefined;
    const followUps = flowMeta["followUpsQueued"] as number | undefined;
    const slots = flowMeta["availableSlots"] as number | undefined;
    brief += `  Capacity today: ${slots ?? "?"} of ${DAILY_EMAIL_MAX} emails\n`;
    if (followUps && followUps > 0) brief += `  Follow-ups queued: ${followUps}\n`;
    if (uncontacted && uncontacted > 0) brief += `  Existing leads used: ${uncontacted}\n`;
    if (prospected && prospected > 0) brief += `  New leads prospected: ${prospected}\n`;
    if (shortfall && shortfall > 0) brief += `  ⚠ Leads not found: ${shortfall} (insufficient results in target area)\n`;
    brief += `  Emails drafted: ${totalQ ?? "?"} | In your dashboard: ${pendingApprovals.length}\n`;
  } else if (remainingSlots !== null) {
    brief += `  Available slots right now: ${remainingSlots} of ${DAILY_EMAIL_MAX}\n`;
    brief += `  In your dashboard: ${pendingApprovals.length}\n`;
  } else {
    brief += `  In your dashboard: ${pendingApprovals.length}\n`;
  }
  brief += "\n";

  // Pipeline
  brief += `<b>PIPELINE</b>\n`;
  brief += `  New leads today: ${todayLeads.length}  |  Weekly call target: ${callsBookedThisWeek} of 3\n\n`;

  // Clients
  brief += `<b>CLIENTS</b>\n`;
  brief += `  Active: ${activeClients.length}`;
  if (mrrDisplay) brief += `  |  MRR: ${esc(mrrDisplay)}`;
  if (onboardingClients.length > 0) {
    const names = onboardingClients.map((c) => esc(c["business_name"] ?? "")).join(", ");
    brief += `\n  Onboarding: ${onboardingClients.length} (${names})`;
  }
  brief += "\n\n";

  // Content
  brief += `<b>CONTENT</b>\n`;
  brief += `  Posted: ${postedContent.length}  |  Pending your approval: ${pendingContent.length}${pendingContent.length > 0 ? " ← approve at /dashboard" : ""}\n\n`;

  // Performance flags
  if (flaggedMetrics.length > 0) {
    brief += `<b>AGENT PERFORMANCE ALERTS</b>\n`;
    for (const f of flaggedMetrics) {
      const value = esc(f["metric_value"] ?? "?");
      const alert = esc(f["alert_threshold"] ?? "?");
      const unit = esc(f["unit"] ?? "");
      brief += `  ⚠ ${esc(f["metric_name"] ?? "")}: ${value}${unit} (below ${alert}${unit} threshold)\n`;
    }
    brief += "\n";
  }

  // Intelligence brief — show on Mondays or when a new brief exists for this week
  if (thisWeekBrief && isToday(1)) {
    brief += `<b>INTELLIGENCE BRIEF — NEW THIS WEEK</b>\n`;
    brief += `  Iris published your weekly market brief — reply "intel brief" for the full report\n`;
    if (thisWeekBrief["rating"]) {
      brief += `  Your rating last week: ${esc(thisWeekBrief["rating"])}/5\n`;
    }
    brief += "\n";
  } else if (thisWeekBrief && !thisWeekBrief["rating"]) {
    brief += `<b>INTELLIGENCE BRIEF</b>\n`;
    brief += `  This week's brief is ready — reply "intel brief" to view it, then rate 1–5 in the sheet\n\n`;
  }

  // Red Team flag — show whenever there's an active high/critical finding this month
  if (redTeamFlag) {
    brief += `<b>RED TEAM ALERT</b>\n`;
    brief += `  ${esc((redTeamFlag["severity"] ?? "").toUpperCase())} severity finding this month — reply "red team report" for details\n\n`;
  }

  // Montgomery Black Swan signals — Mondays only, high/existential only
  if (montgomerySignals) {
    brief += `<b>MONTGOMERY — BLACK SWAN SIGNALS</b>\n`;
    brief += esc(montgomerySignals) + "\n";
    brief += `  Reply "black swan brief" for the full report\n\n`;
  }

  // Financial summary (from Franklin)
  if (financialSummary) {
    brief += `<b>FINANCIALS</b>\n`;
    brief += `  ${esc(financialSummary)}\n\n`;
  }

  // Auto-resolved issues — past tense, no action needed
  if (autoResolved.length > 0) {
    brief += `<b>OVERNIGHT — SELF-RESOLVED</b>\n`;
    for (const item of autoResolved.slice(0, 4)) {
      brief += `  ✓ ${esc(item)}\n`;
    }
    brief += "\n";
  }

  // Pending escalations that need Chester's input (reuse the Action Log already fetched above)
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const pendingEscalations = actionLogAll.filter(
    (r) =>
      r["agent"] === "coordinator" &&
      r["action"] === "escalation_received" &&
      r["status"] === "failure" &&
      r["timestamp"] &&
      new Date(r["timestamp"]) >= last24h
  );

  if (pendingEscalations.length > 0) {
    brief += `<b>NEEDS YOUR ATTENTION</b>\n`;
    for (const e of pendingEscalations.slice(0, 3)) {
      try {
        const meta = JSON.parse(e["metadata"] ?? "{}") as Record<string, unknown>;
        brief += `  ⚠ ${esc(String(meta["fromAgent"] ?? "Agent"))} — ${esc(String(meta["failedAction"] ?? "unknown action"))} failed ${esc(String(meta["attempts"] ?? "multiple"))} times after self-healing\n`;
      } catch {
        brief += `  ⚠ Agent escalation — check Action Log for details\n`;
      }
    }
    brief += "\n";
  }

  // Approvals reminder
  if (pendingApprovals.length > 0) {
    brief += `<b>APPROVALS NEEDED</b> ← open /dashboard to approve\n`;
    brief += `  ${pendingApprovals.length} item${pendingApprovals.length !== 1 ? "s" : ""} awaiting your review\n\n`;
  }

  // Edmund's single recommended focus for Chester today
  brief += `<b>YOUR ONE PRIORITY TODAY</b>\n`;
  if (pendingApprovals.length > 0) {
    brief += `  Approve the ${pendingApprovals.length} outreach email${pendingApprovals.length !== 1 ? "s" : ""} at /dashboard — getting those out today moves the pipeline.`;
  } else if (todayLeads.length === 0) {
    brief += `  Reply "run prospecting" — no leads came in today. Aldous needs the trigger.`;
  } else if (activeClients.length === 0) {
    brief += `  Focus on booking a demo call. That is the only metric that matters right now.`;
  } else {
    brief += `  Check on your active client${activeClients.length !== 1 ? "s" : ""} — a quick check-in keeps approval rates high.`;
  }
  brief += "\n";

  await sendToChester(brief, "HTML");
}
