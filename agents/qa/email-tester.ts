// QA Agent — email checker.
// Validates cold email drafts before they go to Chester's approval queue.
// An email must pass ALL checks or it goes back to the drafter.

import type { DraftedEmail } from "@/agents/outreach/email-drafter";

export interface QAResult {
  passed: boolean;
  reasons: string[];
}

// Words/phrases that trigger spam filters or violate the no-AI rule.
// "free" is intentionally excluded — Chester's beta offer is genuinely free
// and "try it for free" is accurate, plain English, not a spam tactic.
const SPAM_TRIGGERS = [
  "guaranteed", "no obligation", "act now", "limited time",
  "click here", "unsubscribe",
];

// Use word-boundary regex so "ai" doesn't match "email", "said", "wait",
// "available", "claim", "daily", etc. — all common English words that
// happen to contain the substring "ai".
const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bai\b/i,                    label: "ai" },
  { pattern: /\bartificial intelligence\b/i, label: "artificial intelligence" },
  { pattern: /\bclaude\b/i,                label: "claude" },
  { pattern: /\bautomation\b/i,            label: "automation" },
  { pattern: /\bautomated\b/i,             label: "automated" },
  { pattern: /\bautomate\b/i,              label: "automate" },
  { pattern: /\bbot\b/i,                   label: "bot" },
  { pattern: /\bchatbot\b/i,               label: "chatbot" },
  { pattern: /\bmachine learning\b/i,      label: "machine learning" },
  { pattern: /\balgorithm\b/i,             label: "algorithm" },
];

export async function runEmailQA(draft: DraftedEmail): Promise<QAResult> {
  const reasons: string[] = [];
  const bodyLower = draft.body.toLowerCase();
  const subjectLower = draft.subject.toLowerCase();

  // Must not mention AI or automation (word-boundary safe)
  for (const { pattern, label } of FORBIDDEN_PATTERNS) {
    if (pattern.test(bodyLower) || pattern.test(subjectLower)) {
      reasons.push(`Contains forbidden term: "${label}"`);
    }
  }

  // Must not have spam trigger words
  for (const trigger of SPAM_TRIGGERS) {
    if (bodyLower.includes(trigger)) {
      reasons.push(`Contains spam trigger word: "${trigger}"`);
    }
  }

  // Body must be between 30 and 500 words.
  // Minimum is 30, not 50 — Chester's emails are intentionally short cold emails.
  // The reference email is ~65 words and tight variations can dip under 50.
  const wordCount = draft.body.split(/\s+/).length;
  if (wordCount < 30) {
    reasons.push(`Email body too short (${wordCount} words — minimum 30)`);
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
