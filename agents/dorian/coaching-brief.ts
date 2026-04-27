// Generates a weekly coaching brief from call pattern analysis.
// Gives Chester actionable tips to improve call outcomes and close rate.

import { claude } from "@/lib/claude";
import { type CallPattern } from "./call-analyzer";

const COACHING_SYSTEM = `You are a sales coach writing a brief weekly coaching note for a solo business owner.
He runs an AI company selling a $50/month product to Canadian small businesses via cold calls.
Be direct, warm, and actionable. Max 3 bullet points. No jargon. Plain English.
Start with one sentence summarizing call performance this week.`;

export async function generateCoachingBrief(pattern: CallPattern): Promise<string> {
  if (pattern.completedCalls === 0) {
    return `No calls completed this week. If outreach emails are being sent, ask Vapi if the call assistant is active.`;
  }

  const context = `
Calls this week: ${pattern.totalCalls} total, ${pattern.completedCalls} completed
Average call length: ${Math.round(pattern.avgDurationSeconds / 60 * 10) / 10} minutes

Top objections heard:
${pattern.topObjections.map((o) => `- ${o}`).join("\n") || "- None detected"}

Drop-off points:
${pattern.commonDropOffPoints.map((d) => `- ${d}`).join("\n") || "- None detected"}

Positive signals (prospects who engaged):
${pattern.positiveSignals.map((s) => `- ${s}`).join("\n") || "- None detected"}
`.trim();

  const res = await claude({
    system: COACHING_SYSTEM,
    userMessage: context,
    maxTokens: 250,
    label: "dorian:coaching-brief",
  });

  return res.text.trim();
}
