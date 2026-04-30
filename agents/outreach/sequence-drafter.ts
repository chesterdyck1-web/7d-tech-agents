// Drafts follow-up emails for steps 1–4 of the outreach sequence.
// Each step has a different tone: warmer → more direct → final check-in → breakup.
// Never mention AI, automation, Claude, or software.

import { claude } from "@/lib/claude";
import type { DraftedEmail } from "./email-drafter";
import { getPromptOverride } from "@/lib/prompts";
import { STEP_NAMES } from "./sequence-engine";

const FOLLOWUP_SYSTEM_PROMPTS: Record<number, string> = {
  1: `
You are writing a Day 2 follow-up email for Chester Dyck at 7D Tech (7dtech.ca).

Context: Chester sent a cold email two days ago about a product called First Response Rx.
The prospect has not replied. This is a short, low-pressure nudge.

CHESTER'S VOICE: direct, conversational, lightly self-aware that this is a follow-up.
LENGTH: 3-4 sentences including the sign-off.

RULES:
- Do NOT recap the product. One line acknowledging the follow-up. One gentle question.
- NEVER use: AI, automation, bot, software, algorithm, technology, system, platform, free
- USE: "personalized reply", "fires off", "instant follow-up"
- No exclamation marks. No "I just wanted to follow up."
- Sign off: Chester / 7D Tech
- Subject: lowercase, under 8 words

Output format — ONLY this:
SUBJECT: [subject line]
BODY:
[email body]
  `.trim(),

  2: `
You are writing a Day 5 follow-up email for Chester Dyck at 7D Tech (7dtech.ca).

Context: Chester sent a cold email and one follow-up. The prospect still hasn't replied.
This email takes a slightly different angle — instead of the same pitch, it asks a direct
question or makes a brief observation specific to their vertical.

CHESTER'S VOICE: still casual, slightly more direct, no desperation.
LENGTH: 3-4 sentences including the sign-off.

RULES:
- New angle — do not repeat the first email word-for-word
- Ask one specific question related to their business situation
- NEVER use: AI, automation, bot, software, algorithm, technology, system, platform, free
- No exclamation marks
- Sign off: Chester / 7D Tech
- Subject: different from previous subjects, lowercase, under 8 words

Output format — ONLY this:
SUBJECT: [subject line]
BODY:
[email body]
  `.trim(),

  3: `
You are writing a Day 14 follow-up email for Chester Dyck at 7D Tech (7dtech.ca).

Context: This is the third follow-up. The prospect has not replied to any of Chester's emails.
Chester is giving it one more genuine try before moving on. Tone: honest, low pressure, brief.

CHESTER'S VOICE: acknowledges the silence directly, no guilt-tripping, keeps the door open.
LENGTH: 3-4 sentences including the sign-off.

RULES:
- Acknowledge you've reached out a few times, keep it light
- Make it easy for them to say yes OR just ignore this one
- NEVER use: AI, automation, bot, software, algorithm, technology, system, platform, free
- No exclamation marks
- Sign off: Chester / 7D Tech
- Subject: lowercase, under 8 words

Output format — ONLY this:
SUBJECT: [subject line]
BODY:
[email body]
  `.trim(),

  4: `
You are writing a final "breakup" email for Chester Dyck at 7D Tech (7dtech.ca).

Context: Chester has sent four emails. No reply. This is the last one — ever. It should be
warm, genuinely human, and leave a positive impression. No hard feelings. Door stays open.

CHESTER'S VOICE: gracious, a little self-aware about the email sequence, zero pressure.
LENGTH: 3-5 sentences including the sign-off.

RULES:
- Make it clear this is the last email (without being dramatic about it)
- Keep the door open — "if the timing ever changes"
- Can have a slight dry humor element
- NEVER use: AI, automation, bot, software, algorithm, technology, system, platform, free
- No exclamation marks
- Sign off: Chester / 7D Tech
- Subject: lowercase, under 8 words

Output format — ONLY this:
SUBJECT: [subject line]
BODY:
[email body]
  `.trim(),
};

export async function draftFollowUpEmail(
  step: number,
  businessName: string,
  ownerName: string | undefined,
  vertical: string,
  city: string
): Promise<DraftedEmail> {
  const systemKey = `outreach_followup_step${step}`;
  const hardcoded = FOLLOWUP_SYSTEM_PROMPTS[step];
  if (!hardcoded) throw new Error(`No follow-up prompt for step ${step}`);

  const systemPrompt = (await getPromptOverride("outreach", systemKey)) ?? hardcoded;

  const greeting = ownerName ? `Hi ${ownerName},` : "Hi there,";

  const userMessage = `
Business name: ${businessName}
Vertical: ${vertical} in ${city}
Greeting to use: ${greeting}
Step: ${STEP_NAMES[step] ?? "followup"}

Write the email now.
`.trim();

  const res = await claude({
    system: systemPrompt,
    userMessage,
    maxTokens: 300,
    label: `outreach:followup-step${step}`,
  });

  return parseFollowUpDraft(res.text, businessName);
}

function parseFollowUpDraft(text: string, businessName: string): DraftedEmail {
  const subjectMatch = text.match(/^SUBJECT:\s*(.+)$/m);
  const bodyMatch = text.match(/^BODY:\s*\n([\s\S]+)$/m);

  return {
    subject: subjectMatch?.[1]?.trim() ?? `following up — ${businessName}`,
    body: bodyMatch?.[1]?.trim() ?? text,
  };
}
