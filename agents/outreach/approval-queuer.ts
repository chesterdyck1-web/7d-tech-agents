// Writes a drafted email to the Approval Queue and emails Chester the approval link.

import { appendToSheet } from "@/lib/google-sheets";
import { sendEmail } from "@/lib/gmail";
import { generateApprovalToken, buildApprovalUrl } from "@/lib/approval-token";
import { env } from "@/lib/env";
import { randomUUID } from "crypto";

export interface QueueApprovalInput {
  businessId: string;
  toName: string;
  toEmail: string;
  subject: string;
  body: string;
  qaStatus: "passed" | "failed";
}

export async function queueForApproval(input: QueueApprovalInput): Promise<string> {
  const approvalId = randomUUID();
  const token = await generateApprovalToken(approvalId, "chester_outreach");
  const approvalUrl = buildApprovalUrl(token);
  const now = new Date().toISOString();

  await appendToSheet("Approval Queue", [
    approvalId,
    "outreach_email",
    "chesterdyck1@gmail.com",
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

  await sendEmail({
    to: "chesterdyck1@gmail.com",
    subject: `Outreach ready - ${input.toName} at ${input.subject.slice(0, 40)}`,
    bodyHtml: `
      <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;padding:2rem;color:#1a1a1a;">
        <p style="font-size:0.8rem;letter-spacing:0.12em;text-transform:uppercase;color:#888;margin-bottom:1.5rem;">7D Tech - Outreach Approval</p>

        <p style="margin-bottom:0.5rem;"><strong>To:</strong> ${input.toName} &lt;${input.toEmail}&gt;</p>
        <p style="margin-bottom:0.5rem;"><strong>Subject:</strong> ${input.subject}</p>

        <div style="background:#f5f5f5;padding:1rem;border-radius:4px;margin:1rem 0 2rem;">
          ${input.body.replace(/\n/g, "<br>")}
        </div>

        <a href="${approvalUrl}" style="display:inline-block;background:#2d6a4f;color:#fff;padding:0.85rem 2rem;border-radius:5px;text-decoration:none;font-size:0.95rem;">Approve - Send Email</a>

        <p style="margin-top:1.5rem;font-size:0.8rem;color:#aaa;">Single-use link. Expires in 24 hours.</p>
      </div>
    `,
  });

  return approvalId;
}
