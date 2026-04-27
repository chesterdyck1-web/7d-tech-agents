// Health check endpoint — verifies all integrations are reachable.
// GET /api/health                  → 200 ok / 503 degraded (public, no details)
// GET /api/health?secret=CRON_SECRET → full JSON report with per-integration status

import { NextRequest, NextResponse } from "next/server";
import { readSheetAsObjects } from "@/lib/google-sheets";
import { searchEmails } from "@/lib/gmail";
import { listScenarios } from "@/lib/make";
import { env } from "@/lib/env";

interface CheckResult {
  ok: boolean;
  latencyMs: number;
  error?: string;
}

async function checkSheets(): Promise<CheckResult> {
  const start = Date.now();
  try {
    await readSheetAsObjects("Action Log");
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - start, error: String(err) };
  }
}

async function checkGmail(): Promise<CheckResult> {
  const start = Date.now();
  try {
    await searchEmails("in:sent newer_than:1d", 1);
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - start, error: String(err) };
  }
}

async function checkMake(): Promise<CheckResult> {
  const start = Date.now();
  try {
    await listScenarios();
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - start, error: String(err) };
  }
}

async function checkClaude(): Promise<CheckResult> {
  const start = Date.now();
  try {
    const res = await fetch("https://api.anthropic.com/v1/models", {
      headers: {
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - start, error: String(err) };
  }
}

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  const detailed = secret === env.CRON_SECRET;

  const [sheets, gmail, make, claude] = await Promise.all([
    checkSheets(),
    checkGmail(),
    checkMake(),
    checkClaude(),
  ]);

  const allOk = sheets.ok && gmail.ok && make.ok && claude.ok;
  const status = allOk ? "ok" : "degraded";

  if (!detailed) {
    // Public endpoint returns minimal status only
    return NextResponse.json({ status }, { status: allOk ? 200 : 503 });
  }

  return NextResponse.json(
    {
      status,
      checks: {
        sheets,
        gmail,
        make,
        claude,
      },
      timestamp: new Date().toISOString(),
    },
    { status: allOk ? 200 : 503 }
  );
}
