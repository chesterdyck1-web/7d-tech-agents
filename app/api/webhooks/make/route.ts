// First Response Rx webhook — fired by each client's Make.com scenario when a prospect submits their contact form.
// Drafts a personalized reply using the client's Claude prompt, queues it for the owner's one-tap approval.

import { NextRequest, NextResponse } from "next/server";
import { readSheetAsObjects, appendToSheet } from "@/lib/google-sheets";
import { claude } from "@/lib/claude";
import { sendEmail } from "@/lib/gmail";
import { generateApprovalToken, buildApprovalUrl } from "@/lib/approval-token";
import { log } from "@/lib/logger";
import { env } from "@/lib/env";
import { randomUUID } from "crypto";

interface FormSubmission {
  client_id: string;
  name: string;
  email: string;
  message: string;
  _test?: boolean;
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get("X-Make-Secret");
  if (secret !== env.MAKE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: FormSubmission;
  try {
    body = await req.json() as FormSubmission;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { client_id, name, email, message, _test } = body;

  if (!client_id || !name || !email || !message) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Test submissions validate the chain — no approval email sent
  if (_test) {
    await log({
      agent: "fulfillment",
      action: "test_submission_received",
      entityId: client_id,
      status: "success",
    });
    return NextResponse.json({ ok: true, test: true });
  }

  const clients = await readSheetAsObjects("Clients");
  const client = clients.find((c) => c["client_id"] === client_id);

  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const clientPrompt = client["claude_prompt"];
  if (!clientPrompt) {
    return NextResponse.json({ error: "Client prompt not configured" }, { status: 422 });
  }

  // Draft the reply using the business's custom Claude prompt
  const draftRes = await claude({
    system: clientPrompt,
    userMessage: `Prospect name: ${name}\nProspect email: ${email}\n\nTheir message:\n${message}`,
    maxTokens: 400,
    label: "fulfillment:draft-client-response",
  });

  const draftBody = draftRes.text.trim();
  const subject = `Re: Your inquiry about ${client["business_name"] ?? "our services"}`;

  // Write to Approval Queue
  const approvalId = randomUUID();
  const token = await generateApprovalToken(approvalId, "client_response");
  const approvalUrl = buildApprovalUrl(token);
  const now = new Date().toISOString();

  await appendToSheet("Approval Queue", [
    approvalId,
    "client_response",
    client["owner_email"] ?? "",
    subject,
    draftBody,
    email,        // prospect's email — where the reply goes when approved
    name,         // prospect's name
    "pending",
    "n/a",
    now,
    "",           // decided_at
    "FALSE",      // token_used
    client_id,
  ]);

  // Email the business owner with the draft and a one-tap approval button
  await sendEmail({
    to: client["owner_email"] ?? "",
    subject: `New inquiry from ${name} - review your reply`,
    bodyHtml: `
      <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;padding:2rem;color:#1a1a1a;">
        <p style="font-size:0.8rem;letter-spacing:0.12em;text-transform:uppercase;color:#888;margin-bottom:1.5rem;">First Response Rx</p>

        <p>Hi ${client["owner_name"] ?? "there"},</p>
        <p style="margin:1rem 0;">New inquiry from <strong>${name}</strong> (${email}):</p>

        <div style="background:#f5f5f5;padding:1rem 1.25rem;border-radius:4px;margin:1rem 0;font-style:italic;color:#555;border-left:3px solid #ccc;">
          ${message.replace(/\n/g, "<br>")}
        </div>

        <p style="margin:1rem 0;">Draft reply:</p>

        <div style="background:#fff;border:1px solid #e0e0e0;padding:1.5rem;border-radius:4px;margin:1rem 0;">
          ${draftBody.replace(/\n/g, "<br>")}
        </div>

        <a href="${approvalUrl}" style="display:inline-block;background:#1a1a1a;color:#fff;padding:0.85rem 2rem;border-radius:5px;text-decoration:none;font-size:0.95rem;margin:1rem 0;">Send This Reply</a>

        <p style="margin-top:1.5rem;font-size:0.8rem;color:#aaa;">One tap to send. Link expires in 1 hour.</p>
      </div>
    `,
  });

  await log({
    agent: "fulfillment",
    action: "client_response_queued",
    entityId: client_id,
    status: "success",
    metadata: { prospectEmail: email, approvalId } as unknown as Record<string, unknown>,
  });

  return NextResponse.json({ ok: true });
}
