// Dorian — Audit and Sales Intelligence Agent.
// Runs weekly on Fridays at 8 AM UTC for sales review.
// Also triggered by Chester ("audit [name] [url]") for pre-call briefing within 30 minutes.
// Diagnose before we prescribe — Dorian makes Chester unstoppable on every demo call.

import { sendToChester } from "@/lib/telegram";
import { log } from "@/lib/logger";
import { analyzeRecentCalls } from "./call-analyzer";
import { generateCoachingBrief } from "./coaching-brief";
import { proposeScriptUpdate } from "./script-updater";

export async function runSalesReview(): Promise<void> {
  const pattern = await analyzeRecentCalls().catch((err) => {
    void log({ agent: "dorian", action: "call_analysis_failed", status: "failure", errorMessage: String(err) });
    return null;
  });

  if (!pattern) return;

  const [brief, scriptProposal] = await Promise.all([
    generateCoachingBrief(pattern).catch(() => "Unable to generate coaching brief this week."),
    proposeScriptUpdate(pattern).catch(() => null),
  ]);

  await log({
    agent: "dorian",
    action: "sales_review_complete",
    status: "success",
    metadata: {
      totalCalls: pattern.totalCalls,
      completedCalls: pattern.completedCalls,
      avgDurationSec: pattern.avgDurationSeconds,
      scriptProposalQueued: scriptProposal !== null,
    } as unknown as Record<string, unknown>,
  });

  let message = `*DORIAN — Weekly Sales Brief*\n\n${brief}`;

  if (pattern.topObjections.length > 0) {
    message += `\n\n*Top objections this week:*\n${pattern.topObjections.map((o) => `• ${o}`).join("\n")}`;
  }

  if (scriptProposal) {
    message += `\n\n*Script update queued for your approval*\n_${scriptProposal.change}_\nCheck Approval Queue for details.`;
  }

  message += `\n\n_${pattern.completedCalls} calls completed — avg ${Math.round(pattern.avgDurationSeconds / 60 * 10) / 10} min_`;

  await sendToChester(message);
}

// Returns the latest coaching brief for the coordinator's view_coaching intent.
// Format matches the skill spec: based on recent call patterns, vertical-specific guidance.
export async function getCoachingBrief(): Promise<string> {
  const pattern = await analyzeRecentCalls().catch(() => null);
  if (!pattern) return "Unable to retrieve call data right now. No Vapi call data available.";

  const brief = await generateCoachingBrief(pattern);
  const lines = [
    `*DORIAN — Sales Coaching Brief*`,
    `Based on your last ${pattern.totalCalls} calls (${pattern.completedCalls} completed):`,
    "",
    brief,
  ];

  if (pattern.topObjections.length > 0) {
    lines.push("", `*Most common objections:*`);
    pattern.topObjections.slice(0, 3).forEach((o, i) => lines.push(`${i + 1}. ${o}`));
  }

  lines.push("", `_${Math.round(pattern.avgDurationSeconds / 60 * 10) / 10} min avg call length_`);

  return lines.join("\n");
}
