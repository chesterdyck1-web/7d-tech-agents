// Estimates API operating costs from usage data and known pricing.
// Anthropic: estimated from Action Log call count × avg token cost.
// Vapi: call count × avg duration × per-minute rate.
// Make.com: scenario execution count × per-operation rate.
// All costs converted to CAD (1 USD ≈ 1.37 CAD approximation).

import { readSheetAsObjects } from "@/lib/google-sheets";
import { listScenarios } from "@/lib/make";

const USD_TO_CAD = 1.37;

// Anthropic pricing (claude-sonnet-4-6 approximate)
const ANTHROPIC_INPUT_PER_M_USD = 3.0;
const ANTHROPIC_OUTPUT_PER_M_USD = 15.0;
const AVG_INPUT_TOKENS = 800;
const AVG_OUTPUT_TOKENS = 250;

// Vapi pricing: ~$0.05 USD per minute
const VAPI_PER_MIN_USD = 0.05;
const AVG_CALL_DURATION_MIN = 1.5;

// Make.com: ~$0.001 USD per operation, ~5 operations per execution
const MAKE_PER_EXECUTION_USD = 0.005;

function isInLast30Days(dateStr: string): boolean {
  if (!dateStr) return false;
  return new Date(dateStr) >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
}

export interface CostSnapshot {
  anthropicCostCad: number;
  vapiCostCad: number;
  makeCostCad: number;
  totalCogsCad: number;
}

export async function estimateCosts(): Promise<CostSnapshot> {
  const actionLog = await readSheetAsObjects("Action Log");
  const recentEntries = actionLog.filter((r) => isInLast30Days(r["timestamp"] ?? ""));

  // Anthropic: count distinct Claude calls (coordinator, outreach, content, etc.)
  const claudeCalls = recentEntries.filter(
    (r) =>
      r["action"]?.includes("classify") ||
      r["action"]?.includes("draft") ||
      r["action"]?.includes("analyze") ||
      r["action"]?.includes("caption") ||
      r["action"]?.includes("answer") ||
      r["agent"] === "intelligence" ||
      r["agent"] === "red-team" ||
      r["agent"] === "builder"
  ).length;

  const anthropicCostUsd =
    claudeCalls *
    ((AVG_INPUT_TOKENS * ANTHROPIC_INPUT_PER_M_USD) / 1_000_000 +
      (AVG_OUTPUT_TOKENS * ANTHROPIC_OUTPUT_PER_M_USD) / 1_000_000);

  // Vapi: count call actions
  const vapiCalls = recentEntries.filter(
    (r) => r["action"] === "vapi_call_triggered"
  ).length;
  const vapiCostUsd = vapiCalls * AVG_CALL_DURATION_MIN * VAPI_PER_MIN_USD;

  // Make: count scenario execution actions
  const makeExecutions = recentEntries.filter(
    (r) =>
      r["action"]?.includes("make") ||
      r["action"]?.includes("scenario") ||
      r["action"]?.includes("webhook")
  ).length;
  const makeCostUsd = makeExecutions * MAKE_PER_EXECUTION_USD;

  const totalCostUsd = anthropicCostUsd + vapiCostUsd + makeCostUsd;

  return {
    anthropicCostCad: Math.round(anthropicCostUsd * USD_TO_CAD * 100) / 100,
    vapiCostCad: Math.round(vapiCostUsd * USD_TO_CAD * 100) / 100,
    makeCostCad: Math.round(makeCostUsd * USD_TO_CAD * 100) / 100,
    totalCogsCad: Math.round(totalCostUsd * USD_TO_CAD * 100) / 100,
  };
}
