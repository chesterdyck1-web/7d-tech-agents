// Cron route — fires at 8 AM ET every day (13:00 UTC).
// Sends Chester's daily brief via Telegram.

import { NextRequest, NextResponse } from "next/server";
import { sendDailySummary } from "@/agents/coordinator/daily-summary";
import { env } from "@/lib/env";
import { log } from "@/lib/logger";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await sendDailySummary();
    await log({ agent: "coordinator", action: "daily_summary_sent", status: "success" });
    return NextResponse.json({ ok: true });
  } catch (err) {
    await log({
      agent: "coordinator",
      action: "daily_summary_sent",
      status: "failure",
      errorMessage: String(err),
    });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
