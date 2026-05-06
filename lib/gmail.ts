// Gmail API helpers — send and read emails. Outgoing mail uses chester@7dtech.ca.
// All functions wrap the Google API in try/catch and retry on transient failures.
// sendEmail also enforces a 100-email/day self-imposed quota.

import { google } from "googleapis";
import { getAuthClient } from "@/lib/google-auth";
import { withRetry } from "@/lib/retry";
import { withCircuitBreaker, CIRCUIT } from "@/lib/circuit-breaker";
import { rateLimiter, checkGmailDailyQuota } from "@/lib/rate-limiter";

function gmail() {
  return google.gmail({ version: "v1", auth: getAuthClient() });
}

export interface EmailPayload {
  to: string;
  subject: string;
  bodyHtml: string;
  replyTo?: string;
  from?: string;
  skipQuotaCheck?: boolean; // set true for system emails that must always send
}

// Send an email. Returns the sent message ID.
// Throws if the daily 100-email quota is exceeded (unless skipQuotaCheck is set).
export async function sendEmail(payload: EmailPayload): Promise<string> {
  if (!payload.skipQuotaCheck) {
    await rateLimiter.gmail.send();
    const quota = await checkGmailDailyQuota();
    if (!quota.allowed) {
      throw new Error(
        `Gmail daily quota reached (${quota.sent}/${quota.limit} emails sent today). No more emails will be sent until tomorrow.`
      );
    }
  }

  const raw = buildRawEmail(payload);

  return withCircuitBreaker(CIRCUIT.GMAIL, () =>
    withRetry(async () => {
      const res = await gmail().users.messages.send({
        userId: "me",
        requestBody: { raw },
      });
      return res.data.id ?? "";
    })
  );
}

// Build base64url-encoded RFC 2822 email message.
function buildRawEmail(payload: EmailPayload): string {
  const lines = [
    `To: ${payload.to}`,
    ...(payload.from ? [`From: ${payload.from}`] : []),
    `Subject: ${payload.subject}`,
    `Content-Type: text/html; charset=utf-8`,
    ...(payload.replyTo ? [`Reply-To: ${payload.replyTo}`] : []),
    "",
    payload.bodyHtml,
  ].join("\r\n");

  return Buffer.from(lines)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Search Gmail for messages matching a query.
// Returns array of { id, subject, from, snippet }.
export async function searchEmails(
  query: string,
  maxResults = 10
): Promise<{ id: string; subject: string; from: string; snippet: string }[]> {
  return withCircuitBreaker(CIRCUIT.GMAIL, () =>
    withRetry(async () => {
      const listRes = await gmail().users.messages.list({
        userId: "me",
        q: query,
        maxResults,
      });

      const messages = listRes.data.messages ?? [];
      if (messages.length === 0) return [];

      const results = await Promise.all(
        messages.map(async (msg) => {
          const detail = await gmail().users.messages.get({
            userId: "me",
            id: msg.id!,
            format: "metadata",
            metadataHeaders: ["Subject", "From"],
          });
          const headers = detail.data.payload?.headers ?? [];
          const get = (name: string) =>
            headers.find((h) => h.name === name)?.value ?? "";
          return {
            id: msg.id!,
            subject: get("Subject"),
            from: get("From"),
            snippet: detail.data.snippet ?? "",
          };
        })
      );

      return results;
    })
  );
}
