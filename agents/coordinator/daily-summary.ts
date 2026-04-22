// Builds and sends the 8 AM daily brief to Chester via Telegram.
// Reads live data from all relevant sheets.

import { readSheetAsObjects } from "@/lib/google-sheets";
import { sendToChester } from "@/lib/telegram";

export async function sendDailySummary(): Promise<void> {
  const [approvals, leads, clients, metrics, content] = await Promise.all([
    readSheetAsObjects("Approval Queue"),
    readSheetAsObjects("Daily Leads"),
    readSheetAsObjects("Clients"),
    readSheetAsObjects("Performance Metrics"),
    readSheetAsObjects("Content Queue"),
  ]);

  const today = new Date().toISOString().slice(0, 10);

  const pendingApprovals = approvals.filter((r) => r["status"] === "pending");
  const todayLeads = leads.filter((r) => r["date"] === today);
  const activeClients = clients.filter((r) => r["status"] === "active");
  const onboardingClients = clients.filter((r) => r["status"] === "onboarding");
  const publishedContent = content.filter((r) => r["status"] === "published");
  const scheduledContent = content.filter(
    (r) => r["status"] === "scheduled" && r["scheduled_at"]?.startsWith(today)
  );

  // Find metrics flagged below benchmark
  const flags = metrics.filter((r) => r["flagged"] === "TRUE" || r["flagged"] === "true");

  const dateStr = new Date().toLocaleDateString("en-CA", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "America/Toronto",
  });

  let brief = `*GOOD MORNING CHESTER — 7D BRIEF*\n${dateStr}\n\n`;

  brief += `*PIPELINE*\n`;
  brief += `  New leads today: ${todayLeads.length}\n`;
  brief += `  Pending your approval: ${pendingApprovals.length}${pendingApprovals.length > 0 ? " ← emails sent" : ""}\n\n`;

  brief += `*CLIENTS*\n`;
  brief += `  Active: ${activeClients.length}`;
  if (onboardingClients.length > 0) {
    const names = onboardingClients.map((c) => c["business_name"]).join(", ");
    brief += `  |  Onboarding: ${onboardingClients.length} (${names})`;
  }
  brief += "\n\n";

  brief += `*CONTENT*\n`;
  brief += `  Published: ${publishedContent.length}  |  Scheduled today: ${scheduledContent.length}\n\n`;

  if (flags.length > 0) {
    brief += `*AGENT PERFORMANCE ALERTS*\n`;
    for (const f of flags) {
      brief += `  ⚠ ${f["metric_name"]}: ${f["metric_value"]}${f["benchmark"] ? ` (below ${f["benchmark"]} benchmark)` : ""}\n`;
    }
    brief += "\n";
  }

  if (pendingApprovals.length > 0) {
    brief += `*APPROVALS NEEDED* ← emails already sent to you\n`;
    brief += `  ${pendingApprovals.length} item${pendingApprovals.length > 1 ? "s" : ""} awaiting your approval\n`;
  }

  await sendToChester(brief);
}
