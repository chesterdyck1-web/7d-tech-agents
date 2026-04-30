// Dashboard settings API — read/write the autonomous_outreach toggle.
// GET ?secret=xxx → { autonomousOutreach: boolean }
// POST { secret, autonomousOutreach: boolean } → { ok: true }

import { NextRequest, NextResponse } from "next/server";
import { getSetting, setSetting } from "@/lib/settings";
import { log } from "@/lib/logger";
import { env } from "@/lib/env";

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (secret !== env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const val = await getSetting("autonomous_outreach");
  return NextResponse.json({ autonomousOutreach: val === "true" });
}

export async function POST(req: NextRequest) {
  const body = await req.json() as { secret: string; autonomousOutreach: boolean };
  if (body.secret !== env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await setSetting("autonomous_outreach", body.autonomousOutreach ? "true" : "false");
  await log({
    agent: "coordinator",
    action: body.autonomousOutreach ? "autonomous_outreach_enabled" : "autonomous_outreach_disabled",
    entityId: "settings",
    status: "success",
    metadata: {},
  });
  return NextResponse.json({ ok: true });
}
