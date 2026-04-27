// Monitoring cron — checks for failure spikes every 6 hours.
// Alerts Chester immediately via Telegram if any agent is degraded.

import { NextRequest, NextResponse } from "next/server";
import { runFailureCheck } from "@/agents/monitoring/index";
import { log } from "@/lib/logger";
import { env } from "@/lib/env";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await runFailureCheck();
    return NextResponse.json({ ok: true });
  } catch (err) {
    await log({
      agent: "monitoring",
      action: "monitor_cron_failed",
      status: "failure",
      errorMessage: String(err),
    });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
