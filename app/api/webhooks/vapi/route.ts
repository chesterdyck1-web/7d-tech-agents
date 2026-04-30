// Vapi webhook — fires when a voice call ends.
// Logs the outcome, updates the lead row, notifies Chester, and updates the
// email sequence so follow-ups are paused if the prospect showed interest.

import { NextRequest, NextResponse } from "next/server";
import { updateFieldByRowId } from "@/lib/google-sheets";
import { sendToChester } from "@/lib/telegram";
import { log } from "@/lib/logger";
import { updateVapiStatus } from "@/agents/outreach/sequence-engine";

interface VapiCallEndedEvent {
  type: string;
  call?: {
    id: string;
    status: string;
    endedReason?: string;
    summary?: string;
    metadata?: {
      business_id?: string;
      business_name?: string;
    };
  };
}

export async function POST(req: NextRequest) {
  let body: VapiCallEndedEvent;
  try {
    body = await req.json() as VapiCallEndedEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Vapi sends many event types — only process end-of-call reports
  if (body.type !== "end-of-call-report") {
    return NextResponse.json({ ok: true });
  }

  const call = body.call;
  if (!call) {
    return NextResponse.json({ ok: true });
  }

  const businessId = call.metadata?.business_id ?? "";
  const businessName = call.metadata?.business_name ?? "Unknown";
  const endedReason = call.endedReason ?? call.status ?? "unknown";
  const summary = call.summary ?? "";

  await log({
    agent: "fulfillment",
    action: "vapi_call_ended",
    entityId: businessId,
    status: "success",
    metadata: {
      callId: call.id,
      endedReason,
      businessName,
    } as unknown as Record<string, unknown>,
  });

  // Update call outcome in Daily Leads (col 9 = call_status, col 10 = call_summary)
  if (businessId) {
    try {
      await updateFieldByRowId("Daily Leads", 1, businessId, 9, endedReason);
      if (summary) {
        await updateFieldByRowId("Daily Leads", 1, businessId, 10, summary);
      }
    } catch {
      // Lead may not be in the sheet — not fatal
    }

    // Map Vapi end reason to sequence call status and gate follow-up emails
    const interestedReasons = ["completed", "meeting-booked", "callback-requested"];
    const notAnsweredReasons = ["no-answer", "voicemail", "busy"];

    try {
      if (interestedReasons.includes(endedReason)) {
        await updateVapiStatus(businessId, "interested");
      } else if (notAnsweredReasons.includes(endedReason)) {
        await updateVapiStatus(businessId, "not_answered");
      } else if (endedReason === "declined" || endedReason === "customer-ended-call") {
        await updateVapiStatus(businessId, "declined");
      } else {
        await updateVapiStatus(businessId, "answered");
      }
    } catch {
      // Sequence update is non-fatal
    }
  }

  // Alert Chester on bad outcomes so he can follow up manually if needed
  const badOutcomes = ["no-answer", "busy", "failed", "error", "voicemail"];
  if (badOutcomes.includes(endedReason)) {
    await sendToChester(
      `Call to *${businessName}* ended: ${endedReason}. Email follow-up sequence continuing.`
    );
  }

  // Alert Chester when a prospect showed interest on a call
  if (["completed", "meeting-booked", "callback-requested"].includes(endedReason)) {
    await sendToChester(
      `*${businessName}* showed interest on the call (${endedReason}). Email sequence paused — they're in the voice flow now.`
    );
  }

  return NextResponse.json({ ok: true });
}
