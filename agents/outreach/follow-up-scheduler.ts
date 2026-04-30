// Schedules a 48h Vapi follow-up call after an outreach email is sent.

import { appendToSheet, ensureSheetTab } from "@/lib/google-sheets";

const HEADERS = ["business_id", "sent_at", "follow_up_at", "status"];

export async function scheduleFollowUp(businessId: string): Promise<void> {
  await ensureSheetTab("Follow-up Queue", HEADERS);

  const sentAt = new Date().toISOString();
  const followUpAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

  await appendToSheet("Follow-up Queue", [
    businessId,
    sentAt,
    followUpAt,
    "pending",
  ]);
}
