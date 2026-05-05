// Single-lead verification test endpoint.
// Writes one test lead, runs the full draft-QA loop, queues for approval, returns audit trail.
// GET /api/test-lead?secret=CRON_SECRET
// Returns JSON with step results, QA rounds, Action Log entries, and Approval Queue entry.

import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { writeToMasterLeads, writeToDailyLeads } from "@/agents/prospecting/sheet-writer";
import { draftWithQALoop } from "@/agents/outreach/index";
import { queueForApproval } from "@/agents/outreach/approval-queuer";
import { readSheetAsObjects } from "@/lib/google-sheets";
import { log } from "@/lib/logger";
import { randomUUID } from "crypto";

export const maxDuration = 120;

const TEST_LEAD = {
  businessId: `TEST-${randomUUID().slice(0, 8).toUpperCase()}`,
  businessName: "Chester Test Gym",
  vertical: "gym",
  city: "Calgary",
  province: "AB",
  phone: "403-555-0100",
  email: "verify@7dtech.ca",
  website: "https://chestertestgym.ca",
  googlePlaceId: "TEST_PLACE_ID",
};

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (secret !== env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const steps: Array<{ step: string; status: "pass" | "fail" | "info"; detail: string }> = [];
  const testStart = new Date();

  // ── Step 1: Write test lead ───────────────────────────────────────────────

  try {
    await writeToMasterLeads(TEST_LEAD);
    await writeToDailyLeads(TEST_LEAD);
    steps.push({
      step: "1 — Prospecting: write test lead",
      status: "pass",
      detail: `Written: ${TEST_LEAD.businessName} (${TEST_LEAD.businessId}) to Master Leads + Daily Leads`,
    });
  } catch (err) {
    steps.push({ step: "1 — Prospecting: write test lead", status: "fail", detail: String(err) });
    return NextResponse.json({ steps, error: "Stopped at step 1" }, { status: 500 });
  }

  // ── Step 2: Draft email through QA loop ──────────────────────────────────

  const draftStart = Date.now();
  let approvedDraft: { subject: string; body: string } | null = null;

  await log({
    agent: "outreach",
    action: "test_lead_draft_start",
    entityId: TEST_LEAD.businessId,
    status: "pending",
    metadata: { testLeadId: TEST_LEAD.businessId } as unknown as Record<string, unknown>,
  });

  try {
    approvedDraft = await draftWithQALoop(
      {
        businessName: TEST_LEAD.businessName,
        vertical: TEST_LEAD.vertical,
        city: TEST_LEAD.city,
        website: TEST_LEAD.website,
      },
      TEST_LEAD.businessId
    );

    const elapsed = ((Date.now() - draftStart) / 1000).toFixed(1);

    if (approvedDraft) {
      steps.push({
        step: "2 — Cornelius + Quincy: draft and QA loop",
        status: "pass",
        detail: `Email passed QA in ${elapsed}s. Subject: "${approvedDraft.subject}" | Body length: ${approvedDraft.body.split(/\s+/).length} words`,
      });
    } else {
      steps.push({
        step: "2 — Cornelius + Quincy: draft and QA loop",
        status: "fail",
        detail: `All 3 QA rounds failed after ${elapsed}s. Chester was notified via Telegram. Check Action Log for reasons.`,
      });
    }
  } catch (err) {
    steps.push({ step: "2 — Cornelius + Quincy: draft and QA loop", status: "fail", detail: String(err) });
  }

  // ── Step 3: Queue for approval ────────────────────────────────────────────

  let approvalId: string | null = null;

  if (approvedDraft) {
    try {
      approvalId = await queueForApproval({
        businessId: TEST_LEAD.businessId,
        toName: TEST_LEAD.businessName,
        toEmail: TEST_LEAD.email,
        subject: approvedDraft.subject,
        body: approvedDraft.body,
        qaStatus: "passed",
      });
      steps.push({
        step: "3 — Approval Queue: write + notify Chester",
        status: "pass",
        detail: `Queued. approval_id: ${approvalId}. Telegram ping sent to Chester.`,
      });
    } catch (err) {
      steps.push({ step: "3 — Approval Queue: write + notify Chester", status: "fail", detail: String(err) });
    }
  } else {
    steps.push({
      step: "3 — Approval Queue: skipped",
      status: "info",
      detail: "No approved draft — nothing queued. This is correct behaviour when all QA rounds fail.",
    });
  }

  // ── Step 4: Read Action Log for this test run ─────────────────────────────

  const actionLogEntries: Array<Record<string, string>> = [];
  try {
    const allRows = await readSheetAsObjects("Action Log");
    const cutoff = new Date(testStart.getTime() - 5000); // 5s before test started

    const relevant = allRows.filter((r) => {
      if (!r["timestamp"]) return false;
      const ts = new Date(r["timestamp"]);
      return ts >= cutoff && (
        r["entity_id"] === TEST_LEAD.businessId ||
        r["action"]?.includes("test_lead") ||
        (ts >= testStart && (r["agent"] === "outreach" || r["agent"] === "coordinator"))
      );
    });

    actionLogEntries.push(...relevant);
    steps.push({
      step: "4 — Action Log: verify entries",
      status: relevant.length > 0 ? "pass" : "info",
      detail: `${relevant.length} Action Log entries found for this test run`,
    });
  } catch (err) {
    steps.push({ step: "4 — Action Log: verify entries", status: "fail", detail: String(err) });
  }

  // ── Step 5: Read Approval Queue entry ─────────────────────────────────────

  let approvalEntry: Record<string, string> | null = null;
  if (approvalId) {
    try {
      const queue = await readSheetAsObjects("Approval Queue");
      approvalEntry = queue.find((r) => r["approval_id"] === approvalId) ?? null;
      steps.push({
        step: "5 — Dashboard: confirm email visible",
        status: approvalEntry ? "pass" : "fail",
        detail: approvalEntry
          ? `Email in queue: status="${approvalEntry["status"]}", to="${approvalEntry["to_name"]}", subject="${approvalEntry["subject"]}"`
          : `approval_id ${approvalId} not found in Approval Queue`,
      });
    } catch (err) {
      steps.push({ step: "5 — Dashboard: confirm email visible", status: "fail", detail: String(err) });
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  const passed = steps.filter((s) => s.status === "pass").length;
  const failed = steps.filter((s) => s.status === "fail").length;

  // Annotate QA rounds from Action Log
  const qaRounds = actionLogEntries
    .filter((r) => r["action"]?.includes("email_qa"))
    .map((r) => {
      let meta: Record<string, unknown> = {};
      try { meta = JSON.parse(r["metadata"] ?? "{}") as Record<string, unknown>; } catch { /* ok */ }
      return {
        action: r["action"],
        retryCount: r["retry_count"],
        reasons: meta["reasons"],
        attempt: meta["attempt"],
      };
    });

  return NextResponse.json({
    summary: {
      testLead: TEST_LEAD.businessName,
      businessId: TEST_LEAD.businessId,
      passed,
      failed,
      overallResult: failed === 0 ? "ALL CLEAR — ready for full outreach" : "FAILED — do not run full outreach",
      approvalId,
      emailDraft: approvedDraft
        ? { subject: approvedDraft.subject, bodyPreview: approvedDraft.body.slice(0, 200) + "..." }
        : null,
    },
    steps,
    qaRounds,
    actionLog: actionLogEntries.map((r) => ({
      timestamp: r["timestamp"],
      agent: r["agent"],
      action: r["action"],
      status: r["status"],
      retryCount: r["retry_count"],
      metadata: r["metadata"],
      error: r["error_message"],
    })),
    approvalQueueEntry: approvalEntry,
  });
}
