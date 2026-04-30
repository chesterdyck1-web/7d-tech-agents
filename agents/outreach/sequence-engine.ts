// Email Sequence Engine — manages multi-step follow-up sequences per lead.
// Steps: 0=initial, 1=followup@2d, 2=followup@5d, 3=followup@14d, 4=breakup
// Sequences pause when a Vapi call shows the prospect is interested.
// Chester approves every follow-up the same way as the initial email.

import { appendToSheet, readSheetAsObjects, updateFieldByRowId, ensureSheetTab } from "@/lib/google-sheets";
import { randomUUID } from "crypto";

const SHEET = "Email Sequences";
const HEADERS = [
  "sequence_id", "business_id", "business_name", "email",
  "vertical", "city", "owner_name",
  "current_step",       // 0–4
  "sent_at",            // ISO timestamp of last email sent
  "next_due_at",        // ISO timestamp when next step is due
  "status",             // active | paused | completed | bounced | opted_out
  "vapi_call_status",   // pending | answered | not_answered | interested | declined
  "offer_id",           // which offer was used for the initial email
];

// Days after the initial send that each follow-up step is due
const STEP_DELAYS_DAYS = [0, 2, 5, 14, 21];
const STEP_NAMES = ["initial", "followup_1", "followup_2", "followup_3", "breakup"];

export interface SequenceEntry {
  sequenceId: string;
  businessId: string;
  businessName: string;
  email: string;
  vertical: string;
  city: string;
  ownerName: string;
  currentStep: number;
  sentAt: string;
  nextDueAt: string;
  status: string;
  vapiCallStatus: string;
  offerId: string;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function nextDueDate(sentAt: Date, nextStep: number): string {
  const delay = STEP_DELAYS_DAYS[nextStep] ?? STEP_DELAYS_DAYS[STEP_DELAYS_DAYS.length - 1]!;
  // Calculate from original sent_at (step 0) so delays are absolute from day 0
  return addDays(sentAt, delay).toISOString();
}

export async function ensureSequenceSheet(): Promise<void> {
  await ensureSheetTab(SHEET, HEADERS);
}

// Called when the initial cold email is sent — creates a sequence row
export async function createSequence(input: {
  businessId: string;
  businessName: string;
  email: string;
  vertical: string;
  city: string;
  ownerName?: string;
  offerId: string;
}): Promise<string> {
  await ensureSequenceSheet();

  const sequenceId = randomUUID();
  const now = new Date();
  const nextDue = nextDueDate(now, 1); // Step 1 due in 2 days

  await appendToSheet(SHEET, [
    sequenceId,
    input.businessId,
    input.businessName,
    input.email,
    input.vertical,
    input.city,
    input.ownerName ?? "",
    "0",              // current_step = 0 (initial sent)
    now.toISOString(),
    nextDue,
    "active",
    "pending",        // vapi_call_status — Make.com updates this after the call
    input.offerId,
  ]);

  return sequenceId;
}

// Returns all sequences due for their next email step
export async function getDueSequences(): Promise<SequenceEntry[]> {
  await ensureSequenceSheet();
  const rows = await readSheetAsObjects(SHEET).catch(() => []);
  const now = new Date();

  return rows
    .filter((r) => {
      if (r["status"] !== "active") return false;
      const step = parseInt(r["current_step"] ?? "0", 10);
      if (step >= STEP_NAMES.length - 1) return false; // already on last step
      const nextDue = new Date(r["next_due_at"] ?? "");
      return nextDue <= now;
    })
    .map((r) => ({
      sequenceId: r["sequence_id"] ?? "",
      businessId: r["business_id"] ?? "",
      businessName: r["business_name"] ?? "",
      email: r["email"] ?? "",
      vertical: r["vertical"] ?? "",
      city: r["city"] ?? "",
      ownerName: r["owner_name"] ?? "",
      currentStep: parseInt(r["current_step"] ?? "0", 10),
      sentAt: r["sent_at"] ?? "",
      nextDueAt: r["next_due_at"] ?? "",
      status: r["status"] ?? "",
      vapiCallStatus: r["vapi_call_status"] ?? "pending",
      offerId: r["offer_id"] ?? "default",
    }));
}

// Advance to the next step after an email is sent, or mark complete after breakup
export async function advanceSequence(
  sequenceId: string,
  currentStep: number,
  originalSentAt: string
): Promise<void> {
  const nextStep = currentStep + 1;
  const isLast = nextStep >= STEP_NAMES.length;
  const now = new Date().toISOString();

  // Update current_step
  await updateFieldByRowId(SHEET, 0, sequenceId, 7, String(nextStep));
  // Update sent_at to now
  await updateFieldByRowId(SHEET, 0, sequenceId, 8, now);

  if (isLast) {
    await updateFieldByRowId(SHEET, 0, sequenceId, 10, "completed");
  } else {
    const nextDue = nextDueDate(new Date(originalSentAt), nextStep + 1);
    await updateFieldByRowId(SHEET, 0, sequenceId, 9, nextDue);
  }
}

// Called by the Vapi webhook when a call outcome is known
export async function updateVapiStatus(
  businessId: string,
  callStatus: "answered" | "not_answered" | "interested" | "declined"
): Promise<void> {
  await ensureSequenceSheet();
  const rows = await readSheetAsObjects(SHEET).catch(() => []);
  const seq = rows.find(
    (r) => r["business_id"] === businessId && r["status"] === "active"
  );
  if (!seq) return;

  const sequenceId = seq["sequence_id"] ?? "";

  await updateFieldByRowId(SHEET, 0, sequenceId, 11, callStatus);

  // Pause the sequence if the prospect showed interest on the call —
  // they're in the voice flow now and don't need more cold emails
  if (callStatus === "interested") {
    await updateFieldByRowId(SHEET, 0, sequenceId, 10, "paused");
  }
}

// Mark a sequence complete because the prospect replied to an email
export async function markReplied(businessId: string): Promise<void> {
  await ensureSequenceSheet();
  const rows = await readSheetAsObjects(SHEET).catch(() => []);
  const seq = rows.find(
    (r) => r["business_id"] === businessId && r["status"] === "active"
  );
  if (!seq) return;
  await updateFieldByRowId(SHEET, 0, seq["sequence_id"] ?? "", 10, "completed");
}

export { STEP_NAMES };
