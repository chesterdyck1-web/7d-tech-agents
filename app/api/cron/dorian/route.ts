// Dorian sales cron — runs weekly on Fridays at 8 AM UTC.
// Analyzes Vapi call transcripts, sends coaching brief, queues script proposals.

import { NextRequest, NextResponse } from "next/server";
import { runSalesReview } from "@/agents/dorian/index";
import { log } from "@/lib/logger";
import { env } from "@/lib/env";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await runSalesReview();
    return NextResponse.json({ ok: true });
  } catch (err) {
    await log({
      agent: "dorian",
      action: "sales_cron_failed",
      status: "failure",
      errorMessage: String(err),
    });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
