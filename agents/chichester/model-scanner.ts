// Scans for newer Anthropic model versions and flags if the codebase is running an outdated model.
// Current model is hardcoded in lib/claude.ts — Chichester detects drift from the latest family.

import { claude } from "@/lib/claude";
import { getPromptOverride } from "@/lib/prompts";

export interface ModelFinding {
  currentModel: string;
  recommendation: string;
  severity: "info" | "warning";
}

// Known Claude model family — update this list when Anthropic releases new models.
const CURRENT_MODELS = {
  sonnet: "claude-sonnet-4-6",
  opus: "claude-opus-4-7",
  haiku: "claude-haiku-4-5-20251001",
};

// Model in use across the codebase (matches lib/claude.ts)
const ACTIVE_MODEL = "claude-sonnet-4-6";

const MODEL_EVAL_SYSTEM = `You are a technical advisor for a small AI automation agency.
The agency uses the Anthropic Claude API. Review whether the current model is still appropriate.
Current model: ${ACTIVE_MODEL}
Latest known models:
- Sonnet: ${CURRENT_MODELS.sonnet}
- Opus: ${CURRENT_MODELS.opus}
- Haiku: ${CURRENT_MODELS.haiku}

If the current model is still the latest Sonnet (best price/performance balance for this use case), reply: UP_TO_DATE
If a meaningfully newer model is available that the agency should consider upgrading to, reply on a single line:
UPGRADE_RECOMMENDED: [short reason — cost, capability, or deprecation risk]`;

export async function scanForModelUpdates(): Promise<ModelFinding | null> {
  const system = (await getPromptOverride("chichester", "model_scanner")) ?? MODEL_EVAL_SYSTEM;
  const res = await claude({
    system,
    userMessage: `Current date: ${new Date().toISOString().slice(0, 10)}. Is ${ACTIVE_MODEL} still the recommended model for a small B2B outreach automation agency that values cost efficiency?`,
    maxTokens: 100,
    label: "chichester:model-scan",
  });

  const text = res.text.trim();
  if (text === "UP_TO_DATE") return null;

  const match = text.match(/^UPGRADE_RECOMMENDED:\s+(.+)/i);
  if (match) {
    return {
      currentModel: ACTIVE_MODEL,
      recommendation: match[1]!,
      severity: "warning",
    };
  }

  return null;
}
