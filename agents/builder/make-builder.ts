// Generates a Make.com scenario specification when the build spec requires it.
// Returns a human-readable blueprint (not a live API call) so Chester can
// build or clone the scenario in Make's UI with clear instructions.

import { claude } from "@/lib/claude";
import { getPromptOverride } from "@/lib/prompts";
import type { BuildSpec } from "./spec-parser";

export async function buildMakeSpec(spec: BuildSpec): Promise<string | null> {
  if (!spec.needsMake) return null;

  const MAKE_SYSTEM = `You are a Make.com automation expert writing a scenario specification for a non-technical founder.
The business uses Make.com to orchestrate webhooks, email triggers, and scheduled automations.
Write a clear, step-by-step Make scenario spec using plain English and Make's module names.
Format: numbered steps, each step = one Make module. Include the module type in parentheses.`;

  const system = (await getPromptOverride("builder", "make")) ?? MAKE_SYSTEM;
  const res = await claude({
    system,
    userMessage: `Write a Make.com scenario spec for this agent:

Agent: ${spec.agentDisplayName}
Purpose: ${spec.purpose}
Trigger: ${spec.trigger}
Inputs: ${spec.inputs.join(", ")}
Outputs: ${spec.outputs.join(", ")}

The scenario should connect to the agent's Next.js webhook at /api/webhooks/${spec.agentName}.
Include the watch trigger, any filters, the HTTP module to call the webhook, and any notification steps.`,
    maxTokens: 500,
    label: "builder:make-spec",
  });

  return res.text.trim();
}
