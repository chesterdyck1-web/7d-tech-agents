// Outreach Agent — processes today's leads and queues personalized emails for Chester's approval.
// Triggered by the Coordinator or runs after prospecting completes.

import { readSheetAsObjects, updateFieldByRowId } from "@/lib/google-sheets";
import { log } from "@/lib/logger";
import { sendToChester } from "@/lib/telegram";
import { draftOutreachEmail } from "./email-drafter";
import { draftFollowUpEmail } from "./sequence-drafter";
import { queueForApproval } from "./approval-queuer";
import { scheduleFollowUp } from "./follow-up-scheduler";
import { createSequence, getDueSequences, advanceSequence } from "./sequence-engine";
import { runEmailQA } from "@/agents/qa/email-tester";
import { getCurrentOffer } from "@/lib/offers";

export async function runOutreach(): Promise<void> {
  // Cap daily outreach at 20 emails — prevents inbox flood and spam flags
  const DAILY_LIMIT = 20;

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
      const variations = await draftOutreachEmail({
        businessName: lead["business_name"] ?? "",
        ownerName: lead["owner_name"],
        vertical: lead["vertical"] ?? "",
        city: lead["city"] ?? "",
        website: lead["website"],
      });

      // Pick the first variation that passes QA
      let draft = null;
      for (const variation of variations) {
        const qaResult = await runEmailQA(variation);
        if (qaResult.passed) {
          draft = variation;
          break;
        }
      }

      if (!draft) {
        await log({
          agent: "outreach",
          action: "email_qa_failed",
          entityId: lead["business_id"] ?? "",
          status: "failure",
          metadata: { reasons: ["all 3 variations failed QA"] },
        });
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
        await log({
          agent: "outreach",
          action: "followup_qa_failed",
          entityId: seq.sequenceId,
          status: "failure",
          metadata: { step: nextStep, reasons: qaResult.reasons },
        });
        failed++;
        continue;
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
