// Generates a Vapi assistant configuration when the build spec requires a voice call component.
// Returns a human-readable script and variable list — Chester configures the assistant in Vapi's dashboard.

import { claude } from "@/lib/claude";
import type { BuildSpec } from "./spec-parser";

export async function buildVapiConfig(spec: BuildSpec): Promise<string | null> {
  if (!spec.needsVapi) return null;

  const res = await claude({
    system: `You are writing a Vapi phone call script for an AI automation agency targeting Canadian service businesses.

Rules:
- Never mention AI, Claude, bots, or automation
- Sell on outcome only (speed, response time, more bookings)
- Script sections: GREETING (5s), HOOK (10s), OFFER (10s), CLOSE, and objection handlers
- Use {{variableName}} for dynamic values that get injected per call
- List all required variables at the top`,
    userMessage: `Write a Vapi call script for this agent:

Agent: ${spec.agentDisplayName}
Purpose: ${spec.purpose}
Trigger: ${spec.trigger}

Include:
1. Required variable list (name, description)
2. Full call script with section labels
3. Objection handler branches
4. Outcome logging instructions (what to record for each call result)`,
    maxTokens: 600,
    label: "builder:vapi-config",
  });

  return res.text.trim();
}
