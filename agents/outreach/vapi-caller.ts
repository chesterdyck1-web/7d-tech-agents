// Triggers a Vapi follow-up call for a lead in the Follow-up Queue.
// Called by the Make.com Scenario 2 webhook when follow_up_due_at is reached.

import { createCall } from "@/lib/vapi";
import { getOpenSlots } from "@/lib/google-calendar";
import { log } from "@/lib/logger";
import { env } from "@/lib/env";
import { VERTICAL_HOOK_LANGUAGE } from "@/config/vapi-scripts";
import { escalateToEdmund } from "@/lib/self-heal";

export interface VapiCallInput {
  businessId: string;
  businessName: string;
  ownerName: string;
  phoneNumber: string;
  vertical: string;
  bookingCallbackUrl: string;
}

// All five Vapi variables must be present before placing a call.
// Missing fields cause garbled scripts and potential CASL violations.
function validateVapiVariables(input: VapiCallInput): string | null {
  const required: Array<keyof VapiCallInput> = [
    "ownerName", "businessName", "vertical", "phoneNumber", "bookingCallbackUrl",
  ];
  for (const field of required) {
    const value = input[field];
    if (!value || (typeof value === "string" && value.trim() === "")) {
      return field;
    }
  }
  return null;
}

export async function triggerFollowUpCall(input: VapiCallInput): Promise<string> {
  // Validate all merge fields before placing the call
  const missingField = validateVapiVariables(input);
  if (missingField) {
    await log({
      agent: "outreach",
      action: "vapi_call_blocked",
      entityId: input.businessId,
      status: "failure",
      errorMessage: `Missing required Vapi variable: ${missingField}`,
      metadata: { missingField, businessName: input.businessName } as unknown as Record<string, unknown>,
    });
    // Move to manual review — Chester will see this in the morning brief
    await escalateToEdmund(
      "Cornelius (Vapi)",
      "vapi_call",
      1,
      [`Missing required call variable: ${missingField} for ${input.businessName || input.businessId}`],
      "brief"
    );
    throw new Error(`Vapi call blocked — missing field: ${missingField}`);
  }

  const slots = await getOpenSlots(2);

  if (slots.length < 2) {
    await log({
      agent: "outreach",
      action: "vapi_call_skipped",
      entityId: input.businessId,
      status: "failure",
      errorMessage: "Not enough open calendar slots",
    });
    throw new Error("Not enough open calendar slots to book a demo");
  }

  const [slot1, slot2] = slots;

  const callId = await createCall({
    phoneNumber: input.phoneNumber,
    assistantId: env.VAPI_ASSISTANT_ID,
    assistantOverrides: {
      variableValues: {
        businessName: input.businessName,
        ownerName: input.ownerName,
        vertical: VERTICAL_HOOK_LANGUAGE[input.vertical] ?? `${input.vertical} owners`,
        slot1Human: slot1!.humanReadable,
        slot2Human: slot2!.humanReadable,
        slot1Iso: slot1!.startIso,
        slot2Iso: slot2!.startIso,
        bookingCallbackUrl: input.bookingCallbackUrl,
      },
    },
  });

  await log({
    agent: "outreach",
    action: "vapi_call_triggered",
    entityId: input.businessId,
    status: "success",
    metadata: { callId, businessName: input.businessName },
  });

  return callId;
}
