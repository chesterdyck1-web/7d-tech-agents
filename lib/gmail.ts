// Gmail API helpers — send and read emails. Outgoing mail uses chester@7dtech.ca.

import { google } from "googleapis";
import { getAuthClient } from "@/lib/google-auth";

function gmail() {
  return google.gmail({ version: "v1", auth: getAuthClient() });
}

export interface EmailPayload {
  to: string;
  subject: string;
  bodyHtml: string;
  replyTo?: string;
  from?: string;
}

// Send an email. Returns the sent message ID.
export async function sendEmail(payload: EmailPayload): Promise<string> {
  const raw = buildRawEmail(payload);
  const res = await gmail().users.messages.send({
    userId: "me",
    requestBody: { raw },
  });
  return res.data.id ?? "";
}

// Build base64url-encoded RFC 2822 email message.
function buildRawEmail(payload: EmailPayload): string {
  const lines = [
    `To: ${payload.to}`,
    ...(payload.from ? [`From: ${payload.from}`] : []),
    `Subject: ${payload.subject}`,
    `Content-Type: text/html; charset=utf-8`,
    ...(payload.replyTo ? [`Reply-To: ${payload.replyTo}`] : []),
    "",  // required blank line between headers and body per RFC 2822
    payload.bodyHtml,
  ].join("\r\n");

  return Buffer.from(lines)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Check unread messages matching a Gmail search query.
// Returns array of { id, subject, from, snippet }.
export async function searchEmails(query: string, maxResults = 10) {
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
}
