// Goal-based direction system for Edmund.
// Chester states a high-level goal; Edmund works backwards to daily capacity,
// coordinates agents, and tracks progress toward the goal each morning.

import { appendToSheet, readSheetAsObjects, updateFieldByRowId, ensureSheetTab } from "@/lib/google-sheets";
import { randomUUID } from "crypto";
import { DAILY_EMAIL_MAX } from "@/lib/capacity";

const SHEET = "Goals";
const HEADERS = [
  "goal_id",
  "goal_type",       // calls_week | replies_week | clients_month | maximize | light_week | pause
  "target",          // numeric target (3 calls, 5 replies, etc.)
  "deadline",        // ISO date (end of week / end of month)
  "status",          // pending_approval | active | achieved | missed | paused
  "daily_capacity",  // emails per day Edmund calculated for this goal
  "emails_needed",   // total emails needed across the full period
  "emails_sent",     // progress: emails actually sent so far this period
  "calls_booked",    // progress: calls booked so far (manual update by Chester or Dorian)
  "last_updated",    // ISO timestamp
  "set_at",          // ISO timestamp when goal was first stated
];

// Default conversion rates — these are starting assumptions.
// Franklin overwrites these in the Conversion Rates sheet from real data weekly.
export const DEFAULT_CONVERSION_RATES = {
  emailReplyRate: 0.05,    // 5%: 1 reply per 20 emails
  replyToCallRate: 0.50,   // 50%: 1 booked call per 2 replies
  callToClientRate: 0.30,  // 30%: 1 new client per 3 calls
};

export type GoalType =
  | "calls_week"
  | "replies_week"
  | "clients_month"
  | "maximize"
  | "light_week"
  | "pause";

export interface GoalRecord {
  goalId: string;
  goalType: GoalType;
  target: number;
  deadline: string;
  status: "pending_approval" | "active" | "achieved" | "missed" | "paused";
  dailyCapacity: number;
  emailsNeeded: number;
  emailsSent: number;
  callsBooked: number;
  lastUpdated: string;
  setAt: string;
}

export interface ConversionRates {
  emailReplyRate: number;
  replyToCallRate: number;
  callToClientRate: number;
}

export interface GoalMath {
  emailsNeeded: number;
  emailsPerCall: number;
  daysAvailable: number;
  dailyCapacityNeeded: number;
  achievable: boolean;
  projectedOutcome: number;
  confirmationMessage: string;
}

async function ensureGoalsSheet(): Promise<void> {
  await ensureSheetTab(SHEET, HEADERS);
}

// Read actual conversion rates from Conversion Rates sheet; fall back to defaults.
// Franklin writes to this sheet at end of each week with real data.
export async function getConversionRates(): Promise<ConversionRates> {
  try {
    const rows = await readSheetAsObjects("Conversion Rates");
    const latest = rows[rows.length - 1];
    if (latest && latest["email_reply_rate"]) {
      return {
        emailReplyRate: Number(latest["email_reply_rate"]),
        replyToCallRate: Number(latest["reply_to_call_rate"] ?? DEFAULT_CONVERSION_RATES.replyToCallRate),
        callToClientRate: Number(latest["call_to_client_rate"] ?? DEFAULT_CONVERSION_RATES.callToClientRate),
      };
    }
  } catch { /* no sheet yet */ }
  return { ...DEFAULT_CONVERSION_RATES };
}

// Work backwards from a goal to the emails needed and daily capacity required.
export function calculateGoalMath(
  goalType: GoalType,
  target: number,
  deadline: string,
  rates: ConversionRates
): GoalMath {
  const daysAvailable = Math.max(1, getBusinessDaysRemaining(new Date(), new Date(deadline)));
  const emailsPerCall = Math.round((1 / rates.emailReplyRate) * (1 / rates.replyToCallRate));

  let emailsNeeded: number;
  let projectedOutcome: number;

  switch (goalType) {
    case "calls_week": {
      emailsNeeded = target * emailsPerCall;
      projectedOutcome = target;
      break;
    }
    case "replies_week": {
      emailsNeeded = Math.round(target / rates.emailReplyRate);
      projectedOutcome = Math.round(target * rates.replyToCallRate);
      break;
    }
    case "clients_month": {
      const callsNeeded = Math.round(target / rates.callToClientRate);
      emailsNeeded = callsNeeded * emailsPerCall;
      projectedOutcome = target;
      break;
    }
    case "maximize": {
      emailsNeeded = DAILY_EMAIL_MAX * daysAvailable;
      projectedOutcome = Math.round(emailsNeeded * rates.emailReplyRate * rates.replyToCallRate);
      break;
    }
    case "light_week": {
      const lightDaily = Math.floor(DAILY_EMAIL_MAX * 0.5);
      emailsNeeded = lightDaily * daysAvailable;
      projectedOutcome = Math.round(emailsNeeded * rates.emailReplyRate * rates.replyToCallRate);
      break;
    }
    case "pause": {
      emailsNeeded = 0;
      projectedOutcome = 0;
      break;
    }
  }

  const dailyCapacityNeeded = emailsNeeded === 0
    ? 0
    : Math.min(Math.ceil(emailsNeeded / daysAvailable), DAILY_EMAIL_MAX);

  const achievable = goalType === "pause" || goalType === "light_week" || goalType === "maximize"
    ? true
    : dailyCapacityNeeded <= DAILY_EMAIL_MAX;

  let confirmationMessage: string;

  if (goalType === "pause") {
    confirmationMessage =
      `Understood. I will pause all outreach until ${deadline}.\n` +
      `No emails will be sent. I will notify you when the pause expires.\n\n` +
      `Reply *approve goal* to confirm, or ignore to cancel.`;
  } else if (goalType === "light_week") {
    confirmationMessage =
      `Light week — I will run at 50% capacity (${dailyCapacityNeeded} emails/day).\n` +
      `Projected: approximately ${projectedOutcome} calls if reply rates hold.\n\n` +
      `Reply *approve goal* to confirm, or ignore to cancel.`;
  } else if (goalType === "maximize") {
    confirmationMessage =
      `Maximizing — I will run at full capacity (${DAILY_EMAIL_MAX} emails/day).\n` +
      `${daysAvailable} days of outreach. Projected: approximately ${projectedOutcome} calls.\n\n` +
      `Reply *approve goal* to confirm, or ignore to cancel.`;
  } else {
    const achievabilityLine = achievable
      ? `That is achievable — I have capacity.`
      : `That is a stretch — max capacity projects ${Math.round(DAILY_EMAIL_MAX * daysAvailable * rates.emailReplyRate * rates.replyToCallRate)} calls. I will run at full capacity.`;

    confirmationMessage =
      `To hit ${target} ${goalType === "calls_week" ? "calls this week" : goalType === "replies_week" ? "replies this week" : "new clients this month"} I need to send approximately ${emailsNeeded} emails.\n` +
      `Daily capacity needed: ${dailyCapacityNeeded} emails/day.\n` +
      `${daysAvailable} business day${daysAvailable !== 1 ? "s" : ""} remaining. ${achievabilityLine}\n\n` +
      `I will run at ${dailyCapacityNeeded} emails/day starting today.\n\n` +
      `Reply *approve goal* to confirm, or ignore to cancel.`;
  }

  return {
    emailsNeeded,
    emailsPerCall,
    daysAvailable,
    dailyCapacityNeeded,
    achievable,
    projectedOutcome,
    confirmationMessage,
  };
}

// Store a pending goal — waits for Chester's "approve goal" before activating.
export async function storePendingGoal(
  goalType: GoalType,
  target: number,
  deadline: string,
  math: GoalMath
): Promise<string> {
  await ensureGoalsSheet();

  // Cancel any existing pending goal before creating a new one
  const rows = await readSheetAsObjects(SHEET);
  for (const r of rows.filter(r => r["status"] === "pending_approval")) {
    await updateFieldByRowId(SHEET, 0, r["goal_id"] ?? "", 4, "paused").catch(() => null);
  }

  const goalId = randomUUID();
  const now = new Date().toISOString();
  await appendToSheet(SHEET, [
    goalId, goalType, target, deadline,
    "pending_approval",
    math.dailyCapacityNeeded,
    math.emailsNeeded,
    0, 0,   // emails_sent, calls_booked
    now, now,
  ]);
  return goalId;
}

// Activate the pending goal when Chester approves.
export async function activatePendingGoal(): Promise<GoalRecord | null> {
  await ensureGoalsSheet();
  const rows = await readSheetAsObjects(SHEET);
  const pending = rows.find(r => r["status"] === "pending_approval");
  if (!pending) return null;

  const goalId = pending["goal_id"] ?? "";
  const now = new Date().toISOString();
  await updateFieldByRowId(SHEET, 0, goalId, 4, "active");
  await updateFieldByRowId(SHEET, 0, goalId, 9, now);
  return rowToGoal(pending);
}

// Get the current active goal (auto-expires if deadline passed).
export async function getActiveGoal(): Promise<GoalRecord | null> {
  try {
    await ensureGoalsSheet();
    const rows = await readSheetAsObjects(SHEET);
    const active = rows.find(r => r["status"] === "active");
    if (!active) return null;

    if (new Date(active["deadline"] ?? "") < new Date()) {
      await updateFieldByRowId(SHEET, 0, active["goal_id"] ?? "", 4, "missed").catch(() => null);
      return null;
    }
    return rowToGoal(active);
  } catch {
    return null;
  }
}

// Get pending goal awaiting approval.
export async function getPendingGoal(): Promise<GoalRecord | null> {
  try {
    await ensureGoalsSheet();
    const rows = await readSheetAsObjects(SHEET);
    const pending = rows.find(r => r["status"] === "pending_approval");
    return pending ? rowToGoal(pending) : null;
  } catch {
    return null;
  }
}

// Update emails_sent and calls_booked from real data.
export async function updateGoalProgress(
  goalId: string,
  emailsSent: number,
  callsBooked: number
): Promise<void> {
  try {
    const now = new Date().toISOString();
    await updateFieldByRowId(SHEET, 0, goalId, 7, emailsSent);
    await updateFieldByRowId(SHEET, 0, goalId, 8, callsBooked);
    await updateFieldByRowId(SHEET, 0, goalId, 9, now);
  } catch { /* ok */ }
}

// Calculate how many emails Edmund should send today to stay on track for the goal.
// Used by the daily flow to override the default capacity calculation.
export function getGoalDailyCapacity(goal: GoalRecord): number {
  if (goal.goalType === "pause") return 0;
  if (goal.emailsNeeded === 0) return 0;

  const emailsRemaining = Math.max(0, goal.emailsNeeded - goal.emailsSent);
  const daysLeft = Math.max(1, getBusinessDaysRemaining(new Date(), new Date(goal.deadline)));
  return Math.min(Math.ceil(emailsRemaining / daysLeft), DAILY_EMAIL_MAX);
}

// Whether the goal is on track based on current email send rate.
export function getGoalTrackingStatus(
  goal: GoalRecord,
  rates: ConversionRates
): "on_track" | "behind" | "ahead" | "achieved" {
  if (goal.callsBooked >= goal.target && goal.goalType === "calls_week") return "achieved";

  const daysTotal = getBusinessDaysRemaining(new Date(goal.setAt), new Date(goal.deadline));
  const daysElapsed = daysTotal - getBusinessDaysRemaining(new Date(), new Date(goal.deadline));
  if (daysTotal === 0 || daysElapsed === 0) return "on_track";

  const expectedEmailsSent = Math.round((daysElapsed / daysTotal) * goal.emailsNeeded);
  if (goal.emailsSent >= expectedEmailsSent * 1.1) return "ahead";
  if (goal.emailsSent < expectedEmailsSent * 0.8) return "behind";
  return "on_track";
}

// Parse Chester's message into a goal type and target. Returns null if not a goal statement.
export function parseGoalFromMessage(text: string): { goalType: GoalType; target: number; deadline: string } | null {
  const t = text.toLowerCase().trim();

  const callsMatch = t.match(/(\d+)\s+calls?\s+(booked\s+)?this\s+week/) ??
    t.match(/book\s+(\d+)\s+calls?\s+this\s+week/) ??
    t.match(/need\s+(\d+)\s+calls?\s+this\s+week/) ??
    t.match(/want\s+(\d+)\s+(?:sales\s+)?calls?\s+this\s+week/);
  if (callsMatch) return { goalType: "calls_week", target: parseInt(callsMatch[1]!), deadline: getWeekDeadline() };

  const repliesMatch = t.match(/(\d+)\s+replies?\s+this\s+week/) ??
    t.match(/need\s+(\d+)\s+(?:email\s+)?replies?\s+this\s+week/);
  if (repliesMatch) return { goalType: "replies_week", target: parseInt(repliesMatch[1]!), deadline: getWeekDeadline() };

  const clientsMatch = t.match(/(\d+)\s+(?:new\s+)?clients?\s+this\s+month/) ??
    t.match(/need\s+(\d+)\s+(?:new\s+)?clients?\s+this\s+month/);
  if (clientsMatch) return { goalType: "clients_month", target: parseInt(clientsMatch[1]!), deadline: getMonthDeadline() };

  if (t.includes("maximize") && (t.includes("calls") || t.includes("outreach") || t.includes("emails")))
    return { goalType: "maximize", target: 0, deadline: getWeekDeadline() };

  if (t.includes("light week") || t.includes("easy week") || t.includes("slow week"))
    return { goalType: "light_week", target: 0, deadline: getWeekDeadline() };

  if (t.includes("pause outreach") || t.includes("stop outreach") || t.includes("pause prospecting") || t.includes("no outreach this week"))
    return { goalType: "pause", target: 0, deadline: getWeekDeadline() };

  return null;
}

// End of current week (Friday 11:59 PM)
export function getWeekDeadline(): string {
  const d = new Date();
  const day = d.getDay();
  const daysUntilFriday = day === 0 ? 5 : day <= 5 ? 5 - day : 6; // handles Sun and Sat
  d.setDate(d.getDate() + daysUntilFriday);
  return d.toISOString().slice(0, 10);
}

// End of current month
export function getMonthDeadline(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
}

// Count Mon–Fri business days between two dates (inclusive of both ends)
function getBusinessDaysRemaining(from: Date, to: Date): number {
  let count = 0;
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(23, 59, 59, 0);
  while (d <= end) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

function rowToGoal(r: Record<string, string>): GoalRecord {
  return {
    goalId: r["goal_id"] ?? "",
    goalType: (r["goal_type"] ?? "calls_week") as GoalType,
    target: Number(r["target"] ?? 0),
    deadline: r["deadline"] ?? "",
    status: (r["status"] ?? "active") as GoalRecord["status"],
    dailyCapacity: Number(r["daily_capacity"] ?? 0),
    emailsNeeded: Number(r["emails_needed"] ?? 0),
    emailsSent: Number(r["emails_sent"] ?? 0),
    callsBooked: Number(r["calls_booked"] ?? 0),
    lastUpdated: r["last_updated"] ?? "",
    setAt: r["set_at"] ?? "",
  };
}
