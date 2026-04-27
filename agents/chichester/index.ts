// Chichester — CTO Agent.
// Runs weekly on Mondays at 10 AM UTC.
// Monitors: AI model currency, npm dependency health.
// Silent when all clear; alerts Chester with a tech brief when action is needed.

import { sendToChester } from "@/lib/telegram";
import { log } from "@/lib/logger";
import { scanForModelUpdates } from "./model-scanner";
import { checkStackHealth } from "./stack-monitor";

export async function runTechReview(): Promise<void> {
  const [modelFinding, outdatedPackages] = await Promise.all([
    scanForModelUpdates().catch((err) => {
      void log({ agent: "chichester", action: "model_scan_failed", status: "failure", errorMessage: String(err) });
      return null;
    }),
    checkStackHealth().catch((err) => {
      void log({ agent: "chichester", action: "stack_check_failed", status: "failure", errorMessage: String(err) });
      return [];
    }),
  ]);

  const sections: string[] = [];

  if (modelFinding) {
    sections.push(
      `*AI Model Update*\nCurrently running: \`${modelFinding.currentModel}\`\n${modelFinding.recommendation}\n\n_Reply "build upgrade model" to open a PR._`
    );
  }

  if (outdatedPackages.length > 0) {
    const lines = outdatedPackages
      .sort((a, b) => b.majorsBehind - a.majorsBehind)
      .map((p) => `• \`${p.name}\`: v${p.installed} → v${p.latest} (${p.majorsBehind} major${p.majorsBehind > 1 ? "s" : ""} behind)`)
      .join("\n");
    sections.push(`*Outdated Packages*\n${lines}`);
  }

  await log({
    agent: "chichester",
    action: "tech_review_complete",
    status: "success",
    metadata: {
      modelFlagged: modelFinding !== null,
      outdatedPackages: outdatedPackages.length,
    } as unknown as Record<string, unknown>,
  });

  if (sections.length === 0) return;

  const message = `*CHICHESTER — Weekly Tech Brief*\n\n${sections.join("\n\n")}`;
  await sendToChester(message);
}

// Returns a short tech summary for the coordinator's view_tech_brief intent.
export async function getTechBrief(): Promise<string> {
  const [modelFinding, outdatedPackages] = await Promise.all([
    scanForModelUpdates().catch(() => null),
    checkStackHealth().catch(() => []),
  ]);

  if (!modelFinding && outdatedPackages.length === 0) {
    return "Tech stack is current. No action needed.";
  }

  const parts: string[] = [];
  if (modelFinding) parts.push(`Model update available: ${modelFinding.recommendation}`);
  if (outdatedPackages.length > 0) {
    parts.push(`${outdatedPackages.length} package${outdatedPackages.length > 1 ? "s" : ""} with major updates: ${outdatedPackages.map((p) => p.name).join(", ")}`);
  }
  return parts.join("\n");
}
