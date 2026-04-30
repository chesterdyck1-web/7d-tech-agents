// Parses Chester's plain-English build request into a structured spec.
// This is the first step — everything else flows from the spec.

import { claude } from "@/lib/claude";
import { getPromptOverride } from "@/lib/prompts";

export interface BuildSpec {
  agentName: string;           // kebab-case, e.g. "welcome-mailer"
  agentDisplayName: string;    // human name, e.g. "Welcome Mailer"
  purpose: string;             // one sentence
  trigger: string;             // what starts this agent
  inputs: string[];            // data it needs to run
  outputs: string[];           // what it produces or does
  sheetsNeeded: string[];      // Google Sheets tabs to create/use
  needsMake: boolean;          // requires a Make.com scenario
  needsVapi: boolean;          // requires a Vapi voice call component
  keyFunctions: { name: string; description: string }[];
  needsApproval: boolean;      // does Chester approve an action before it fires?
  rawRequest: string;
}

const PARSE_SYSTEM = `
You are a software architect parsing a build request for an AI automation agency's agent system.
The system is built in TypeScript/Next.js. Agents use Google Sheets as a database, Claude as AI,
Make.com for automation flows, and Vapi for phone calls.

Parse the request into a structured JSON spec. Follow these rules:
- agentName: kebab-case, short (e.g. "welcome-mailer", "review-requester")
- purpose: one sentence maximum
- trigger: what event or command starts this agent
- inputs: specific data fields the agent needs
- outputs: concrete results (emails sent, rows written, Telegram messages, etc.)
- sheetsNeeded: only new sheet tabs required — do not list existing ones
- needsMake: true only if a Make.com automation scenario is needed
- needsVapi: true only if a phone call component is needed
- keyFunctions: 2–5 TypeScript function names with a one-line description each
- needsApproval: true if Chester must approve before anything is sent to a client or prospect

Reply with ONLY valid JSON matching this exact shape — no markdown, no explanation.
`.trim();

export async function parseSpec(rawRequest: string): Promise<BuildSpec> {
  const system = (await getPromptOverride("builder", "spec")) ?? PARSE_SYSTEM;
  const res = await claude({
    system,
    userMessage: `Parse this build request:

"${rawRequest}"`,
    maxTokens: 600,
    label: "builder:parse-spec",
  });

  let parsed: Partial<BuildSpec>;
  try {
    parsed = JSON.parse(res.text.trim()) as Partial<BuildSpec>;
  } catch {
    throw new Error(`Beau could not parse the spec from Claude's response. Try rephrasing the request with more detail.`);
  }

  // Fill in any missing fields with safe defaults
  return {
    agentName: parsed.agentName ?? "unnamed-agent",
    agentDisplayName: parsed.agentDisplayName ?? "Unnamed Agent",
    purpose: parsed.purpose ?? rawRequest.slice(0, 100),
    trigger: parsed.trigger ?? "manual command",
    inputs: parsed.inputs ?? [],
    outputs: parsed.outputs ?? [],
    sheetsNeeded: parsed.sheetsNeeded ?? [],
    needsMake: parsed.needsMake ?? false,
    needsVapi: parsed.needsVapi ?? false,
    keyFunctions: parsed.keyFunctions ?? [],
    needsApproval: parsed.needsApproval ?? true,
    rawRequest,
  };
}
