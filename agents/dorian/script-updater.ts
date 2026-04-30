// Proposes Vapi call script improvements based on objection patterns.
// Writes proposals to the Approval Queue — Chester approves before any script change is made.
// Script updates are NEVER applied automatically.

import { claude } from "@/lib/claude";
import { getPromptOverride } from "@/lib/prompts";
import { appendToSheet } from "@/lib/google-sheets";
import { type CallPattern } from "./call-analyzer";

const SCRIPT_SYSTEM = `You are a cold call script writer for a B2B SaaS product.
Product: "First Response Rx" — AI that auto-replies to contact form submissions. $50/month.
Target: Canadian small businesses (gyms, photographers, massage therapists, chiropractors, landscapers).

Based on the objection patterns provided, draft ONE specific script improvement.
Focus on the single highest-impact change — a better rebuttal, a stronger opener, or a clearer value statement.

Format:
CHANGE: [what to change — one sentence]
CURRENT: [the problematic part of the script, if known, or "opener" / "value pitch" / "close"]
PROPOSED: [the new line or section — max 2 sentences]
REASON: [why this will improve close rate — one sentence]`;

export interface ScriptProposal {
  change: string;
  current: string;
  proposed: string;
  reason: string;
}

function parseProposal(text: string): ScriptProposal | null {
  const change = text.match(/^CHANGE:\s+(.+)/m)?.[1]?.trim() ?? "";
  const current = text.match(/^CURRENT:\s+(.+)/m)?.[1]?.trim() ?? "";
  const proposed = text.match(/^PROPOSED:\s+(.+)/m)?.[1]?.trim() ?? "";
  const reason = text.match(/^REASON:\s+(.+)/m)?.[1]?.trim() ?? "";
  if (!change || !proposed) return null;
  return { change, current, proposed, reason };
}

// Generates and queues a script improvement proposal for Chester's approval.
// Only runs when there's enough call data to spot a pattern.
export async function proposeScriptUpdate(pattern: CallPattern): Promise<ScriptProposal | null> {
  if (pattern.completedCalls < 5 || pattern.topObjections.length === 0) return null;

  const context = `
Top objections this week:
${pattern.topObjections.map((o, i) => `${i + 1}. ${o}`).join("\n")}

Common drop-off points:
${pattern.commonDropOffPoints.map((d, i) => `${i + 1}. ${d}`).join("\n") || "No clear drop-off pattern"}

Average call length: ${Math.round(pattern.avgDurationSeconds / 60 * 10) / 10} minutes
`.trim();

  const system = (await getPromptOverride("dorian", "script")) ?? SCRIPT_SYSTEM;
  const res = await claude({
    system,
    userMessage: context,
    maxTokens: 300,
    label: "dorian:script-proposal",
  });

  const proposal = parseProposal(res.text);
  if (!proposal) return null;

  // Queue the proposal for Chester's approval — it's never applied automatically
  const approvalId = `script-${new Date().toISOString().slice(0, 10)}`;
  await appendToSheet("Approval Queue", [
    approvalId,
    new Date().toISOString(),
    "script_update",
    "Vapi Call Script",
    "vapi-script",
    `CHANGE: ${proposal.change}\n\nCURRENT: ${proposal.current}\n\nPROPOSED: ${proposal.proposed}\n\nREASON: ${proposal.reason}`,
    "",
    "pending",
    "",
    "",
  ]);

  return proposal;
}
