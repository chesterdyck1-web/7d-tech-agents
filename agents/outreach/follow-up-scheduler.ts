// Schedules a 48h Vapi follow-up call after an outreach email is sent.

import { appendToSheet } from "@/lib/google-sheets";

export async function scheduleFollowUp(businessId: string): Promise<void> {
  const sentAt = new Date().toISOString();
  const followUpAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

  await appendToSheet("Follow-up Queue", [
    businessId,
    sentAt,
    followUpAt,
    "pending",
  ]);
}
