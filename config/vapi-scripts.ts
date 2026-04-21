// Parameterized Vapi call script for the 48h follow-up call.
// Variables injected at call time by the Outreach Agent.
// RULE: Never mention AI, Claude, or automation. Sell on outcome only.

export interface VapiScriptVars {
  businessName: string;
  ownerName: string;
  vertical: string; // human-readable e.g. "gym owners"
  slot1Human: string; // e.g. "Tuesday at 2 PM"
  slot2Human: string; // e.g. "Wednesday at 10 AM"
  slot1Iso: string;
  slot2Iso: string;
  bookingCallbackUrl: string;
}

export const VAPI_CALL_SCRIPT = `
GREETING (5 seconds):
"Hi, is this {{ownerName}} from {{businessName}}? I will be quick — 30 seconds?"

HOOK (10 seconds):
"{{vertical}} tell us the same thing: someone fills out their contact form,
and by the time they respond, that person has already booked somewhere else.
Does that happen to you?"

OFFER (10 seconds):
"We built something called First Response Rx. When someone fills your contact form,
a personalized reply is drafted in 30 seconds, you approve it with one tap, it sends.
You stop losing leads to slow response time."

CLOSE:
"Chester has {{slot1Human}} or {{slot2Human}} for a 15-minute demo. Which works?"

ON BOOKING:
  → POST {{bookingCallbackUrl}} with selected slot ISO timestamp
  → Calendar event created automatically
  → Confirmation sent to prospect

ON NEITHER SLOT WORKS:
  → Ask "What time works best for you this week?"
  → Log preferred time for Chester manual follow-up

ON NOT INTERESTED:
  → "No problem at all — appreciate your time."
  → Log outcome=not_interested → Master Leads status=dead

ON NO ANSWER / VOICEMAIL:
  → Leave no voicemail
  → Log outcome=no_answer → do not re-call for 7 days
`;

// Pain point openers by vertical — used to customize the HOOK line
export const VERTICAL_HOOK_LANGUAGE: Record<string, string> = {
  gym: "gym owners",
  photographer: "photographers",
  massage_therapist: "massage therapists",
};
