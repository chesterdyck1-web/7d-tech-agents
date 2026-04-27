// Drafts a hyper-personalized cold outreach email for a specific lead.
// Uses the vertical's pain points and the business's details.
// RULE: Never mention AI, Claude, or automation in the email.

import { claude } from "@/lib/claude";
import { VERTICALS } from "@/config/verticals";

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

export const OUTREACH_SYSTEM_PROMPT = `
You are writing a cold outreach email on behalf of Chester Dyck at 7D Tech (7dtech.ca).

7D Tech's product is First Response Rx: when a prospect fills a contact form, a personalized reply is drafted in 30 seconds, the owner approves it with one tap, it sends.

RULES:
- Never mention AI, Claude, automation, bots, or technology
- Sell on outcome only: stop losing leads, faster response, more bookings
- Subject line: short, curiosity-driven, no spam triggers
- Email body: 4–6 sentences maximum
- Tone: direct, warm, peer-to-peer — not salesy
- End with one clear CTA: a 15-minute demo call
- Sign as Chester Dyck, 7D Tech, 7dtech.ca

Output format — respond with ONLY this, no other text:
SUBJECT: [subject line here]
BODY:
[email body here]
`.trim();

export async function draftOutreachEmail(
  input: DraftEmailInput
): Promise<DraftedEmail> {
  const vertical = VERTICALS.find((v) => v.id === input.vertical);
  const painPoints = vertical?.painPoints.join("\n- ") ?? "";
  const outcomeLanguage = vertical?.outcomeLanguage ?? "respond faster and book more clients";

  const userMessage = `
Business: ${input.businessName}
${input.ownerName ? `Owner: ${input.ownerName}` : ""}
Type: ${vertical?.name ?? input.vertical} in ${input.city}
${input.website ? `Website: ${input.website}` : ""}

Common pain points for this vertical:
- ${painPoints}

Outcome to sell: ${outcomeLanguage}

Write the cold email now.
`.trim();

  const res = await claude({
    system: OUTREACH_SYSTEM_PROMPT,
    userMessage,
    maxTokens: 500,
    label: "outreach:draft-email",
  });

  return parseEmailDraft(res.text, input.businessName);
}

function parseEmailDraft(text: string, businessName: string): DraftedEmail {
  const subjectMatch = text.match(/^SUBJECT:\s*(.+)$/m);
  const bodyMatch = text.match(/^BODY:\s*\n([\s\S]+)$/m);

  return {
    subject: subjectMatch?.[1]?.trim() ?? `Quick question for ${businessName}`,
    body: bodyMatch?.[1]?.trim() ?? text,
  };
}
