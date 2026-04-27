// Red Team cron — fires every Monday at 2 PM UTC.
// The handler skips unless it is the first Monday of the month.

import { NextRequest, NextResponse } from "next/server";
import { runRedTeamAudit, isFirstMondayOfMonth } from "@/agents/red-team/index";
import { log } from "@/lib/logger";
import { env } from "@/lib/env";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isFirstMondayOfMonth()) {
    return NextResponse.json({ ok: true, skipped: "Not first Monday of month" });
  }

  try {
    await runRedTeamAudit();
    return NextResponse.json({ ok: true });
  } catch (err) {
    await log({
      agent: "redteam",
      action: "audit_cron_failed",
      status: "failure",
      errorMessage: String(err),
    });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
