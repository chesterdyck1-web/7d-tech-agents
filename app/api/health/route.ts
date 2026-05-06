// Health check endpoint — verifies all integrations are reachable.
// GET /api/health                    → 200 ok / 503 degraded (public, minimal)
// GET /api/health?secret=CRON_SECRET → full JSON with per-service status + circuit state
// Alistair calls this every 30 minutes and alerts if status is degraded.

import { NextRequest, NextResponse } from "next/server";
import { readSheetAsObjects } from "@/lib/google-sheets";
import { searchEmails } from "@/lib/gmail";
import { listScenarios } from "@/lib/make";
import { listCalls } from "@/lib/vapi";
import { getCircuitStatus } from "@/lib/circuit-breaker";
import { sendToChester } from "@/lib/telegram";
import { env } from "@/lib/env";

interface CheckResult {
  ok: boolean;
  latencyMs: number;
  error?: string;
}

async function timed(fn: () => Promise<void>): Promise<CheckResult> {
  const start = Date.now();
  try {
    await fn();
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - start, error: String(err) };
  }
}

const checkSheets = () =>
  timed(async () => {
    await readSheetAsObjects("Action Log");
  });

const checkGmail = () =>
  timed(async () => {
    await searchEmails("in:sent newer_than:1d", 1);
  });

const checkMake = () =>
  timed(async () => {
    await listScenarios();
  });

const checkClaude = () =>
  timed(async () => {
    const res = await fetch("https://api.anthropic.com/v1/models", {
      headers: {
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
    });
    if (!res.ok) throw new Error(`Status ${res.status}`);
  });

const checkStripe = () =>
  timed(async () => {
    const { getRevenueSummary } = await import("@/lib/stripe-reader");
    await getRevenueSummary();
  });

const checkVapi = () =>
  timed(async () => {
    await listCalls(1);
  });

const checkTelegram = () =>
  timed(async () => {
    const res = await fetch(
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getMe`
    );
    if (!res.ok) throw new Error(`Telegram getMe failed: ${res.status}`);
    const data = (await res.json()) as { ok: boolean };
    if (!data.ok) throw new Error("Telegram bot not responding");
  });

// Critical services: system is "down" if any of these fail
const CRITICAL = ["sheets", "claude", "gmail"];

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  const detailed = secret === env.CRON_SECRET;

  // Run all checks in parallel
  const [sheets, gmail, make, claude, stripe, vapi, telegram] =
    await Promise.all([
      checkSheets(),
      checkGmail(),
      checkMake(),
      checkClaude(),
      checkStripe(),
      checkVapi(),
      checkTelegram(),
    ]);

  const checks = { sheets, gmail, make, claude, stripe, vapi, telegram };
  const circuits = getCircuitStatus();

  const criticalOk = CRITICAL.every((k) => checks[k as keyof typeof checks].ok);
  const allOk = Object.values(checks).every((c) => c.ok);
  const status = allOk ? "ok" : criticalOk ? "degraded" : "down";

  // Open circuits count as degraded even if the check passed (may have just recovered)
  const hasOpenCircuits = Object.values(circuits).some((c) => c.state === "open");
  const effectiveStatus =
    status === "ok" && hasOpenCircuits ? "degraded" : status;

  if (!detailed) {
    return NextResponse.json(
      { status: effectiveStatus },
      { status: effectiveStatus === "ok" ? 200 : 503 }
    );
  }

  return NextResponse.json(
    {
      status: effectiveStatus,
      checks,
      circuits,
      timestamp: new Date().toISOString(),
    },
    { status: effectiveStatus === "ok" ? 200 : 503 }
  );
}

// Called by Alistair cron — runs health check and alerts Edmund if degraded.
export async function POST(req: NextRequest) {
  const auth = req.headers.get("Authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [sheets, gmail, make, claude, stripe, vapi, telegram] =
    await Promise.all([
      checkSheets(),
      checkGmail(),
      checkMake(),
      checkClaude(),
      checkStripe(),
      checkVapi(),
      checkTelegram(),
    ]);

  const checks = { sheets, gmail, make, claude, stripe, vapi, telegram };
  const circuits = getCircuitStatus();

  const failed = Object.entries(checks)
    .filter(([, v]) => !v.ok)
    .map(([k, v]) => `${k}: ${v.error ?? "unknown error"}`);

  const openCircuits = Object.entries(circuits)
    .filter(([, v]) => v.state === "open")
    .map(([k]) => k);

  const criticalFailed = failed.filter((f) => CRITICAL.some((c) => f.startsWith(c)));
  const status = failed.length === 0 ? "ok" : criticalFailed.length > 0 ? "down" : "degraded";

  if (status !== "ok") {
    const lines: string[] = [`<b>ALISTAIR — HEALTH CHECK ${status.toUpperCase()}</b>`];
    if (failed.length > 0) lines.push(`Failed: ${failed.join(", ")}`);
    if (openCircuits.length > 0) lines.push(`Open circuits: ${openCircuits.join(", ")}`);
    await sendToChester(lines.join("\n"), "HTML").catch(() => null);
  }

  return NextResponse.json({
    status,
    checks,
    circuits,
    timestamp: new Date().toISOString(),
  });
}
