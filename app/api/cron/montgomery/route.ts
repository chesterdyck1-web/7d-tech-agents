// Montgomery Black Swan Agent cron — runs every Monday at 5 AM UTC.
// Fires before all other weekly agents so signals are ready for the daily brief.

import { NextRequest, NextResponse } from "next/server";
import { runMontgomery } from "@/agents/montgomery/index";
import { log } from "@/lib/logger";
import { env } from "@/lib/env";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await runMontgomery();
    return NextResponse.json({ ok: true });
  } catch (err) {
    await log({
      agent: "montgomery",
      action: "black_swan_cron_failed",
      status: "failure",
      errorMessage: String(err),
    });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
