// Franklin financial cron — runs daily at 7 AM UTC.
// Records revenue, costs, fund balances, and close rate to Financial Metrics sheet.
// Alerts Chester if profitability ratio drops below 2× or any clients are past due.

import { NextRequest, NextResponse } from "next/server";
import { runDailyFinancials } from "@/agents/franklin/index";
import { log } from "@/lib/logger";
import { env } from "@/lib/env";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await runDailyFinancials();
    return NextResponse.json({ ok: true });
  } catch (err) {
    await log({
      agent: "franklin",
      action: "financials_cron_failed",
      status: "failure",
      errorMessage: String(err),
    });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
