// Performance Agent — computes weekly KPI metrics from live sheet data.
// Runs Monday 6 AM ET before the Intelligence Agent brief.
// Writes one row per metric to the Performance Metrics sheet via lib/metrics.ts.

import { readSheetAsObjects } from "@/lib/google-sheets";
import { writeMetric } from "@/lib/metrics";
import { log } from "@/lib/logger";

// Returns the ISO date of the Monday that began last week.
// Cron fires on Monday, so "last week" = 7 days ago.
function getLastMondayISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}

// Returns true if an ISO date string falls within the last 7 days.
function isInLastWeek(dateStr: string): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return d >= weekAgo && d <= new Date();
}

export async function runPerformanceReview(): Promise<void> {
  const weekStart = getLastMondayISO();

  // Run all computable metrics in parallel — each silently skips if no data
  await Promise.all([
    computeClientApprovalRate(weekStart),
    computeVapiMetrics(weekStart),
    computeQAPassRate(weekStart),
    computeFulfillmentTime(weekStart),
    computeIntelBriefRating(weekStart),
    computeContentEngagement(weekStart),
    // Outreach open/reply rates: require email tracking pixel (future)
  ]);

  await log({
    agent: "coordinator",
    action: "weekly_performance_review_complete",
    status: "success",
    metadata: { weekStart } as unknown as Record<string, unknown>,
  });
}

async function computeClientApprovalRate(weekStart: string): Promise<void> {
  try {
    const rows = await readSheetAsObjects("Approval Queue");
    const decided = rows.filter(
      (r) =>
        r["type"] === "client_response" &&
        isInLastWeek(r["decided_at"] ?? "") &&
        (r["status"] === "approved" || r["status"] === "rejected")
    );

    if (decided.length === 0) return; // no data — skip this week rather than writing 0

    const approved = decided.filter((r) => r["status"] === "approved").length;
    const rate = Math.round((approved / decided.length) * 100);

    await writeMetric({
      weekStart,
      agent: "fulfillment",
      metricKey: "client_approval_rate",
      value: rate,
      notes: `${approved} of ${decided.length} approved`,
    });
  } catch (err) {
    await log({
      agent: "coordinator",
      action: "compute_client_approval_rate",
      status: "failure",
      errorMessage: String(err),
    });
  }
}

async function computeVapiMetrics(weekStart: string): Promise<void> {
  try {
    const rows = await readSheetAsObjects("Daily Leads");
    const calledLeads = rows.filter(
      (r) => isInLastWeek(r["date"] ?? "") && r["call_status"] && r["call_status"] !== ""
    );

    if (calledLeads.length === 0) return;

    const BAD_OUTCOMES = new Set(["no-answer", "busy", "failed", "error", "voicemail"]);
    const answered = calledLeads.filter((r) => !BAD_OUTCOMES.has(r["call_status"] ?? ""));
    const answerRate = Math.round((answered.length / calledLeads.length) * 100);

    await writeMetric({
      weekStart,
      agent: "vapi",
      metricKey: "vapi_answer_rate",
      value: answerRate,
      notes: `${answered.length} of ${calledLeads.length} calls answered`,
    });

    if (answered.length === 0) return;

    const BOOKING_KEYWORDS = ["booked", "booking", "appointment", "scheduled", "demo"];
    const booked = answered.filter((r) => {
      const summary = (r["call_summary"] ?? "").toLowerCase();
      return BOOKING_KEYWORDS.some((kw) => summary.includes(kw));
    });
    const bookingRate = Math.round((booked.length / answered.length) * 100);

    await writeMetric({
      weekStart,
      agent: "vapi",
      metricKey: "vapi_booking_rate",
      value: bookingRate,
      notes: `${booked.length} of ${answered.length} answered calls booked`,
    });
  } catch (err) {
    await log({
      agent: "coordinator",
      action: "compute_vapi_metrics",
      status: "failure",
      errorMessage: String(err),
    });
  }
}

async function computeQAPassRate(weekStart: string): Promise<void> {
  try {
    const rows = await readSheetAsObjects("Action Log");
    const qaRows = rows.filter(
      (r) => r["agent"] === "qa" && isInLastWeek(r["timestamp"] ?? "")
    );

    if (qaRows.length === 0) return;

    const passed = qaRows.filter((r) => r["status"] === "success").length;
    const rate = Math.round((passed / qaRows.length) * 100);

    await writeMetric({
      weekStart,
      agent: "qa",
      metricKey: "qa_first_pass_rate",
      value: rate,
      notes: `${passed} of ${qaRows.length} QA actions passed`,
    });
  } catch (err) {
    await log({
      agent: "coordinator",
      action: "compute_qa_pass_rate",
      status: "failure",
      errorMessage: String(err),
    });
  }
}

async function computeContentEngagement(weekStart: string): Promise<void> {
  try {
    const { getPostsWithAnalytics } = await import("@/lib/publer");
    const posts = await getPostsWithAnalytics(7);

    const postsWithImpressions = posts.filter((p) => p.impressions > 0);
    if (postsWithImpressions.length === 0) return;

    const avgEngagementRate =
      postsWithImpressions.reduce(
        (sum, p) => sum + p.engagements / p.impressions,
        0
      ) / postsWithImpressions.length;

    // Normalize to a 1-5 score matching the benchmark
    let score: number;
    if (avgEngagementRate >= 0.05) score = 5;
    else if (avgEngagementRate >= 0.025) score = 4;
    else if (avgEngagementRate >= 0.01) score = 3;
    else if (avgEngagementRate >= 0.005) score = 2;
    else score = 1;

    await writeMetric({
      weekStart,
      agent: "content",
      metricKey: "content_avg_engagement_score",
      value: score,
      notes: `${postsWithImpressions.length} posts — avg engagement rate ${(avgEngagementRate * 100).toFixed(2)}%`,
    });
  } catch (err) {
    await log({
      agent: "coordinator",
      action: "compute_content_engagement",
      status: "failure",
      errorMessage: String(err),
    });
  }
}

async function computeIntelBriefRating(weekStart: string): Promise<void> {
  try {
    const rows = await readSheetAsObjects("Intelligence Briefs");

    // Find briefs from last week that Chester has rated (rating column must be a number 1-5)
    const rated = rows.filter((r) => {
      const rating = Number(r["rating"]);
      const briefDate = r["week_start"] ?? "";
      return !isNaN(rating) && rating >= 1 && rating <= 5 && isInLastWeek(`${briefDate}T12:00:00Z`);
    });

    if (rated.length === 0) return;

    const avg = rated.reduce((sum, r) => sum + Number(r["rating"]), 0) / rated.length;

    await writeMetric({
      weekStart,
      agent: "intelligence",
      metricKey: "intel_brief_coordinator_rating",
      value: Math.round(avg * 10) / 10,
      notes: `Average of ${rated.length} brief rating${rated.length !== 1 ? "s" : ""}`,
    });
  } catch (err) {
    await log({
      agent: "coordinator",
      action: "compute_intel_brief_rating",
      status: "failure",
      errorMessage: String(err),
    });
  }
}

async function computeFulfillmentTime(weekStart: string): Promise<void> {
  try {
    const rows = await readSheetAsObjects("Action Log");

    const started = rows.filter(
      (r) =>
        r["action"] === "onboarding_started" && isInLastWeek(r["timestamp"] ?? "")
    );

    if (started.length === 0) return;

    const completed = rows.filter(
      (r) =>
        r["action"] === "onboarding_complete" || r["action"] === "client_activated"
    );

    let totalHours = 0;
    let matched = 0;

    for (const startRow of started) {
      const entityId = startRow["entity_id"];
      const endRow = completed.find((r) => r["entity_id"] === entityId);
      if (!endRow) continue;

      const startMs = new Date(startRow["timestamp"] ?? "").getTime();
      const endMs = new Date(endRow["timestamp"] ?? "").getTime();
      if (!startMs || !endMs) continue;

      totalHours += (endMs - startMs) / (1000 * 60 * 60);
      matched++;
    }

    if (matched === 0) return;

    await writeMetric({
      weekStart,
      agent: "fulfillment",
      metricKey: "fulfillment_time_to_live_hours",
      value: Math.round(totalHours / matched),
      notes: `Average over ${matched} client(s) onboarded this week`,
    });
  } catch (err) {
    await log({
      agent: "coordinator",
      action: "compute_fulfillment_time",
      status: "failure",
      errorMessage: String(err),
    });
  }
}
