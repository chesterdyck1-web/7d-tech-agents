// Polls Gmail for replies from prospects we have emailed.
// When a reply is detected, alerts Chester and stops the email sequence for that lead.
// Tracks processed replies in the Action Log to avoid duplicate alerts.

import { readSheetAsObjects } from "@/lib/google-sheets";
import { searchEmails } from "@/lib/gmail";
import { sendToChester } from "@/lib/telegram";
import { log } from "@/lib/logger";
import { markReplied } from "./sequence-engine";

function isInLast30Days(dateStr: string): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return d >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
}

// Extract a bare email address from a Gmail "From" header (e.g. "Jane Doe <jane@example.com>")
function extractEmail(from: string): string {
  const match = from.match(/<(.+?)>/) ?? from.match(/(\S+@\S+)/);
  return match?.[1]?.toLowerCase() ?? from.toLowerCase().trim();
}

export async function trackReplies(): Promise<void> {
  // Find all outreach emails sent in the last 30 days
  const queue = await readSheetAsObjects("Approval Queue");
  const sentEmails = queue.filter(
    (r) =>
      r["type"] === "outreach_email" &&
      r["status"] === "approved" &&
      isInLast30Days(r["decided_at"] ?? "")
  );

  if (sentEmails.length === 0) return;

  // Load Action Log to find which replies we've already alerted on
  const actionLog = await readSheetAsObjects("Action Log");
  const alreadyAlerted = new Set(
    actionLog
      .filter((r) => r["action"] === "reply_detected")
      .map((r) => r["entity_id"] ?? "")
  );

  let newReplies = 0;

  for (const sent of sentEmails) {
    const toEmail = sent["to_email"] ?? "";
    const toName = sent["to_name"] ?? "Unknown";
    if (!toEmail) continue;

    // Use the approval_id as the idempotency key
    const approvalId = sent["approval_id"] ?? sent["approval_id"] ?? "";
    if (alreadyAlerted.has(approvalId)) continue;

    try {
      // Search Gmail inbox for any email from this prospect
      const replies = await searchEmails(`from:${toEmail} in:inbox`, 1);

      if (replies.length === 0) continue;

      const reply = replies[0]!;

      await log({
        agent: "outreach",
        action: "reply_detected",
        entityId: approvalId,
        status: "success",
        metadata: {
          toEmail,
          toName,
          replySubject: reply.subject,
          replySnippet: reply.snippet.slice(0, 100),
        } as unknown as Record<string, unknown>,
      });

      await sendToChester(
        `*PROSPECT REPLIED — ${toName}*\n${toEmail}\n\nSubject: ${reply.subject}\n"${reply.snippet.slice(0, 150)}..."\n\nCheck your Gmail inbox.`
      );

      // Stop the email sequence — no more follow-ups needed
      const businessId = sent["business_id"] ?? "";
      if (businessId) {
        await markReplied(businessId).catch(() => null);
      }

      newReplies++;

      // Small delay between Gmail searches to avoid rate limits
      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      await log({
        agent: "outreach",
        action: "reply_check_failed",
        entityId: approvalId,
        status: "failure",
        errorMessage: String(err),
      });
    }
  }

  if (newReplies > 0) {
    await log({
      agent: "outreach",
      action: "reply_tracker_run",
      status: "success",
      metadata: { newReplies, checked: sentEmails.length } as unknown as Record<string, unknown>,
    });
  }
}
