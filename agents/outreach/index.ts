// Outreach Agent — processes leads and queues personalized emails for Chester's approval.
// In the demand-driven model, draftAndQueueLeads() receives exact lead objects from
// the daily flow orchestrator. runFollowUps() handles due sequences separately.

import { readSheetAsObjects, updateFieldByRowId, sleep } from "@/lib/google-sheets";
import { log } from "@/lib/logger";
import { sendToChester } from "@/lib/telegram";
import { draftOutreachEmail } from "./email-drafter";
import { draftFollowUpEmail } from "./sequence-drafter";
import { queueForApproval } from "./approval-queuer";
import { scheduleFollowUp } from "./follow-up-scheduler";
import { createSequence, getDueSequences, advanceSequence } from "./sequence-engine";
import { runEmailQA } from "@/agents/qa/email-tester";
import { getCurrentOffer } from "@/lib/offers";
import { generateEmailFixInstructions, escalateToEdmund } from "@/lib/self-heal";
import { updateLeadStatus } from "@/lib/capacity";
import type { UncontactedLead } from "@/lib/capacity";
import type { DraftEmailInput } from "./email-drafter";

// Draft → QA → fix loop running entirely in memory.
// Cornelius drafts, Quincy validates, specific fix instructions go back to Cornelius on failure.
// Up to 3 attempts before escalating. Chester only ever sees approved drafts.
// Exported so the single-lead test endpoint can call it directly.
export async function draftWithQALoop(
  input: DraftEmailInput,
  label: string
): Promise<{ subject: string; body: string } | null> {
  const MAX_ATTEMPTS = 3;
  let fixInstructions: string | undefined;
  const accumulatedReasons: string[] = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const variations = await draftOutreachEmail(input, fixInstructions);

    for (const variation of variations) {
      const qa = await runEmailQA(variation);
      if (qa.passed) {
        if (attempt > 1) {
          await log({
            agent: "outreach",
            action: "email_qa_self_corrected",
            entityId: label,
            status: "success",
            retryCount: attempt - 1,
            metadata: { fixedAfterAttempts: attempt } as unknown as Record<string, unknown>,
          });
        }
        return variation;
      }
      for (const r of qa.reasons) {
        if (!accumulatedReasons.includes(r)) accumulatedReasons.push(r);
      }
    }

    await log({
      agent: "outreach",
      action: "email_qa_attempt_failed",
      entityId: label,
      status: "pending",
      retryCount: attempt,
      metadata: { reasons: accumulatedReasons, attempt } as unknown as Record<string, unknown>,
    });

    if (attempt < MAX_ATTEMPTS) {
      fixInstructions = generateEmailFixInstructions(accumulatedReasons);
    }
  }

  await log({
    agent: "outreach",
    action: "email_qa_failed",
    entityId: label,
    status: "failure",
    retryCount: MAX_ATTEMPTS,
    metadata: { reasons: accumulatedReasons, business: label } as unknown as Record<string, unknown>,
  });

  await escalateToEdmund("Cornelius (Outreach)", "email_drafting", MAX_ATTEMPTS, accumulatedReasons, "immediate");
  return null;
}

// Draft and queue emails for a specific set of leads.
// Called by the daily flow orchestrator with exactly the leads Edmund calculated.
export async function draftAndQueueLeads(
  leads: UncontactedLead[]
): Promise<{ queued: number; failed: number }> {
  if (leads.length === 0) return { queued: 0, failed: 0 };

  const offer = await getCurrentOffer();
  let queued = 0;
  let failed = 0;

  for (const lead of leads) {
    try {
      const draft = await draftWithQALoop(
        {
          businessName: lead.businessName,
          ownerName: lead.ownerName,
          vertical: lead.vertical,
          city: lead.city,
          website: lead.website,
        },
        lead.businessId
      );

      if (!draft) {
        failed++;
        continue;
      }

      await queueForApproval({
        businessId: lead.businessId,
        toName: lead.businessName,
        toEmail: lead.email,
        subject: draft.subject,
        body: draft.body,
        qaStatus: "passed",
      });

      await createSequence({
        businessId: lead.businessId,
        businessName: lead.businessName,
        email: lead.email,
        vertical: lead.vertical,
        city: lead.city,
        ownerName: lead.ownerName,
        offerId: offer.id,
      });

      await scheduleFollowUp(lead.businessId);

      // Mark as queued in Master Leads so it is not picked up again tomorrow
      await updateLeadStatus(lead.businessId, "queued");

      queued++;
    } catch (err) {
      await log({
        agent: "outreach",
        action: "process_lead",
        entityId: lead.businessId,
        status: "failure",
        errorMessage: String(err),
      });
      failed++;
    }

    await sleep(1000);
  }

  return { queued, failed };
}

// Process due follow-up sequences up to the given limit.
// Follow-ups get priority — they count against the daily capacity before new outreach.
// Returns number of follow-ups queued.
export async function runFollowUps(limit: number): Promise<number> {
  if (limit <= 0) return 0;

  const dueSequences = (await getDueSequences()).slice(0, limit);
  let queued = 0;

  for (const seq of dueSequences) {
    try {
      const nextStep = seq.currentStep + 1;
      const draft = await draftFollowUpEmail(
        nextStep,
        seq.businessName,
        seq.ownerName || undefined,
        seq.vertical,
        seq.city
      );

      const qaResult = await runEmailQA(draft);
      let finalDraft = draft;

      if (!qaResult.passed) {
        const feedback = generateEmailFixInstructions(qaResult.reasons);
        const retry = await draftFollowUpEmail(nextStep, seq.businessName, seq.ownerName || undefined, seq.vertical, seq.city, feedback);
        const retryQa = await runEmailQA(retry);
        if (!retryQa.passed) {
          await log({
            agent: "outreach",
            action: "followup_qa_failed",
            entityId: seq.sequenceId,
            status: "failure",
            retryCount: 1,
            metadata: { step: nextStep, reasons: retryQa.reasons } as unknown as Record<string, unknown>,
          });
          continue;
        }
        finalDraft = retry;
      }

      await queueForApproval({
        businessId: seq.businessId,
        toName: seq.businessName,
        toEmail: seq.email,
        subject: finalDraft.subject,
        body: finalDraft.body,
        qaStatus: "passed",
      });

      await advanceSequence(seq.sequenceId, seq.currentStep, seq.sentAt);
      queued++;
    } catch (err) {
      await log({
        agent: "outreach",
        action: "followup_failed",
        entityId: seq.sequenceId,
        status: "failure",
        errorMessage: String(err),
      });
    }

    await sleep(1000);
  }

  return queued;
}

// Legacy full-run outreach — kept for the manual "run outreach" coordinator intent.
// Reads today's leads from Daily Leads and processes due follow-ups.
export async function runOutreach(testLimit?: number): Promise<void> {
  const DAILY_LIMIT = testLimit ?? 20;
  const today = new Date().toISOString().slice(0, 10);
  const leads = await readSheetAsObjects("Daily Leads");
  const todayLeads = leads
    .filter(r => r["date"] === today && !r["approval_id"] && r["email"])
    .slice(0, DAILY_LIMIT);

  const offer = await getCurrentOffer();

  await log({
    agent: "outreach",
    action: "run_started",
    status: "pending",
    metadata: { leadsToProcess: todayLeads.length, offerId: offer.id },
  });

  let queued = 0;
  let failed = 0;

  for (const lead of todayLeads) {
    try {
      const draft = await draftWithQALoop(
        {
          businessName: lead["business_name"] ?? "",
          ownerName: lead["owner_name"],
          vertical: lead["vertical"] ?? "",
          city: lead["city"] ?? "",
          website: lead["website"],
        },
        lead["business_id"] ?? lead["business_name"] ?? "unknown"
      );

      if (!draft) { failed++; continue; }

      const approvalId = await queueForApproval({
        businessId: lead["business_id"] ?? "",
        toName: lead["business_name"] ?? "",
        toEmail: lead["email"] ?? "",
        subject: draft.subject,
        body: draft.body,
        qaStatus: "passed",
      });

      await updateFieldByRowId("Daily Leads", 1, lead["business_id"] ?? "", 8, approvalId);

      await createSequence({
        businessId: lead["business_id"] ?? "",
        businessName: lead["business_name"] ?? "",
        email: lead["email"] ?? "",
        vertical: lead["vertical"] ?? "",
        city: lead["city"] ?? "",
        ownerName: lead["owner_name"],
        offerId: offer.id,
      });

      await scheduleFollowUp(lead["business_id"] ?? "");
      await updateLeadStatus(lead["business_id"] ?? "", "queued");
      queued++;
    } catch (err) {
      await log({
        agent: "outreach",
        action: "process_lead",
        entityId: lead["business_id"] ?? "",
        status: "failure",
        errorMessage: String(err),
      });
      failed++;
    }

    await sleep(1000);
  }

  const followUpsQueued = await runFollowUps(DAILY_LIMIT - queued);

  await log({
    agent: "outreach",
    action: "run_completed",
    status: "success",
    metadata: { queued, failed, followUpsProcessed: followUpsQueued },
  });

  if (todayLeads.length === 0 && followUpsQueued === 0) {
    await sendToChester("Outreach Agent: no new leads and no follow-ups due today.");
    return;
  }

  await sendToChester(
    `*Outreach complete*\nEmails queued for your approval: ${queued + followUpsQueued} | Failed QA or errors: ${failed}\nApprove at 7dtech.ca/dashboard`
  );
}
