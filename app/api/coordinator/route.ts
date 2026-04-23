// Telegram webhook endpoint — receives messages from @sevendtechbot.
// Returns 200 to Telegram immediately, then runs agent work in the background.
// This prevents Telegram from retrying when agent runs take longer than 10 seconds.

import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { parseIncomingMessage, isFromChester, sendToChester } from "@/lib/telegram";
import { handleCoordinatorMessage } from "@/agents/coordinator/index";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const message = parseIncomingMessage(body);

  // Silently ignore non-text updates (stickers, photos, etc.)
  if (!message) return NextResponse.json({ ok: true });

  // Security: ignore messages from anyone other than Chester
  if (!isFromChester(message.chatId)) {
    return NextResponse.json({ ok: true });
  }

  // Run agent work after response is sent so Telegram doesn't retry
  waitUntil(
    handleCoordinatorMessage(message.text).catch(async (err) => {
      console.error("[coordinator] Error handling message:", err);
      await sendToChester(
        "Something went wrong processing that. Check the Action Log for details."
      );
    })
  );

  return NextResponse.json({ ok: true });
}
