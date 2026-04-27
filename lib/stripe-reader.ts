// Stripe read helpers for Franklin (CFO Agent).
// Separate from the write-focused fulfillment/stripe-invoicer — this file only reads.

import Stripe from "stripe";
import { env } from "@/lib/env";

let _stripe: Stripe | null = null;
function stripe() {
  if (!_stripe) _stripe = new Stripe(env.STRIPE_SECRET_KEY);
  return _stripe;
}

export interface ClientRevenue {
  customerId: string;
  customerName: string;
  email: string;
  plan: "monthly" | "annual";
  monthlyEquivalentCad: number;
  status: "active" | "past_due" | "canceled";
}

export interface RevenueSummary {
  mrrCad: number;
  activeSubscriptions: number;
  monthlyClients: number;
  annualClients: number;
  pastDueCount: number;
}

const MONTHLY_PRICE_CAD = 50;
const ANNUAL_PRICE_CAD = 480;
const ANNUAL_MONTHLY_EQUIVALENT_CAD = ANNUAL_PRICE_CAD / 12; // 40

// Fetch all active Stripe subscriptions and compute MRR.
export async function getRevenueSummary(): Promise<RevenueSummary> {
  const subscriptions = await stripe().subscriptions.list({
    status: "all",
    limit: 100,
  });

  let mrrCad = 0;
  let activeSubscriptions = 0;
  let monthlyClients = 0;
  let annualClients = 0;
  let pastDueCount = 0;

  for (const sub of subscriptions.data) {
    const amountCad = (sub.items.data[0]?.price.unit_amount ?? 0) / 100;
    const interval = sub.items.data[0]?.price.recurring?.interval ?? "month";

    const isAnnual = interval === "year" || amountCad >= ANNUAL_PRICE_CAD * 0.9;

    if (sub.status === "active") {
      activeSubscriptions++;
      if (isAnnual) {
        mrrCad += ANNUAL_MONTHLY_EQUIVALENT_CAD;
        annualClients++;
      } else {
        mrrCad += MONTHLY_PRICE_CAD;
        monthlyClients++;
      }
    } else if (sub.status === "past_due") {
      pastDueCount++;
    }
  }

  return { mrrCad, activeSubscriptions, monthlyClients, annualClients, pastDueCount };
}

// Get the total amount received in the last 30 days from Stripe charges.
export async function getRecentRevenueCad(days = 30): Promise<number> {
  const since = Math.floor(Date.now() / 1000) - days * 86400;
  const charges = await stripe().charges.list({
    limit: 100,
    created: { gte: since },
  });
  return charges.data
    .filter((c) => c.status === "succeeded")
    .reduce((sum, c) => sum + c.amount / 100, 0);
}

// Count new paying clients added in the last N days.
export async function getNewClientCount(days = 7): Promise<number> {
  const since = Math.floor(Date.now() / 1000) - days * 86400;
  const subscriptions = await stripe().subscriptions.list({
    status: "active",
    limit: 100,
    created: { gte: since },
  });
  return subscriptions.data.length;
}
