// Drafts 3 cold outreach email variations for a specific lead.
// Each variation uses a different angle on the same pain point.
// Never mention AI, automation, Claude, or software.

import { claude } from "@/lib/claude";
import { VERTICALS } from "@/config/verticals";
import { getPromptOverride } from "@/lib/prompts";
import { getCurrentOffer } from "@/lib/offers";

export interface DraftEmailInput {
  businessName: string;
  ownerName?: string;
  vertical: string;
  city: string;
  website?: string;
}

export interface DraftedEmail {
  subject: string;
  body: string;
}

// Vertical-specific opening lines that replace the generic pain point.
// Each one connects to the owner's lived experience — what they're doing
// when they can't answer a form submission.
const VERTICAL_OPENINGS: Record<string, string[]> = {
  photographer: [
    "Noticed [Business] has a contact form on your site. Honest question — what happens to those inquiries when you're on a shoot?",
    "Noticed [Business] takes bookings through your site. What does that look like when you're behind the camera for six hours?",
    "Noticed [Business] has a contact form. Most photographers I've talked to say inquiries pile up between shoots and by the time they reply, the couple already booked someone else.",
  ],
  massage_therapist: [
    "Noticed [Business] has a contact form on your site. Honest question — how fast are you getting back to those when you're hands-on with a patient?",
    "Noticed [Business] takes new patient inquiries online. What does that look like when you're in the middle of a 90-minute session?",
    "Noticed [Business] has a contact form. Most RMTs I've talked to say new patient requests pile up during their schedule and the inquiry has gone cold by the time they check.",
  ],
  gym: [
    "Noticed [Business] has a contact form on your site. Honest question — how fast are you getting back to those when you're on the floor coaching?",
    "Noticed [Business] takes membership inquiries through your site. What does follow-up look like when you're running a class?",
    "Noticed [Business] has a contact form. Most gym owners I've talked to say trial sign-ups go cold over the weekend when no one is watching the inbox.",
  ],
  personal_trainer: [
    "Noticed [Business] has a contact form on your site. Honest question — how fast are you getting back to those when you're mid-session with a client?",
    "Noticed [Business] takes new client inquiries online. What happens to those when you're training someone and your phone is in your bag?",
    "Noticed [Business] has a contact form. Most trainers I've talked to say trial requests go unanswered over the weekend and the prospect has moved on by Monday.",
  ],
  chiropractor: [
    "Noticed [Business] has a contact form on your site. Honest question — what happens to those when the front desk is tied up with existing patients?",
    "Noticed [Business] takes new patient inquiries through your site. What does that look like after hours when no one is at the clinic?",
    "Noticed [Business] has a contact form. Most chiropractors I've talked to say new patients in pain contact three clinics at once — whoever replies first gets the booking.",
  ],
  landscaper: [
    "Noticed [Business] has a contact form on your site. Honest question — how fast are you getting back to quote requests when your crew is out all day?",
    "Noticed [Business] takes quotes through your site. What does that look like during peak season when everyone is stretched thin?",
    "Noticed [Business] has a contact form. Most landscapers I've talked to say homeowners request quotes from a few companies at once and whoever responds first usually gets the job.",
  ],
};

const DEFAULT_OPENINGS = [
  "Noticed [Business] has a contact form on your site. Honest question — how fast are you actually getting back to those?",
  "Noticed [Business] takes inquiries through your site. What does your response time look like on a busy day?",
  "Noticed [Business] has a contact form. Most owners I've talked to say the hardest part is following up fast enough — by the time they reply, the prospect has already gone somewhere else.",
];

export const OUTREACH_SYSTEM_PROMPT = `
You are writing cold outreach emails for Chester Dyck at 7D Tech (7dtech.ca).

WHO CHESTER IS:
Chester is a maintenance technician building his first business on the side. He is brand new — zero clients, zero track record. He is launching a product called First Response Rx and needs 3-5 businesses to test it at no cost so he can build case studies. The honesty of being new is a strength. Do not imply any existing clients or history.

THE PRODUCT (describe it this way — plainly):
Someone fills out a contact form. Within 30 seconds, a personalized reply goes out. The owner sees it first and approves it with one tap. That is it.

CHESTER'S VOICE — THIS IS THE MOST IMPORTANT RULE:
Chester writes like a regular person, not a marketer. He is direct, a little dry, occasionally funny, and always honest. He does not write marketing copy. He writes like someone texting a business owner he respects.

Reference email (match this tone and length exactly — do not exceed it):
---
Subject: quick question

Noticed [Business Name] has a contact form on your site. Honest question — how fast do you actually get back to those?

I built something that fires off a personalized reply within 30 seconds of every form submission. Looking for a couple of businesses to try it at no cost while I build my first case studies.

Worth a 15-minute call this week?

Chester
7D Tech
---

RULES:
1. 4-6 sentences including the sign-off. Count them. If you exceed 6, cut.
2. Opening line is provided — use it exactly as given, substituting [Business] with the actual business name.
3. Sentence 2 (optional, max 1): a brief rhetorical question or casual observation that earns the next line.
4. Sentence 3: describe the product in plain English. "I built something that fires off a personalized reply within 30 seconds." Never list features.
5. Sentence 4: beta framing. "Looking for a couple of businesses to try it at no cost while I build my first case studies." Vary the wording slightly across variations.
6. Final line: one CTA. Make it a casual question, not a formal ask. "Worth a 15-minute call this week?" or a close variant.
7. Sign off: Chester / 7D Tech — always, no exceptions.
8. NEVER USE: AI, artificial intelligence, automation, bot, software, algorithm, Claude, technology, system, platform, tool, solution, automated, automate
9. USE INSTEAD: "fires off", "sends", "goes out", "personalized reply", "instant follow-up", "I built something"
10. No exclamation marks. No "I hope this email finds you well." No "I wanted to reach out." No marketing language of any kind.
11. Subject line: lowercase, under 8 words, conversational — like a text message subject

You will be given an opening line for each variation. Use it exactly.

Output format — respond with ONLY this, no other text:

VARIATION 1:
SUBJECT: [subject line]
BODY:
[email body]

VARIATION 2:
SUBJECT: [subject line]
BODY:
[email body]

VARIATION 3:
SUBJECT: [subject line]
BODY:
[email body]
`.trim();

export async function draftOutreachEmail(
  input: DraftEmailInput
): Promise<DraftedEmail[]> {
  const vertical = VERTICALS.find((v) => v.id === input.vertical);

  const openings =
    VERTICAL_OPENINGS[input.vertical] ??
    DEFAULT_OPENINGS.map((o) => o.replace("[Business]", input.businessName));

  // Substitute business name into vertical-specific openings
  const resolvedOpenings = openings.map((o) =>
    o.replace("[Business]", input.businessName)
  );

  const greeting = input.ownerName ? `Hi ${input.ownerName},` : "Hi there,";
  const offer = await getCurrentOffer();

  const userMessage = `
Business name: ${input.businessName}
Vertical: ${vertical?.name ?? input.vertical} in ${input.city}
Greeting to use: ${greeting}

Opening line for variation 1 (use exactly):
${resolvedOpenings[0]}

Opening line for variation 2 (use exactly):
${resolvedOpenings[1]}

Opening line for variation 3 (use exactly):
${resolvedOpenings[2]}

Beta framing to use (sentence 4 — use this offer, vary the wording slightly across variations):
${offer.outreachHook}

Write all 3 variations now. Each must be 4-6 sentences. Count before finishing.
`.trim();

  // Check for a live prompt override from the Agent Prompts sheet
  const systemPrompt =
    (await getPromptOverride("outreach", "system")) ?? OUTREACH_SYSTEM_PROMPT;

  const res = await claude({
    system: systemPrompt,
    userMessage,
    maxTokens: 800,
    label: "outreach:draft-email",
  });

  return parseEmailVariations(res.text, input.businessName, input.ownerName);
}

function parseEmailVariations(
  text: string,
  businessName: string,
  ownerName?: string
): DraftedEmail[] {
  const variationBlocks = text.split(/\nVARIATION \d+:\n/);
  const variations: DraftedEmail[] = [];

  for (const block of variationBlocks) {
    if (!block.trim()) continue;
    const subjectMatch = block.match(/^SUBJECT:\s*(.+)$/m);
    const bodyMatch = block.match(/^BODY:\s*\n([\s\S]+?)(?=\n*$)/m);

    if (subjectMatch?.[1] && bodyMatch?.[1]) {
      variations.push({
        subject: subjectMatch[1].trim(),
        body: bodyMatch[1].trim(),
      });
    }
  }

  // Fallback if parsing fails — return a single minimal draft
  if (variations.length === 0) {
    const subjectMatch = text.match(/^SUBJECT:\s*(.+)$/m);
    const bodyMatch = text.match(/^BODY:\s*\n([\s\S]+)$/m);
    variations.push({
      subject: subjectMatch?.[1]?.trim() ?? `quick question for ${businessName}`,
      body: bodyMatch?.[1]?.trim() ?? text,
    });
  }

  return variations;
}
