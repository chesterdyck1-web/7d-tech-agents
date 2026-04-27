// Monitors weekly close rate and triggers price-change recommendations or script alerts.
// Close rate = new clients signed / outreach emails approved (sent) in the same week.
// Above 50% for 2 weeks: recommend price increase to Chester for approval.
// Below 30% for 2 weeks: flag to Dorian and outreach for script diagnosis.

import { readSheetAsObjects, appendToSheet } from "@/lib/google-sheets";
import { sendToChester } from "@/lib/telegram";
import { log } from "@/lib/logger";

function isInLastNDays(dateStr: string, days: number): boolean {
  if (!dateStr) return false;
  return new Date(dateStr) >= new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export interface CloseRateSnapshot {
  weekStart: string;
  outreachSent: number;
  newClients: number;
  closeRatePct: number;
}

export async function computeCloseRate(): Promise<CloseRateSnapshot> {
  const weekStart = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  })();

  const [queue, clients] = await Promise.all([
    readSheetAsObjects("Approval Queue"),
    readSheetAsObjects("Clients"),
  ]);

  const outreachSent = queue.filter(
    (r) =>
      r["type"] === "outreach_email" &&
      r["status"] === "approved" &&
      isInLastNDays(r["decided_at"] ?? "", 7)
  ).length;

  const newClients = clients.filter(
    (c) =>
      (c["status"] === "active" || c["status"] === "onboarding") &&
      isInLastNDays(c["created_at"] ?? "", 7)
  ).length;

  const closeRatePct =
    outreachSent > 0 ? Math.round((newClients / outreachSent) * 100) : 0;

  return { weekStart, outreachSent, newClients, closeRatePct };
}

// Check close rate history and fire recommendations if thresholds are met.
export async function evaluateCloseRateTrend(currentRate: CloseRateSnapshot): Promise<string> {
  const financialMetrics = await readSheetAsObjects("Financial Metrics");

  // Get last 2 weeks of close rate data
  const history = financialMetrics
    .filter((r) => r["close_rate_weekly"] && r["close_rate_weekly"] !== "")
    .slice(-2)
    .map((r) => Number(r["close_rate_weekly"]));

  const allAbove50 =
    history.length >= 2 && history.every((r) => r > 50) && currentRate.closeRatePct > 50;

  const allBelow30 =
    history.length >= 2 && history.every((r) => r < 30) && currentRate.closeRatePct < 30;

  if (allAbove50) {
    const message = `*FRANKLIN — PRICE INCREASE RECOMMENDED*\n\nClose rate has been above 50% for 3 consecutive weeks (${history[0]}%, ${history[1]}%, ${currentRate.closeRatePct}%).\n\nRecommendation: increase monthly price from $50 to $60 CAD and annual from $480 to $576 CAD.\n\nReply "approve price increase" to confirm — this will not happen automatically.`;
    await sendToChester(message);
    await log({
      agent: "franklin",
      action: "price_increase_recommended",
      status: "success",
      metadata: { closeRates: [...history, currentRate.closeRatePct] } as unknown as Record<string, unknown>,
    });
    return "price_increase_recommended";
  }

  if (allBelow30) {
    const message = `*FRANKLIN — CLOSE RATE ALERT*\n\nClose rate has been below 30% for 3 consecutive weeks (${history[0]}%, ${history[1]}%, ${currentRate.closeRatePct}%).\n\nThis signals a script or targeting problem. Dorian is reviewing call data. Check with outreach strategy before next send.`;
    await sendToChester(message);
    await log({
      agent: "franklin",
      action: "low_close_rate_flagged",
      status: "failure",
      metadata: { closeRates: [...history, currentRate.closeRatePct] } as unknown as Record<string, unknown>,
    });
    return "low_close_rate_flagged";
  }

  return "normal";
}
