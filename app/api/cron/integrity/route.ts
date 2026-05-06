// Cron: data integrity check — runs at 5 AM ET (10 AM UTC) daily, before prospecting.

import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { runIntegrityCheck } from "@/agents/integrity/index";
import { log } from "@/lib/logger";
import { env } from "@/lib/env";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("Authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  waitUntil(
    runIntegrityCheck().catch(async (err) => {
      await log({
        agent: "integrity",
        action: "integrity_cron_error",
        status: "failure",
        errorMessage: String(err),
      });
    })
  );

  return NextResponse.json({ ok: true });
}
