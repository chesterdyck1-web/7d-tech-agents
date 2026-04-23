// Cron route — fires at 6 AM ET daily (11:00 UTC).
// Runs the Prospecting Agent to find new leads.

import { NextRequest, NextResponse } from "next/server";
import { runProspecting } from "@/agents/prospecting/index";
import { env } from "@/lib/env";
import { log } from "@/lib/logger";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runProspecting();
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    await log({
      agent: "prospecting",
      action: "cron_run",
      status: "failure",
      errorMessage: String(err),
    });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
