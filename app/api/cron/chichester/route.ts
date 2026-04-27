// Chichester tech cron — runs weekly on Mondays at 10 AM UTC.
// Scans for AI model updates and outdated npm dependencies.

import { NextRequest, NextResponse } from "next/server";
import { runTechReview } from "@/agents/chichester/index";
import { log } from "@/lib/logger";
import { env } from "@/lib/env";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await runTechReview();
    return NextResponse.json({ ok: true });
  } catch (err) {
    await log({
      agent: "chichester",
      action: "tech_cron_failed",
      status: "failure",
      errorMessage: String(err),
    });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
