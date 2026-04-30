// Cron route — fires at 9 AM ET daily (14:00 UTC) after prospecting adds fresh leads.
// Also accepts ?limit=N for test runs (e.g. ?limit=5 to test 5 leads only).

import { NextRequest, NextResponse } from "next/server";
import { runOutreach } from "@/agents/outreach/index";
import { env } from "@/lib/env";
import { log } from "@/lib/logger";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limitParam = req.nextUrl.searchParams.get("limit");
  const testLimit = limitParam ? parseInt(limitParam, 10) : undefined;

  try {
    await runOutreach(testLimit);
    return NextResponse.json({ ok: true, limit: testLimit ?? "default (20)" });
  } catch (err) {
    await log({
      agent: "outreach",
      action: "cron_run",
      status: "failure",
      errorMessage: String(err),
    });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
