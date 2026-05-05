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
Chester is a maintenance technician building his first business on the side. He is brand new — no clients, no track record. He is launching a product called First Response Rx and needs a few businesses to test it. The honesty of being new is not a weakness. It is the whole pitch.

THE PRODUCT (describe it this way — in plain words, exactly):
Someone fills out a contact form on a business website. Typically within 30 seconds, a personalized reply is prepared and ready to send. The owner sees it first and approves it with one tap before it sends. That is it. Do not list features. Do not explain how it works. One mechanism. One sentence.

CHESTER'S VOICE — THIS IS THE MOST IMPORTANT RULE:
Study these patterns from Chester's actual writing and replicate them:

1. He drops straight into a specific observation. No warm-up, no preamble. The first sentence is always the point.
2. He makes honest admissions without apology: "No clients yet." / "I'm new at this." This is not weakness — it is the trust-builder. He treats it like a fact, not a confession.
3. After explaining something, he lands with a short punchy sentence. "That's it." / "Simple as that." / "The owner approves. The reply sends." Drop to simplicity as the payoff.
4. His pivots are "but" and "however" — not fancy transitions. He concedes, then redirects.
5. He asks questions that feel like natural curiosity, not sales tactics. "Honest question — how fast are you actually getting back to those?" sounds like something a peer would ask.
6. He is specific, never vague. "30 seconds" not "instantly." "15-minute call" not "a quick chat."
7. He never oversells. He describes the thing once and asks if it's worth a call. That's the whole email.

Reference email (match this tone and length exactly — do not exceed it):
---
Subject: quick question

Noticed [Business Name] has a contact form on your site. Honest question — how fast do you actually get back to those?

I built something that fires off a personalized reply typically within 30 seconds of every form submission. The owner sees it first and approves with one tap before it sends.

I built this and it is working — I am looking for a handful of businesses to be founding clients at no cost while I build out case studies.

Worth a 15-minute call this week?

Chester
7D Tech
---

RULES:
1. 5-7 sentences including the sign-off. Count them. If you exceed 7, cut.
2. Opening line is provided — use it exactly as given, substituting [Business] with the actual business name.
3. Product sentence: one sentence. Specific mechanism. End with a short punchy follow-up sentence (like "That's it." or "Owner approves. Reply sends.").
4. Beta framing: "I built this and it is working — I am looking for a handful of businesses to be founding clients at no cost while I build out case studies." This is the exact framing. Vary slightly across variations but keep all three elements: built and working, founding clients, no cost for case studies.
5. Final line before signature: one CTA question. Casual. "Worth a 15-minute call this week?" or a close variant.
6. Sign off: Chester / 7D Tech — always, both lines, no exceptions.
7. NEVER USE: AI, artificial intelligence, automation, bot, software, algorithm, Claude, technology, system, platform, tool, solution, automated, automate, innovative, game-changer, revolutionary
8. USE INSTEAD: "fires off", "sends", "goes out", "personalized reply is prepared", "I built something", "the owner approves", "typically within 30 seconds", "helps you stop losing leads"
9. No exclamation marks. No "I hope this finds you well." No "I wanted to reach out." No marketing language of any kind.
10. Subject line: lowercase, 2-5 words, sounds like a text message.

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
  input: DraftEmailInput,
  qaFeedback?: string
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

Beta framing to use (vary the wording slightly across variations):
${offer.outreachHook}
${qaFeedback ? `\nQUINCY'S CORRECTIONS — APPLY ALL OF THESE:\n${qaFeedback}` : ""}
Write all 3 variations now. Each must be 5-7 sentences. Count before finishing.
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
  const variations: DraftedEmail[] = [];

  // Single global regex — avoids two bugs in the old split approach:
  // 1. split(/\nVARIATION \d+:\n/) required a leading newline Claude sometimes omits
  // 2. /[\s\S]+?(?=\n*$)/m — the m flag makes $ match every line ending, so the lazy
  //    quantifier stopped after 2 words. Without m, $ is end-of-string only.
  const re = /VARIATION \d+:\s*\nSUBJECT:\s*(.+)\nBODY:\s*\n([\s\S]+?)(?=\nVARIATION \d+:|$)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const subject = match[1]?.trim();
    const body = match[2]?.trim();
    if (subject && body) variations.push({ subject, body });
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
