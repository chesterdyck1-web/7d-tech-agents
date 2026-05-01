// Outreach Agent — processes today's leads and queues personalized emails for Chester's approval.
// Triggered by the Coordinator or runs after prospecting completes.

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
import type { DraftEmailInput } from "./email-drafter";

// Quincy's feedback loop: drafts an email, runs QA, and on failure sends specific
// fix instructions back to Cornelius for a rewrite. Up to 3 rounds before escalating.
// Chester never sees this exchange unless all 3 rounds fail.
async function draftWithQALoop(
  input: DraftEmailInput,
  label: string
): Promise<{ subject: string; body: string } | null> {
  const MAX_QA_ROUNDS = 3;
  let qaFeedback: string | undefined;
  let lastReasons: string[] = [];

  for (let round = 1; round <= MAX_QA_ROUNDS; round++) {
    const variations = await draftOutreachEmail(input, qaFeedback);

    for (const variation of variations) {
      const qa = await runEmailQA(variation);
      if (qa.passed) {
        if (round > 1) {
          // Log that self-healing worked — Chester sees "Cornelius self-corrected" in brief
          await log({
            agent: "outreach",
            action: "email_qa_self_corrected",
            entityId: label,
            status: "success",
            retryCount: round - 1,
            metadata: { fixedAfterRounds: round } as unknown as Record<string, unknown>,
          });
        }
        return variation;
      }
      lastReasons = qa.reasons;
    }

    if (round < MAX_QA_ROUNDS) {
      // Generate Quincy's specific fix instructions and feed them back
      qaFeedback = generateEmailFixInstructions(lastReasons);
      await log({
        agent: "outreach",
        action: "email_qa_feedback_sent",
        entityId: label,
        status: "pending",
        retryCount: round,
        metadata: { reasons: lastReasons, feedback: qaFeedback.slice(0, 200) } as unknown as Record<string, unknown>,
      });
    }
  }

  // All 3 rounds failed — escalate to Edmund for the morning brief
  await log({
    agent: "outreach",
    action: "email_qa_failed",
    entityId: label,
    status: "failure",
    retryCount: MAX_QA_ROUNDS,
    metadata: { reasons: lastReasons, business: label } as unknown as Record<string, unknown>,
  });

  await escalateToEdmund("Cornelius (Outreach)", "email_drafting", MAX_QA_ROUNDS, lastReasons, "brief");
  return null;
}

export async function runOutreach(testLimit?: number): Promise<void> {
  // Cap daily outreach at 20 emails — prevents inbox flood and spam flags
  const DAILY_LIMIT = testLimit ?? 20;

  const today = new Date().toISOString().slice(0, 10);
  const leads = await readSheetAsObjects("Daily Leads");
  const todayLeads = leads
    .filter((r) => r["date"] === today && !r["approval_id"] && r["email"])
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

  // ── Initial emails for new leads ──
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

      if (!draft) {
        failed++;
        continue;
      }

      const approvalId = await queueForApproval({
        businessId: lead["business_id"] ?? "",
        toName: lead["business_name"] ?? "",
        toEmail: lead["email"] ?? "",
        subject: draft.subject,
        body: draft.body,
        qaStatus: "passed",
      });

      // Link approval back to Daily Leads row
      await updateFieldByRowId(
        "Daily Leads",
        1,
        lead["business_id"] ?? "",
        8,
        approvalId
      );

      // Create email sequence for follow-ups
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

    // Throttle between leads to stay under Google Sheets write quota
    await sleep(1000);
  }

  // ── Follow-up emails for existing sequences ──
  const dueSequences = await getDueSequences();

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
      if (!qaResult.passed) {
        // Follow-up emails are simpler — single QA check, no feedback loop
        const feedback = generateEmailFixInstructions(qaResult.reasons);
        const retry = await draftFollowUpEmail(nextStep, seq.businessName, seq.ownerName || undefined, seq.vertical, seq.city, feedback);
        const retryQa = await runEmailQA(retry);
        if (!retryQa.passed) {
          await log({ agent: "outreach", action: "followup_qa_failed", entityId: seq.sequenceId, status: "failure", retryCount: 1, metadata: { step: nextStep, reasons: retryQa.reasons } as unknown as Record<string, unknown> });
          failed++;
          continue;
        }
        Object.assign(draft, retry);
      }

      await queueForApproval({
        businessId: seq.businessId,
        toName: seq.businessName,
        toEmail: seq.email,
        subject: draft.subject,
        body: draft.body,
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
      failed++;
    }

    // Throttle between follow-up sequences for the same reason
    await sleep(1000);
  }

  await log({
    agent: "outreach",
    action: "run_completed",
    status: "success",
    metadata: { queued, failed, followUpsProcessed: dueSequences.length },
  });

  if (todayLeads.length === 0 && dueSequences.length === 0) {
    await sendToChester("Outreach Agent: no new leads and no follow-ups due today.");
    return;
  }

  await sendToChester(
    `*Outreach complete*\nEmails queued for your approval: ${queued} | Failed QA or errors: ${failed}\nFollow-ups processed: ${dueSequences.length}\nApprove at 7dtech.ca/dashboard`
  );
}
