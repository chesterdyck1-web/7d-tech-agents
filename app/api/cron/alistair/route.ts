// Alistair maintenance cron — runs daily at 6 AM UTC.
// Checks system health and auto-fixes inactive client Make scenarios.

import { NextRequest, NextResponse } from "next/server";
import { runMaintenanceCheck } from "@/agents/alistair/index";
import { log } from "@/lib/logger";
import { env } from "@/lib/env";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await runMaintenanceCheck();
    return NextResponse.json({ ok: true });
  } catch (err) {
    await log({
      agent: "alistair",
      action: "maintenance_cron_failed",
      status: "failure",
      errorMessage: String(err),
    });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
