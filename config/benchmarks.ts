// KPI thresholds used by the Coordinator to flag underperforming agents.
// "alert" = trigger flag if below this for 2+ consecutive weeks (1 week for client approval).

export interface Benchmark {
  metric: string;
  target: number;
  alert: number;
  unit: string;
  consecutiveWeeksBeforeFlag: number;
}

export const BENCHMARKS: Record<string, Benchmark> = {
  outreach_email_open_rate: {
    metric: "Outreach email open rate",
    target: 30,
    alert: 20,
    unit: "%",
    consecutiveWeeksBeforeFlag: 2,
  },
  outreach_email_reply_rate: {
    metric: "Outreach email reply rate",
    target: 2,
    alert: 1,
    unit: "%",
    consecutiveWeeksBeforeFlag: 2,
  },
  vapi_answer_rate: {
    metric: "Vapi call answer rate",
    target: 40,
    alert: 25,
    unit: "%",
    consecutiveWeeksBeforeFlag: 2,
  },
  vapi_booking_rate: {
    metric: "Vapi booking rate (of answered calls)",
    target: 15,
    alert: 8,
    unit: "%",
    consecutiveWeeksBeforeFlag: 2,
  },
  client_approval_rate: {
    metric: "Client First Response Rx approval rate",
    target: 80,
    alert: 60,
    unit: "%",
    consecutiveWeeksBeforeFlag: 1,
  },
  fulfillment_time_to_live_hours: {
    metric: "Fulfillment time to live",
    target: 48,
    alert: 72,
    unit: "hours",
    consecutiveWeeksBeforeFlag: 2,
  },
  qa_first_pass_rate: {
    metric: "QA first-pass rate",
    target: 75,
    alert: 60,
    unit: "%",
    consecutiveWeeksBeforeFlag: 2,
  },
  content_avg_engagement_score: {
    metric: "Content average engagement score",
    target: 3.0,
    alert: 2.0,
    unit: "score",
    consecutiveWeeksBeforeFlag: 2,
  },
  intel_brief_coordinator_rating: {
    metric: "Intelligence brief coordinator rating",
    target: 3.5,
    alert: 3.0,
    unit: "/5",
    consecutiveWeeksBeforeFlag: 2,
  },
};
