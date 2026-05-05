// Daily Outreach Flow — demand-driven orchestrator.
// Edmund runs this at 6 AM. It calculates capacity, prioritises existing leads
// over new prospecting, and hands exactly the right number of leads to Cornelius.

import { getAvailableSlots, markStaleLeads, getUncontactedLeads, DAILY_EMAIL_MAX } from "@/lib/capacity";
import { runProspecting } from "@/agents/prospecting/index";
import { draftAndQueueLeads, runFollowUps } from "@/agents/outreach/index";
import { log } from "@/lib/logger";
import { sendToChester } from "@/lib/telegram";

export interface DailyFlowResult {
  availableSlots: number;
  staleMarked: number;
  followUpsQueued: number;
  uncontactedUsed: number;
  prospectsFound: number;
  shortfall: number;
  totalQueued: number;
  skipped: boolean;
  skipReason?: string;
  city?: string;
}

// Main entry point for the 6 AM flow.
// overrideSlots lets Chester say "run prospecting for 20 leads" via Telegram.
export async function runDailyOutreachFlow(overrideSlots?: number): Promise<DailyFlowResult> {
  // Step 1: Mark stale leads before calculating capacity
  const staleMarked = await markStaleLeads();

  // Step 2: Calculate how many emails can go out today
  const availableSlots = overrideSlots !== undefined
    ? Math.max(0, Math.min(overrideSlots, DAILY_EMAIL_MAX))
    : await getAvailableSlots();

  await log({
    agent: "coordinator",
    action: "daily_flow_started",
    status: "pending",
    metadata: { availableSlots, staleMarked, overrideSlots } as unknown as Record<string, unknown>,
  });

  if (availableSlots <= 0) {
    const skipReason = "At daily email limit — approval queue full or 30 already sent";
    await log({
      agent: "coordinator",
      action: "daily_flow_skipped",
      status: "success",
      metadata: { reason: skipReason } as unknown as Record<string, unknown>,
    });
    await sendToChester(
      `*6 AM Flow — Skipped*\nNo capacity today (${DAILY_EMAIL_MAX} email limit reached). Check the Approval Queue — you may have emails waiting for approval.`
    );
    return {
      availableSlots: 0, staleMarked, followUpsQueued: 0,
      uncontactedUsed: 0, prospectsFound: 0, shortfall: 0,
      totalQueued: 0, skipped: true, skipReason,
    };
  }

  let remainingSlots = availableSlots;
  let city = "";

  // Step 3: Follow-ups first (highest priority — they count against the 30-email limit)
  const followUpsQueued = await runFollowUps(remainingSlots);
  remainingSlots -= followUpsQueued;

  if (remainingSlots <= 0) {
    await log({
      agent: "coordinator",
      action: "daily_flow_completed",
      status: "success",
      metadata: { availableSlots, followUpsQueued, uncontactedUsed: 0, prospectsFound: 0, shortfall: 0, totalQueued: followUpsQueued } as unknown as Record<string, unknown>,
    });
    await sendToChester(
      `*6 AM Flow*\nCapacity: ${availableSlots} emails today\nAll ${followUpsQueued} slots filled by follow-ups\nEmails in your dashboard: ${followUpsQueued}`
    );
    return {
      availableSlots, staleMarked, followUpsQueued,
      uncontactedUsed: 0, prospectsFound: 0, shortfall: 0,
      totalQueued: followUpsQueued, skipped: false,
    };
  }

  // Step 4: Check existing uncontacted leads before prospecting new ones
  const uncontacted = await getUncontactedLeads(remainingSlots);
  let leadsForOutreach = uncontacted;
  let prospectsFound = 0;
  let shortfall = 0;

  if (uncontacted.length >= remainingSlots) {
    // Existing list is sufficient — skip prospecting entirely
    await log({
      agent: "coordinator",
      action: "prospecting_skipped",
      status: "success",
      metadata: {
        reason: "existing uncontacted leads sufficient",
        uncontactedCount: uncontacted.length,
        slotsNeeded: remainingSlots,
      } as unknown as Record<string, unknown>,
    });
  } else {
    // Existing list cannot fill capacity — prospect for the gap
    const needed = remainingSlots - uncontacted.length;
    const prospectResult = await runProspecting(needed);
    prospectsFound = prospectResult.leads.length;
    shortfall = prospectResult.shortfall;
    city = prospectResult.city;
    leadsForOutreach = [...uncontacted, ...prospectResult.leads];
  }

  // Step 5: Draft emails for all leads (existing uncontacted + newly prospected)
  await log({
    agent: "outreach",
    action: "run_started",
    status: "pending",
    metadata: { leadsToProcess: leadsForOutreach.length } as unknown as Record<string, unknown>,
  });

  const { queued: newEmailsQueued, failed } = await draftAndQueueLeads(leadsForOutreach);
  const totalQueued = followUpsQueued + newEmailsQueued;

  const result: DailyFlowResult = {
    availableSlots,
    staleMarked,
    followUpsQueued,
    uncontactedUsed: uncontacted.length,
    prospectsFound,
    shortfall,
    totalQueued,
    skipped: false,
    city: city || undefined,
  };

  await log({
    agent: "coordinator",
    action: "daily_flow_completed",
    status: "success",
    metadata: { ...result, failed } as unknown as Record<string, unknown>,
  });

  // Build the Telegram summary
  const lines: string[] = [
    `*6 AM Flow${city ? ` — ${city}` : ""}*`,
    `Capacity today: ${availableSlots} of ${DAILY_EMAIL_MAX} slots available`,
  ];

  if (followUpsQueued > 0) lines.push(`Follow-ups queued: ${followUpsQueued}`);
  if (uncontacted.length > 0) lines.push(`Existing leads used: ${uncontacted.length}`);
  if (prospectsFound > 0) lines.push(`New leads prospected: ${prospectsFound}`);
  if (shortfall > 0) lines.push(`Leads not found: ${shortfall} (insufficient results in ${city})`);
  if (failed > 0) lines.push(`Email drafting failed: ${failed}`);

  lines.push(`\nEmails in your dashboard: ${totalQueued}`);
  if (staleMarked > 0) lines.push(`Stale leads archived: ${staleMarked}`);

  await sendToChester(lines.join("\n"));

  return result;
}
