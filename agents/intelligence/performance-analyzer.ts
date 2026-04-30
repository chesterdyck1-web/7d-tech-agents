// Analyzes the last 4 weeks of Performance Metrics to surface trends and patterns.
// Tells Chester whether things are improving, declining, or stuck — and why it matters.

import { readAllMetrics, type MetricRow } from "@/lib/metrics";
import { claude } from "@/lib/claude";
import { getPromptOverride } from "@/lib/prompts";

function buildTrendSummary(metrics: MetricRow[]): string {
  if (metrics.length === 0) return "No performance data recorded yet.";

  // Group by metric_key, keep only the most recent 4 weeks per key
  const byKey = new Map<string, MetricRow[]>();
  for (const row of metrics) {
    const existing = byKey.get(row.metric_key) ?? [];
    existing.push(row);
    byKey.set(row.metric_key, existing);
  }

  const lines: string[] = [];

  for (const [key, rows] of byKey) {
    const recent = rows.slice(-4); // last 4 weeks
    if (recent.length === 0) continue;

    const latest = recent[recent.length - 1]!;
    const earliest = recent[0]!;
    const trend =
      recent.length < 2
        ? "only 1 data point"
        : latest.metric_value > earliest.metric_value
        ? "improving"
        : latest.metric_value < earliest.metric_value
        ? "declining"
        : "stable";

    lines.push(
      `${latest.metric_name}: ${latest.metric_value}${latest.unit} (target ${latest.target}${latest.unit}) — ${trend}${latest.flagged ? " ⚠ FLAGGED" : ""}`
    );
  }

  return lines.join("\n");
}

export async function analyzePerformance(): Promise<string> {
  const metrics = await readAllMetrics();

  if (metrics.length === 0) {
    return "No performance data yet — check back after the first full week of operation.";
  }

  const trendSummary = buildTrendSummary(metrics);

  const PERF_SYSTEM = "You are a business performance analyst for Chester, a non-technical founder running an AI automation agency. Write in plain English — no jargon.";
  const analysis = await claude({
    system: (await getPromptOverride("intelligence", "performance")) ?? PERF_SYSTEM,
    userMessage: `Here are this week's agent performance metrics. Write a 3–5 sentence summary covering: what is working well, what needs attention, and one actionable recommendation. Flag anything critical first.

Metrics:
${trendSummary}`,
    maxTokens: 250,
    label: "intelligence:analyze-performance",
  });

  return analysis.text.trim();
}
