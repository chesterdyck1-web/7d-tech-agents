// Outreach Agent — processes today's leads and queues personalized emails for Chester's approval.
// Triggered by the Coordinator or runs after prospecting completes.

import { readSheetAsObjects, updateFieldByRowId } from "@/lib/google-sheets";
import { log } from "@/lib/logger";
import { sendToChester } from "@/lib/telegram";
import { draftOutreachEmail } from "./email-drafter";
import { queueForApproval } from "./approval-queuer";
import { scheduleFollowUp } from "./follow-up-scheduler";
import { runEmailQA } from "@/agents/qa/email-tester";

export async function runOutreach(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const leads = await readSheetAsObjects("Daily Leads");
  const todayLeads = leads.filter(
    (r) => r["date"] === today && !r["approval_id"] && r["email"]
  );

  if (todayLeads.length === 0) {
    await sendToChester("Outreach Agent: no new leads with emails to process today.");
    return;
  }

  await log({
    agent: "outreach",
    action: "run_started",
    status: "pending",
    metadata: { leadsToProcess: todayLeads.length },
  });

  let queued = 0;
  let failed = 0;

  for (const lead of todayLeads) {
    try {
      const draft = await draftOutreachEmail({
        businessName: lead["business_name"] ?? "",
        vertical: lead["vertical"] ?? "",
        city: lead["city"] ?? "",
        website: lead["website"],
      });

      const qaResult = await runEmailQA(draft);

      if (!qaResult.passed) {
        await log({
          agent: "outreach",
          action: "email_qa_failed",
          entityId: lead["business_id"] ?? "",
          status: "failure",
          metadata: { reasons: qaResult.reasons },
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
        1, // business_id column
        lead["business_id"] ?? "",
        8, // approval_id column
        approvalId
      );

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

  await log({
    agent: "outreach",
    action: "run_completed",
    status: "success",
    metadata: { queued, failed },
  });

  await sendToChester(
    `*Outreach complete*\nEmails queued for your approval: ${queued} | Failed QA or errors: ${failed}\nCheck your inbox for approval links.`
  );
}
