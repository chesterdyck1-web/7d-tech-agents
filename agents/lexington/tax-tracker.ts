// Tracks GST/HST filing obligations and quarterly deadline reminders.
// Canadian SaaS: GST/HST applies when revenue exceeds $30,000 CAD in 4 rolling quarters.
// Once registered, quarterly filing due 1 month after quarter end:
//   Q1 (Jan–Mar): due April 30
//   Q2 (Apr–Jun): due July 31
//   Q3 (Jul–Sep): due October 31
//   Q4 (Oct–Dec): due January 31

import { readSheetAsObjects } from "@/lib/google-sheets";

export interface TaxStatus {
  totalRevenueLast4QuartersCad: number;
  gstRegistrationRequired: boolean;
  nextFilingDeadline: string | null;
  daysUntilDeadline: number | null;
  quarterLabel: string;
  estimatedGstOwing: number;
}

const GST_REGISTRATION_THRESHOLD_CAD = 30_000;
const GST_RATE = 0.05; // 5% federal GST

// Determine which GST filing quarter a date falls in and its deadline.
function getQuarterDeadline(date: Date): { label: string; deadline: Date } {
  const month = date.getMonth(); // 0-indexed
  const year = date.getFullYear();
  if (month <= 2) return { label: `Q1 ${year}`, deadline: new Date(year, 3, 30) }; // Apr 30
  if (month <= 5) return { label: `Q2 ${year}`, deadline: new Date(year, 6, 31) }; // Jul 31
  if (month <= 8) return { label: `Q3 ${year}`, deadline: new Date(year, 9, 31) }; // Oct 31
  return { label: `Q4 ${year}`, deadline: new Date(year + 1, 0, 31) }; // Jan 31 next year
}

// Sum revenue from Financial Metrics sheet for a rolling 4-quarter window.
async function getRevenueLast4Quarters(): Promise<number> {
  const rows = await readSheetAsObjects("Financial Metrics");
  const cutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

  return rows
    .filter((r) => r["date"] && new Date(r["date"] as string) >= cutoff)
    .reduce((sum, r) => sum + Number(r["mrr_cad"] ?? 0), 0);
}

export async function computeTaxStatus(): Promise<TaxStatus> {
  const totalRevenueLast4QuartersCad = await getRevenueLast4Quarters();
  const gstRegistrationRequired = totalRevenueLast4QuartersCad >= GST_REGISTRATION_THRESHOLD_CAD;

  const now = new Date();
  const { label: quarterLabel, deadline } = getQuarterDeadline(now);

  // Only surface deadline if registered (or threshold hit)
  let nextFilingDeadline: string | null = null;
  let daysUntilDeadline: number | null = null;
  if (gstRegistrationRequired) {
    nextFilingDeadline = deadline.toISOString().slice(0, 10);
    daysUntilDeadline = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }

  // Rough GST estimate: 5% of revenue collected from Canadian clients
  // Chester will need an accountant for exact amounts — this is a planning estimate
  const estimatedGstOwing = gstRegistrationRequired
    ? Math.round(totalRevenueLast4QuartersCad * GST_RATE * 100) / 100
    : 0;

  return {
    totalRevenueLast4QuartersCad,
    gstRegistrationRequired,
    nextFilingDeadline,
    daysUntilDeadline,
    quarterLabel,
    estimatedGstOwing,
  };
}
