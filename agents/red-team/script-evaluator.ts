// Evaluates the outreach email prompt and Vapi call script for quality issues.
// Looks for: AI mentions that slipped through, spam triggers, weak CTAs, legal risk, tone problems.
// Red-teaming the scripts monthly catches drift before it hurts conversion.

import { claude } from "@/lib/claude";
import { getPromptOverride } from "@/lib/prompts";
import { OUTREACH_SYSTEM_PROMPT } from "@/agents/outreach/email-drafter";
import { VAPI_CALL_SCRIPT } from "@/config/vapi-scripts";
import type { Severity } from "./log-auditor";

export interface ScriptIssue {
  script: "outreach_email" | "vapi_call";
  severity: Severity;
  description: string;
}

const EVAL_SYSTEM = `
You are a red-team reviewer for an AI automation agency's sales scripts.
The business sells First Response Rx to Canadian service businesses.

Evaluate against these criteria:
1. AI / automation mentions — any reference to AI, bots, Claude, automation is a CRITICAL failure
2. Spam trigger words — words that get emails filtered (guarantee, free, limited time, act now, etc.)
3. CTA clarity — is there exactly one clear ask?
4. Legal compliance — no false guarantees, no misleading claims
5. Tone fit — peer-to-peer, direct, not pushy or corporate
6. Effectiveness — is the core value proposition clear and compelling?

Respond in this exact format (one line per issue):
[SEVERITY] script_name: specific description of the issue

Severity levels: CRITICAL / HIGH / MEDIUM / LOW
If no issues: reply "No issues found."
`.trim();

async function evaluateEmailPrompt(): Promise<ScriptIssue[]> {
  const system = (await getPromptOverride("red_team", "script_eval")) ?? EVAL_SYSTEM;
  const res = await claude({
    system,
    userMessage: `Evaluate this outreach email system prompt:

${OUTREACH_SYSTEM_PROMPT}`,
    maxTokens: 300,
    label: "red-team:evaluate-email-prompt",
  });

  return parseIssues(res.text, "outreach_email");
}

async function evaluateVapiScript(): Promise<ScriptIssue[]> {
  const system = (await getPromptOverride("red_team", "script_eval")) ?? EVAL_SYSTEM;
  const res = await claude({
    system,
    userMessage: `Evaluate this Vapi phone call script:

${VAPI_CALL_SCRIPT}`,
    maxTokens: 300,
    label: "red-team:evaluate-vapi-script",
  });

  return parseIssues(res.text, "vapi_call");
}

function parseIssues(
  text: string,
  script: ScriptIssue["script"]
): ScriptIssue[] {
  if (text.toLowerCase().includes("no issues found")) return [];

  const lines = text.split("\n").filter((l) => l.trim());
  const issues: ScriptIssue[] = [];

  for (const line of lines) {
    const match = line.match(/^\[(CRITICAL|HIGH|MEDIUM|LOW)\]\s+(.+)/i);
    if (!match) continue;
    const sev = match[1]!.toLowerCase() as Severity;
    issues.push({ script, severity: sev, description: match[2]!.trim() });
  }

  return issues;
}

export async function evaluateScripts(): Promise<{ issues: ScriptIssue[]; summary: string }> {
  const [emailIssues, vapiIssues] = await Promise.all([
    evaluateEmailPrompt().catch(() => [] as ScriptIssue[]),
    evaluateVapiScript().catch(() => [] as ScriptIssue[]),
  ]);

  const allIssues = [...emailIssues, ...vapiIssues];

  if (allIssues.length === 0) {
    return { issues: [], summary: "Both scripts passed red-team review. No issues found." };
  }

  const lines = allIssues.map(
    (issue) =>
      `• [${issue.severity.toUpperCase()}] ${issue.script === "outreach_email" ? "Email prompt" : "Vapi script"}: ${issue.description}`
  );

  return {
    issues: allIssues,
    summary: `${allIssues.length} issue${allIssues.length !== 1 ? "s" : ""} found:\n${lines.join("\n")}`,
  };
}
