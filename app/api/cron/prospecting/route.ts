// Cron route — fires at 6 AM ET daily (11:00 UTC).
// Runs the demand-driven daily outreach flow: capacity check → existing leads
// → prospect if needed → Cornelius drafts → Chester's dashboard.

import { NextRequest, NextResponse } from "next/server";
import { runDailyOutreachFlow } from "@/lib/daily-flow";
import { env } from "@/lib/env";
import { log } from "@/lib/logger";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ?limit=N overrides capacity calculation — for testing only
  const limitParam = req.nextUrl.searchParams.get("limit");
  const overrideSlots = limitParam ? parseInt(limitParam, 10) : undefined;

  try {
    const result = await runDailyOutreachFlow(overrideSlots);
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    await log({
      agent: "coordinator",
      action: "daily_flow_cron",
      status: "failure",
      errorMessage: String(err),
    });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
