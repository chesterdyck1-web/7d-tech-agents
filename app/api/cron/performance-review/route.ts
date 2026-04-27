// Cron route — fires Monday at 6 AM ET (11:00 UTC).
// Calculates last week's KPIs and writes them to the Performance Metrics sheet.
// Must run before the Intelligence Agent brief (Monday 8 AM ET).

import { NextRequest, NextResponse } from "next/server";
import { runPerformanceReview } from "@/agents/performance/index";
import { env } from "@/lib/env";
import { log } from "@/lib/logger";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await runPerformanceReview();
    return NextResponse.json({ ok: true });
  } catch (err) {
    await log({
      agent: "coordinator",
      action: "performance_review_cron_failed",
      status: "failure",
      errorMessage: String(err),
    });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
