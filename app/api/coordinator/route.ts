// Telegram webhook endpoint — receives messages from @sevendtechbot.
// Telegram POSTs here every time Chester sends a message.

import { NextRequest, NextResponse } from "next/server";
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

  try {
    await handleCoordinatorMessage(message.text);
  } catch (err) {
    console.error("[coordinator] Error handling message:", err);
    await sendToChester(
      "Something went wrong processing that. Check the Action Log for details."
    );
  }

  return NextResponse.json({ ok: true });
}
