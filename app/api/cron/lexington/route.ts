// Lexington legal cron — runs weekly on Fridays at 9 AM UTC.
// Audits CASL compliance, monitors ToS pages, and checks GST/HST deadlines.

import { NextRequest, NextResponse } from "next/server";
import { runLegalReview } from "@/agents/lexington/index";
import { log } from "@/lib/logger";
import { env } from "@/lib/env";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await runLegalReview();
    return NextResponse.json({ ok: true });
  } catch (err) {
    await log({
      agent: "lexington",
      action: "legal_cron_failed",
      status: "failure",
      errorMessage: String(err),
    });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
