// Franklin — CFO Agent.
// Runs daily at 7 AM UTC (before the 8 AM brief) and weekly on Mondays.
// Tracks revenue, API costs, fund balances, close rate, and profitability ratio.
// Target: MRR must be ≥ 2× (monthly CAC + monthly COGS).

import { appendToSheet, readSheetAsObjects, ensureSheetTab } from "@/lib/google-sheets";
import { sendToChester } from "@/lib/telegram";
import { log } from "@/lib/logger";
import { captureRevenue } from "./revenue-tracker";
import { estimateCosts } from "./cost-tracker";
import { computeFunds } from "./fund-manager";
import { computeCloseRate, evaluateCloseRateTrend } from "./close-rate-monitor";
import { listCalls } from "@/lib/vapi";
import { DEFAULT_CONVERSION_RATES } from "@/lib/goals";

// Estimated monthly customer acquisition cost (outreach time + ad spend placeholder)
const MONTHLY_CAC_CAD = 15;

function getMondayISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

// Read existing fund balances from the Financial Metrics sheet (last row).
async function getLastFundBalances(): Promise<{
  operating: number;
  acquisition: number;
  realEstate: number;
}> {
  const rows = await readSheetAsObjects("Financial Metrics");
  const last = rows[rows.length - 1];
  return {
    operating: Number(last?.["operating_fund_cad"] ?? 0),
    acquisition: Number(last?.["acquisition_fund_cad"] ?? 0),
    realEstate: Number(last?.["real_estate_fund_cad"] ?? 0),
  };
}

export async function runDailyFinancials(): Promise<void> {
  await ensureSheetTab("Financial Metrics", [
    "date", "mrr_cad", "new_clients", "total_active", "anthropic_cost_cad",
    "vapi_cost_cad", "make_cost_cad", "total_cogs_cad", "cac_cad",
    "profitability_ratio", "operating_fund_cad", "acquisition_fund_cad",
    "real_estate_fund_cad", "close_rate_weekly", "notes",
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const isMonday = new Date().getDay() === 1;

  const [revenue, costs, priorFunds, closeRate] = await Promise.all([
    captureRevenue().catch((err) => {
      void log({ agent: "franklin", action: "revenue_capture_failed", status: "failure", errorMessage: String(err) });
      return { mrrCad: 0, activeClients: 0, monthlyClients: 0, annualClients: 0, newClientsThisWeek: 0, pastDueCount: 0 };
    }),
    estimateCosts().catch(() => ({ anthropicCostCad: 0, vapiCostCad: 0, makeCostCad: 0, totalCogsCad: 0 })),
    getLastFundBalances().catch(() => ({ operating: 0, acquisition: 0, realEstate: 0 })),
    computeCloseRate().catch(() => ({ weekStart: getMondayISO(), outreachSent: 0, newClients: 0, closeRatePct: 0 })),
  ]);

  const funds = computeFunds(
    revenue.mrrCad,
    costs.totalCogsCad,
    priorFunds.operating,
    priorFunds.acquisition,
    priorFunds.realEstate
  );

  // 2× profitability ratio: MRR / (CAC + COGS)
  const denominator = MONTHLY_CAC_CAD + costs.totalCogsCad;
  const profitabilityRatio =
    denominator > 0 ? Math.round((revenue.mrrCad / denominator) * 10) / 10 : 0;

  // Write daily snapshot to Financial Metrics sheet
  // Columns: date | mrr_cad | new_clients | total_active | anthropic_cost | vapi_cost | make_cost |
  //          total_cogs | cac | profitability_ratio | operating_fund | acquisition_fund |
  //          real_estate_fund | close_rate_weekly | notes
  await appendToSheet("Financial Metrics", [
    today,
    revenue.mrrCad,
    revenue.newClientsThisWeek,
    revenue.activeClients,
    costs.anthropicCostCad,
    costs.vapiCostCad,
    costs.makeCostCad,
    costs.totalCogsCad,
    MONTHLY_CAC_CAD,
    profitabilityRatio,
    funds.operatingFundCad,
    funds.acquisitionFundCad,
    funds.realEstateFundCad,
    closeRate.closeRatePct,
    "",
  ]);

  await log({
    agent: "franklin",
    action: "daily_financials_recorded",
    status: "success",
    metadata: { mrr: revenue.mrrCad, profitabilityRatio, closeRate: closeRate.closeRatePct } as unknown as Record<string, unknown>,
  });

  // Weekly close rate evaluation and conversion rate recording (Mondays only)
  if (isMonday) {
    await evaluateCloseRateTrend(closeRate).catch(() => null);
    await updateConversionRates().catch(() => null);
  }

  // MRR milestone alerts — fire once when a threshold is first crossed
  const allRows = await readSheetAsObjects("Financial Metrics").catch(() => []);
  const priorRow = allRows.length >= 2 ? allRows[allRows.length - 2] : null;
  const priorMrr = priorRow ? Number(priorRow["mrr_cad"] ?? 0) : 0;

  const MRR_MILESTONES: Array<{ threshold: number; note: string }> = [
    { threshold: 500, note: "This is your first real recurring revenue. The model is working." },
    {
      threshold: 1000,
      note: "Consider upgrading your Make.com plan. Model the Instantly.ai ROI — you may be ready.",
    },
    {
      threshold: 2000,
      note: "Activate the Real Estate Fund bucket. Day job replacement is now within sight. I will model the timeline.",
    },
  ];

  for (const { threshold, note } of MRR_MILESTONES) {
    if (priorMrr < threshold && revenue.mrrCad >= threshold) {
      await sendToChester(
        `*FRANKLIN — MRR MILESTONE: $${threshold} CAD*\n\n${note}`
      );
    }
  }

  // Alert if operating reserve drops below 2 months
  const MONTHLY_OPERATING_COST = costs.totalCogsCad + MONTHLY_CAC_CAD;
  const operatingMonthsRemaining =
    MONTHLY_OPERATING_COST > 0
      ? Math.floor(funds.operatingFundCad / MONTHLY_OPERATING_COST)
      : 99;
  if (operatingMonthsRemaining < 2 && funds.operatingFundCad > 0) {
    await sendToChester(
      `*FRANKLIN — OPERATING RESERVE ALERT*\n\nOperating fund covers less than 2 months at current run rate.\nFund: $${funds.operatingFundCad} CAD  |  Monthly cost: $${MONTHLY_OPERATING_COST} CAD\n\nReview costs or hold pricing steady.`
    );
  }

  // Alert if below 2× profitability target (only alert when MRR > 0 to avoid false positives at launch)
  if (revenue.mrrCad > 0 && profitabilityRatio < 2) {
    await sendToChester(
      `*FRANKLIN — PROFITABILITY ALERT*\n\nCurrent ratio: ${profitabilityRatio}× (target: 2×)\nMRR: $${revenue.mrrCad} CAD  |  Monthly costs: $${costs.totalCogsCad + MONTHLY_CAC_CAD} CAD\n\nNeed $${Math.ceil(denominator * 2 - revenue.mrrCad)} more CAD/month to hit target.`
    );
  }

  // Alert if any clients are past due
  if (revenue.pastDueCount > 0) {
    await sendToChester(
      `*FRANKLIN — PAYMENT ALERT*\n${revenue.pastDueCount} client${revenue.pastDueCount > 1 ? "s" : ""} with past-due payments in Stripe. Check and follow up.`
    );
  }
}

// Compute and store actual email→reply→call→client conversion rates for the past 7 days.
// Goals system reads these on Mondays so goal math uses real rates instead of defaults.
async function updateConversionRates(): Promise<void> {
  await ensureSheetTab("Conversion Rates", [
    "week_start", "email_reply_rate", "reply_to_call_rate", "call_to_client_rate",
    "emails_sent", "replies_received", "calls_completed", "new_clients",
  ]);

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const weekStart = weekAgo.toISOString().slice(0, 10);

  const [queue, actionLog, clients] = await Promise.all([
    readSheetAsObjects("Approval Queue"),
    readSheetAsObjects("Action Log"),
    readSheetAsObjects("Clients"),
  ]);

  const emailsSent = queue.filter(
    (r) => r["type"] === "outreach_email" && r["status"] === "approved" && (r["decided_at"] ?? "") >= weekStart
  ).length;

  // Replies are logged to Action Log by the reply tracker
  const repliesReceived = actionLog.filter(
    (r) => r["action"] === "reply_detected" && (r["timestamp"] ?? "") >= weekStart
  ).length;

  // Vapi calls completed this week — may be 0 if calling not yet active
  let callsCompleted = 0;
  try {
    const vapiCalls = await listCalls(100, weekAgo.toISOString());
    callsCompleted = vapiCalls.filter((c) => c.status === "completed").length;
  } catch { /* Vapi not yet active */ }

  const newClients = clients.filter(
    (c) =>
      (c["status"] === "active" || c["status"] === "onboarding") &&
      (c["created_at"] ?? "") >= weekStart
  ).length;

  // Skip if no email data — rates would be meaningless
  if (emailsSent === 0) return;

  // Use real rate if enough data exists; otherwise fall back to default assumption
  const emailReplyRate =
    repliesReceived > 0
      ? Math.round((repliesReceived / emailsSent) * 1000) / 1000
      : DEFAULT_CONVERSION_RATES.emailReplyRate;

  const replyToCallRate =
    callsCompleted > 0 && repliesReceived > 0
      ? Math.round((callsCompleted / repliesReceived) * 1000) / 1000
      : DEFAULT_CONVERSION_RATES.replyToCallRate;

  const callToClientRate =
    newClients > 0 && callsCompleted > 0
      ? Math.round((newClients / callsCompleted) * 1000) / 1000
      : DEFAULT_CONVERSION_RATES.callToClientRate;

  await appendToSheet("Conversion Rates", [
    weekStart, emailReplyRate, replyToCallRate, callToClientRate,
    emailsSent, repliesReceived, callsCompleted, newClients,
  ]);

  await log({
    agent: "franklin",
    action: "conversion_rates_updated",
    status: "success",
    metadata: {
      emailReplyRate, replyToCallRate, callToClientRate,
      emailsSent, repliesReceived, callsCompleted, newClients,
    } as unknown as Record<string, unknown>,
  });
}

// Returns a formatted financial summary for the daily brief — all three capital buckets.
export async function getFinancialSummary(): Promise<string> {
  const rows = await readSheetAsObjects("Financial Metrics").catch(() => []);
  if (rows.length === 0) return "No financial data yet.";

  const latest = rows[rows.length - 1]!;
  const mrr = Number(latest["mrr_cad"] ?? 0);
  const ratio = Number(latest["profitability_ratio"] ?? 0);
  const operating = Number(latest["operating_fund_cad"] ?? 0);
  const acquisition = Number(latest["acquisition_fund_cad"] ?? 0);
  const realEstate = Number(latest["real_estate_fund_cad"] ?? 0);
  const closeRate = Number(latest["close_rate_weekly"] ?? 0);
  const cac = Number(latest["cac_cad"] ?? MONTHLY_CAC_CAD);

  const closeRateTrend =
    closeRate >= 50 ? "above target — recommend price review" :
    closeRate >= 30 ? "in sweet spot — hold price" :
    closeRate > 0 ? "⚠ below 30% — flag to Dorian" :
    "no data";

  const lines = [
    `MRR: $${mrr} CAD  |  Profitability: ${ratio}×  |  CAC: $${cac} CAD`,
    `Operating fund: $${operating}  |  Acquisition fund: $${acquisition} / $50,000  |  Real estate: $${realEstate}`,
    `Close rate: ${closeRate}% (${closeRateTrend})`,
  ];

  return lines.join("\n");
}
