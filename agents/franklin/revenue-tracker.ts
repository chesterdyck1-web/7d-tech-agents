// Tracks Stripe MRR, client counts, and recent revenue inflows.
// Annual plan: $480 CAD/year ($40/month equivalent). Monthly: $50 CAD.

import { getRevenueSummary, getNewClientCount } from "@/lib/stripe-reader";
import { readSheetAsObjects } from "@/lib/google-sheets";

export interface RevenueSnapshot {
  mrrCad: number;
  activeClients: number;
  monthlyClients: number;
  annualClients: number;
  newClientsThisWeek: number;
  pastDueCount: number;
}

export async function captureRevenue(): Promise<RevenueSnapshot> {
  // Pull from Stripe as the authoritative source
  const [stripe, newClients] = await Promise.all([
    getRevenueSummary(),
    getNewClientCount(7),
  ]);

  // Cross-reference with Clients sheet for the active count we track
  const clients = await readSheetAsObjects("Clients");
  const activeInSheet = clients.filter((c) => c["status"] === "active").length;

  return {
    mrrCad: stripe.mrrCad || activeInSheet * 50, // fall back to sheet estimate if Stripe returns 0
    activeClients: stripe.activeSubscriptions || activeInSheet,
    monthlyClients: stripe.monthlyClients,
    annualClients: stripe.annualClients,
    newClientsThisWeek: newClients,
    pastDueCount: stripe.pastDueCount,
  };
}
