// Demo webhook — powers the 7dtech.ca contact form speed-to-lead demo.
// Receives form submission → Claude drafts reply → Chester gets approval email.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { claude } from "@/lib/claude";
import { sendEmail } from "@/lib/gmail";
import { appendToSheet } from "@/lib/google-sheets";
import { generateApprovalToken, buildApprovalUrl } from "@/lib/approval-token";
import { log } from "@/lib/logger";
import { SEVEN_D_TECH_SYSTEM_PROMPT } from "@/config/7dtech-prompt";
import { randomUUID } from "crypto";
import { env } from "@/lib/env";

const bodySchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  business: z.string().min(1).max(100),
  message: z.string().min(1).max(2000),
});

export async function POST(req: NextRequest) {
  let body;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const approvalId = randomUUID();

  try {
    // Draft the reply with Claude
    const draft = await claude({
      system: SEVEN_D_TECH_SYSTEM_PROMPT,
      userMessage: `Inquiry from ${body.name} at ${body.business} (${body.email}):\n\n${body.message}`,
      maxTokens: 400,
      label: "demo:draft-reply",
    });

    const subject = `Re: Inquiry from ${body.name} - ${body.business}`;

    // Write to Approval Queue
    const token = await generateApprovalToken(approvalId, "chester_outreach");
    const approvalUrl = buildApprovalUrl(token);
    const now = new Date().toISOString();

    await appendToSheet("Approval Queue", [
      approvalId,
      "outreach_email",
      env.NEXT_PUBLIC_APP_URL,
      subject,
      draft.text,
      body.email,
      body.name,
      "pending",
      "passed",
      now,
      "",
      "FALSE",
      "7dtech_self",
    ]);

    // Email Chester the approval request
    await sendEmail({
      to: "chester@7dtech.ca",
      subject: `New inquiry from ${body.name} - tap to approve reply`,
      bodyHtml: `
        <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;padding:2rem;color:#1a1a1a;">
          <p style="font-size:0.8rem;letter-spacing:0.12em;text-transform:uppercase;color:#888;margin-bottom:1.5rem;">7D Tech — Approval Required</p>

          <p style="margin-bottom:1rem;"><strong>From:</strong> ${body.name} at ${body.business} (${body.email})</p>
          <p style="margin-bottom:0.5rem;"><strong>Their message:</strong></p>
          <p style="background:#f5f5f5;padding:1rem;border-radius:4px;margin-bottom:1.5rem;">${body.message.replace(/\n/g, "<br>")}</p>

          <p style="margin-bottom:0.5rem;"><strong>Drafted reply:</strong></p>
          <p style="background:#f0faf4;border:1px solid #b7dfca;padding:1rem;border-radius:4px;margin-bottom:2rem;">${draft.text.replace(/\n/g, "<br>")}</p>

          <a href="${approvalUrl}" style="display:inline-block;background:#2d6a4f;color:#fff;padding:0.85rem 2rem;border-radius:5px;text-decoration:none;font-size:0.95rem;">Approve — Send Reply</a>

          <p style="margin-top:1.5rem;font-size:0.8rem;color:#aaa;">This link expires in 24 hours and can only be used once.</p>
        </div>
      `,
    });

    await log({
      agent: "coordinator",
      action: "demo_approval_queued",
      entityId: approvalId,
      status: "success",
      metadata: { from: body.email, business: body.business },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    await log({
      agent: "coordinator",
      action: "demo_approval_queued",
      entityId: approvalId,
      status: "failure",
      errorMessage: String(err),
    });
    console.error("[demo webhook] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
