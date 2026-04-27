// Reply tracker cron — polls Gmail twice daily for prospect replies.
// Runs at 9 AM and 3 PM UTC.

import { NextRequest, NextResponse } from "next/server";
import { trackReplies } from "@/agents/outreach/reply-tracker";
import { log } from "@/lib/logger";
import { env } from "@/lib/env";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await trackReplies();
    return NextResponse.json({ ok: true });
  } catch (err) {
    await log({
      agent: "outreach",
      action: "reply_tracker_cron_failed",
      status: "failure",
      errorMessage: String(err),
    });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
