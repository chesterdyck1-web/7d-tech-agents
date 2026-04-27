// Intelligence cron — runs Monday at 12 PM ET (0 12 * * 1 UTC).
// Fires one hour after the performance cron so metrics are already written.

import { NextRequest, NextResponse } from "next/server";
import { runIntelligenceBrief } from "@/agents/intelligence/index";
import { log } from "@/lib/logger";
import { env } from "@/lib/env";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await runIntelligenceBrief();
    return NextResponse.json({ ok: true });
  } catch (err) {
    await log({
      agent: "intelligence",
      action: "brief_cron_failed",
      status: "failure",
      errorMessage: String(err),
    });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
