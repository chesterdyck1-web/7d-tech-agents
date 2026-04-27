// Franklin — CFO Agent.
// Runs daily at 7 AM UTC (before the 8 AM brief) and weekly on Mondays.
// Tracks revenue, API costs, fund balances, close rate, and profitability ratio.
// Target: MRR must be ≥ 2× (monthly CAC + monthly COGS).

import { appendToSheet, readSheetAsObjects } from "@/lib/google-sheets";
import { sendToChester } from "@/lib/telegram";
import { log } from "@/lib/logger";
import { captureRevenue } from "./revenue-tracker";
import { estimateCosts } from "./cost-tracker";
import { computeFunds } from "./fund-manager";
import { computeCloseRate, evaluateCloseRateTrend } from "./close-rate-monitor";

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

  // Weekly close rate evaluation (Mondays only)
  if (isMonday) {
    await evaluateCloseRateTrend(closeRate).catch(() => null);
  }

  // Alert if below 2× profitability target
  if (revenue.mrrCad > 0 && profitabilityRatio < 2) {
    await sendToChester(
      `*FRANKLIN — PROFITABILITY ALERT*\n\nCurrent ratio: ${profitabilityRatio}× (target: 2×)\nMRR: $${revenue.mrrCad} CAD\nMonthly costs: $${costs.totalCogsCad + MONTHLY_CAC_CAD} CAD\n\nNeed ${Math.ceil(denominator * 2 - revenue.mrrCad)} more CAD/month to hit target.`
    );
  }

  // Alert if any clients are past due
  if (revenue.pastDueCount > 0) {
    await sendToChester(
      `*FRANKLIN — PAYMENT ALERT*\n${revenue.pastDueCount} client${revenue.pastDueCount > 1 ? "s" : ""} have past-due payments in Stripe. Check and follow up.`
    );
  }
}

// Returns a formatted one-paragraph financial summary for the daily brief.
export async function getFinancialSummary(): Promise<string> {
  const rows = await readSheetAsObjects("Financial Metrics");
  if (rows.length === 0) return "No financial data yet.";

  const latest = rows[rows.length - 1]!;
  const mrr = Number(latest["mrr_cad"] ?? 0);
  const ratio = Number(latest["profitability_ratio"] ?? 0);
  const operating = Number(latest["operating_fund_cad"] ?? 0);
  const closeRate = Number(latest["close_rate_weekly"] ?? 0);

  return `MRR: $${mrr} CAD  |  Profitability: ${ratio}×  |  Operating fund: $${operating} CAD  |  Close rate: ${closeRate}%`;
}
