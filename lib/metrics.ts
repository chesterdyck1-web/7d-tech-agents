// Performance Metrics sheet read/write helpers.
// Used by the weekly performance cron, Coordinator daily brief, and Intelligence Agent.

import { readSheetAsObjects, appendToSheet, ensureSheetTab } from "@/lib/google-sheets";
import { BENCHMARKS } from "@/config/benchmarks";

// Mirrors the Performance Metrics sheet columns exactly.
export interface MetricRow {
  week_start: string;
  agent: string;
  metric_key: string;
  metric_name: string;
  metric_value: number;
  unit: string;
  target: number;
  alert_threshold: number;
  consecutive_weeks_below: number;
  flagged: boolean;
  notes: string;
}

export interface MetricInput {
  weekStart: string;  // ISO "YYYY-MM-DD" — always the Monday of the week
  agent: string;      // e.g. "outreach", "vapi", "fulfillment"
  metricKey: string;  // must match a key in BENCHMARKS
  value: number;
  notes?: string;
}

// Write one week's reading for a metric.
// Automatically calculates consecutive_weeks_below and the flagged flag.
export async function writeMetric(input: MetricInput): Promise<void> {
  await ensureSheetTab("Performance Metrics", [
    "week_start", "agent", "metric_key", "metric_name", "metric_value",
    "unit", "target", "alert_threshold", "consecutive_weeks_below", "flagged", "notes",
  ]);

  const benchmark = BENCHMARKS[input.metricKey];
  if (!benchmark) throw new Error(`Unknown metric key: "${input.metricKey}"`);

  const below = isBelowAlert(input.value, benchmark.alert, input.metricKey);

  // Count prior consecutive weeks below alert to determine if this week tips over the threshold
  const history = await getMetricHistory(input.metricKey, benchmark.consecutiveWeeksBeforeFlag);
  const priorConsecutiveBelow = countTrailingBelowAlert(history, input.metricKey);
  const consecutiveWeeksBelow = below ? priorConsecutiveBelow + 1 : 0;
  const flagged = consecutiveWeeksBelow >= benchmark.consecutiveWeeksBeforeFlag;

  await appendToSheet("Performance Metrics", [
    input.weekStart,
    input.agent,
    input.metricKey,
    benchmark.metric,
    input.value,
    benchmark.unit,
    benchmark.target,
    benchmark.alert,
    consecutiveWeeksBelow,
    flagged ? "TRUE" : "FALSE",
    input.notes ?? "",
  ]);
}

// Read the last N weeks of history for one metric key, oldest first.
export async function getMetricHistory(
  metricKey: string,
  weeks: number
): Promise<MetricRow[]> {
  const all = await readSheetAsObjects("Performance Metrics");
  return all
    .filter((r) => r["metric_key"] === metricKey)
    .map(toMetricRow)
    .slice(-weeks);
}

// Read all rows from the Performance Metrics sheet.
export async function readAllMetrics(): Promise<MetricRow[]> {
  const all = await readSheetAsObjects("Performance Metrics");
  return all.map(toMetricRow);
}

// Return the most recent row per metric key that is currently flagged.
// Used by Coordinator to build daily brief performance section.
export async function getFlaggedMetrics(): Promise<MetricRow[]> {
  const all = await readSheetAsObjects("Performance Metrics");

  // Keep only the most recent row per metric_key
  const latestByKey = new Map<string, Record<string, string>>();
  for (const row of all) {
    const key = row["metric_key"];
    if (key) latestByKey.set(key, row); // later rows overwrite earlier ones
  }

  return [...latestByKey.values()]
    .filter((r) => r["flagged"] === "TRUE")
    .map(toMetricRow);
}

// Returns true when a value is worse than the alert threshold.
// Time-based metrics flag HIGH values; all others flag LOW values.
export function isBelowAlert(value: number, alert: number, metricKey: string): boolean {
  if (metricKey === "fulfillment_time_to_live_hours") return value > alert;
  return value < alert;
}

// Count how many trailing rows in the history are consecutively below alert.
function countTrailingBelowAlert(rows: MetricRow[], metricKey: string): number {
  let count = 0;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (isBelowAlert(rows[i]!.metric_value, rows[i]!.alert_threshold, metricKey)) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

function toMetricRow(r: Record<string, string>): MetricRow {
  return {
    week_start: r["week_start"] ?? "",
    agent: r["agent"] ?? "",
    metric_key: r["metric_key"] ?? "",
    metric_name: r["metric_name"] ?? "",
    metric_value: Number(r["metric_value"] ?? 0),
    unit: r["unit"] ?? "",
    target: Number(r["target"] ?? 0),
    alert_threshold: Number(r["alert_threshold"] ?? 0),
    consecutive_weeks_below: Number(r["consecutive_weeks_below"] ?? 0),
    flagged: r["flagged"] === "TRUE",
    notes: r["notes"] ?? "",
  };
}
