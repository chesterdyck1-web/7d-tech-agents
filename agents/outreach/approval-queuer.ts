// Writes a drafted email to the Approval Queue and pings Chester via Telegram.
// Chester approves from the /dashboard — no email link is sent to his inbox.
// If autonomous_outreach setting is "true", skips the queue and sends directly.

import { appendToSheet, ensureSheetTab } from "@/lib/google-sheets";
import { sendEmail } from "@/lib/gmail";
import { sendToChester } from "@/lib/telegram";
import { getSetting } from "@/lib/settings";
import { log } from "@/lib/logger";
import { randomUUID } from "crypto";

const APPROVAL_QUEUE_HEADERS = [
  "approval_id", "type", "sender", "subject", "body",
  "to_email", "to_name", "status", "qa_status",
  "created_at", "decided_at", "used", "business_id",
];

export interface QueueApprovalInput {
  businessId: string;
  toName: string;
  toEmail: string;
  subject: string;
  body: string;
  qaStatus: "passed" | "failed";
}

export async function queueForApproval(input: QueueApprovalInput): Promise<string> {
  await ensureSheetTab("Approval Queue", APPROVAL_QUEUE_HEADERS);
  const isAutonomous = (await getSetting("autonomous_outreach")) === "true";

  if (isAutonomous) {
    await sendEmail({
      to: input.toEmail,
      from: "chester@7dtech.ca",
      subject: input.subject,
      bodyHtml: input.body.replace(/\n/g, "<br>"),
    });

    const approvalId = randomUUID();
    const now = new Date().toISOString();

    await appendToSheet("Approval Queue", [
      approvalId,
      "outreach_email",
      "chester@7dtech.ca",
      input.subject,
      input.body,
      input.toEmail,
      input.toName,
      "auto_sent",
      input.qaStatus,
      now,
      now,
      "TRUE",
      input.businessId,
    ]);

    await log({
      agent: "outreach",
      action: "autonomous_send",
      entityId: approvalId,
      status: "success",
      metadata: { toEmail: input.toEmail, toName: input.toName } as unknown as Record<string, unknown>,
    });

    return approvalId;
  }

  const approvalId = randomUUID();
  const now = new Date().toISOString();

  await appendToSheet("Approval Queue", [
    approvalId,
    "outreach_email",
    "chester@7dtech.ca",
    input.subject,
    input.body,
    input.toEmail,
    input.toName,
    "pending",
    input.qaStatus,
    now,
    "",
    "FALSE",
    input.businessId,
  ]);

  // Telegram ping — Chester approves from the dashboard, not his inbox
  await sendToChester(
    `*New outreach draft ready*\nTo: ${input.toName} (${input.toEmail})\nSubject: ${input.subject}\n\nApprove at 7dtech.ca/dashboard`
  );

  return approvalId;
}
