// Telegram Bot API helpers — send messages and parse incoming webhooks.
// All messages to Chester go through sendToChester().

import { env } from "@/lib/env";
import { withRetry } from "@/lib/retry";
import { withCircuitBreaker, CIRCUIT } from "@/lib/circuit-breaker";

const BASE = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}`;

// Send a plain-text, Markdown, or HTML message to Chester.
// If Telegram rejects the message due to a parse error, the wrapper strips all
// formatting and retries as plain text — a plain brief is better than no brief.
export async function sendToChester(
  text: string,
  parseMode: "Markdown" | "HTML" | "none" = "Markdown"
): Promise<void> {
  const sendRaw = async (t: string, mode: "Markdown" | "HTML" | "none") => {
    const body: Record<string, unknown> = {
      chat_id: env.TELEGRAM_CHESTER_CHAT_ID,
      text: t,
    };
    if (mode !== "none") body["parse_mode"] = mode;

    await withCircuitBreaker(CIRCUIT.TELEGRAM, () =>
      withRetry(async () => {
        const res = await fetch(`${BASE}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const err = await res.text();
          throw new Error(`Telegram sendMessage failed: ${err}`);
        }
      }, {
        // Don't retry parse errors — they're permanent, not transient
        shouldRetry: (err) => !err.message.includes("can't parse entities"),
      })
    );
  };

  try {
    await sendRaw(text, parseMode);
  } catch (err) {
    const msg = String(err);
    if (parseMode !== "none" && msg.includes("can't parse entities")) {
      // Strip all HTML tags and Markdown special chars, retry as plain text
      const plain = text
        .replace(/<[^>]+>/g, "")
        .replace(/[*_`[\]()~>#+=|{}.!]/g, "");
      await sendRaw(plain, "none");
    } else {
      throw err;
    }
  }
}

// Parse the incoming Telegram webhook update.
// Returns the chat ID and text of the message, or null if not a text message.
export function parseIncomingMessage(body: unknown): {
  chatId: number;
  text: string;
  messageId: number;
} | null {
  if (
    typeof body !== "object" ||
    body === null ||
    !("message" in body)
  ) {
    return null;
  }

  const msg = (body as Record<string, unknown>)["message"];
  if (typeof msg !== "object" || msg === null) return null;

  const m = msg as Record<string, unknown>;
  const chat = m["chat"] as Record<string, unknown> | undefined;
  const text = m["text"];
  const messageId = m["message_id"];

  if (
    !chat ||
    typeof chat["id"] !== "number" ||
    typeof text !== "string" ||
    typeof messageId !== "number"
  ) {
    return null;
  }

  return { chatId: chat["id"], text, messageId };
}

// Verify the incoming message is from Chester's chat only.
export function isFromChester(chatId: number): boolean {
  return String(chatId) === env.TELEGRAM_CHESTER_CHAT_ID;
}

// Register the webhook URL with Telegram so messages POST to our API route.
export async function registerWebhook(webhookUrl: string): Promise<void> {
  const res = await fetch(`${BASE}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: webhookUrl }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Telegram setWebhook failed: ${err}`);
  }

  const data = (await res.json()) as { ok: boolean; description?: string };
  if (!data.ok) {
    throw new Error(`Telegram setWebhook error: ${data.description}`);
  }
}
