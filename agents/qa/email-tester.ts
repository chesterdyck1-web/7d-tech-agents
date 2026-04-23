// QA Agent — email checker.
// Validates cold email drafts before they go to Chester's approval queue.
// An email must pass ALL checks or it goes back to the drafter.

import type { DraftedEmail } from "@/agents/outreach/email-drafter";

export interface QAResult {
  passed: boolean;
  reasons: string[];
}

// Words/phrases that trigger spam filters or violate the no-AI rule
const SPAM_TRIGGERS = [
  "free", "guaranteed", "no obligation", "act now", "limited time",
  "click here", "unsubscribe",
];

const FORBIDDEN_TERMS = [
  "ai", "artificial intelligence", "claude", "automation", "automated",
  "bot", "chatbot", "machine learning", "algorithm",
];

export async function runEmailQA(draft: DraftedEmail): Promise<QAResult> {
  const reasons: string[] = [];
  const bodyLower = draft.body.toLowerCase();
  const subjectLower = draft.subject.toLowerCase();

  // Must not mention AI or automation
  for (const term of FORBIDDEN_TERMS) {
    if (bodyLower.includes(term) || subjectLower.includes(term)) {
      reasons.push(`Contains forbidden term: "${term}"`);
    }
  }

  // Must not have spam trigger words
  for (const trigger of SPAM_TRIGGERS) {
    if (bodyLower.includes(trigger)) {
      reasons.push(`Contains spam trigger word: "${trigger}"`);
    }
  }

  // Body must be between 50 and 500 words
  const wordCount = draft.body.split(/\s+/).length;
  if (wordCount < 50) {
    reasons.push(`Email body too short (${wordCount} words — minimum 50)`);
  }
  if (wordCount > 500) {
    reasons.push(`Email body too long (${wordCount} words — maximum 500)`);
  }

  // Must have a subject line
  if (!draft.subject || draft.subject.trim().length < 5) {
    reasons.push("Subject line missing or too short");
  }

  // Must mention a demo or call CTA
  const hasCTA =
    bodyLower.includes("demo") ||
    bodyLower.includes("15 minute") ||
    bodyLower.includes("15-minute") ||
    bodyLower.includes("call") ||
    bodyLower.includes("chat");

  if (!hasCTA) {
    reasons.push("No clear CTA (no mention of demo or call)");
  }

  // Must be signed by Chester / 7D Tech
  const hasSig =
    bodyLower.includes("chester") || bodyLower.includes("7d tech");
  if (!hasSig) {
    reasons.push("Missing signature (no mention of Chester or 7D Tech)");
  }

  return {
    passed: reasons.length === 0,
    reasons,
  };
}
