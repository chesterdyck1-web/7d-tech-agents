// QA Agent — output reviewer.
// Reviews text produced by any agent for completeness, accuracy, and forbidden content.
// Used before agent output is sent to Chester or to clients.

export interface OutputReviewResult {
  passed: boolean;
  reasons: string[];
}

const PLACEHOLDER_PATTERNS = [
  /\[NAME\]/i,
  /\[INSERT/i,
  /\[YOUR/i,
  /\[BUSINESS/i,
  /TODO:/i,
  /PLACEHOLDER/i,
  /FILL IN/i,
  /\.\.\.\s*$/,   // ends with ellipsis (truncated)
];

const AI_MENTIONS = [
  "ai", "artificial intelligence", "claude", "automation", "automated",
  "bot", "chatbot", "machine learning", "algorithm", "language model",
];

export function runOutputReview(
  text: string,
  label: string
): OutputReviewResult {
  const reasons: string[] = [];
  const trimmed = text.trim();

  if (!trimmed) {
    reasons.push(`${label}: output is empty`);
    return { passed: false, reasons };
  }

  // Minimum length — 20 words
  const wordCount = trimmed.split(/\s+/).length;
  if (wordCount < 20) {
    reasons.push(`${label}: output too short (${wordCount} words — minimum 20)`);
  }

  // No unfilled template placeholders
  for (const pattern of PLACEHOLDER_PATTERNS) {
    if (pattern.test(trimmed)) {
      reasons.push(`${label}: contains placeholder text matching ${pattern}`);
    }
  }

  // No AI/automation mentions (client-facing outputs only reveal this check if label says "client")
  if (label.toLowerCase().includes("client") || label.toLowerCase().includes("email")) {
    const lower = trimmed.toLowerCase();
    for (const term of AI_MENTIONS) {
      if (lower.includes(term)) {
        reasons.push(`${label}: mentions AI-related term "${term}"`);
      }
    }
  }

  // Must end with proper sentence punctuation (not mid-thought)
  const lastChar = trimmed.slice(-1);
  if (![" ", ".", "!", "?", '"', "'"].includes(lastChar) && wordCount > 30) {
    reasons.push(`${label}: output appears to be cut off (does not end with punctuation)`);
  }

  return { passed: reasons.length === 0, reasons };
}
