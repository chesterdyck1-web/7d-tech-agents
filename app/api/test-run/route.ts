// System integration test harness — runs every external API and critical path check.
// GET /api/test-run?secret=CRON_SECRET
// REMOVE THIS FILE before going live with real clients.

import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { claude } from "@/lib/claude";
import { readSheetAsObjects, appendToSheet } from "@/lib/google-sheets";
import { sendEmail } from "@/lib/gmail";
import { getOpenSlots } from "@/lib/google-calendar";
import { searchPlaces } from "@/lib/google-places";
import { generateApprovalToken, verifyApprovalToken } from "@/lib/approval-token";
import { listScenarios } from "@/lib/make";
import { google } from "googleapis";
import { getAuthClient } from "@/lib/google-auth";

interface TestResult {
  test: string;
  pass: boolean;
  details: string;
}

async function run(label: string, fn: () => Promise<string>): Promise<TestResult> {
  try {
    const details = await fn();
    return { test: label, pass: true, details };
  } catch (e) {
    return { test: label, pass: false, details: String(e) };
  }
}

// ── Step 1: Env audit ─────────────────────────────────────────────────────────

function envAudit(): TestResult[] {
  const required: Array<[string, string]> = [
    ["ANTHROPIC_API_KEY", env.ANTHROPIC_API_KEY],
    ["TELEGRAM_BOT_TOKEN", env.TELEGRAM_BOT_TOKEN],
    ["TELEGRAM_CHESTER_CHAT_ID", env.TELEGRAM_CHESTER_CHAT_ID],
    ["GOOGLE_CLIENT_ID", env.GOOGLE_CLIENT_ID],
    ["GOOGLE_CLIENT_SECRET", env.GOOGLE_CLIENT_SECRET],
    ["GOOGLE_REFRESH_TOKEN", env.GOOGLE_REFRESH_TOKEN],
    ["GOOGLE_SHEETS_ID", env.GOOGLE_SHEETS_ID],
    ["GOOGLE_PLACES_API_KEY", env.GOOGLE_PLACES_API_KEY],
    ["VAPI_API_KEY", env.VAPI_API_KEY],
    ["VAPI_ASSISTANT_ID", env.VAPI_ASSISTANT_ID],
    ["MAKE_API_KEY", env.MAKE_API_KEY],
    ["MAKE_TEAM_ID", env.MAKE_TEAM_ID],
    ["MAKE_WEBHOOK_SECRET", env.MAKE_WEBHOOK_SECRET],
    ["STRIPE_SECRET_KEY", env.STRIPE_SECRET_KEY],
    ["APPROVAL_SECRET", env.APPROVAL_SECRET],
    ["CRON_SECRET", env.CRON_SECRET],
    ["NEXT_PUBLIC_APP_URL", env.NEXT_PUBLIC_APP_URL],
  ];

  const optional: Array<[string, string, string]> = [
    ["MAKE_ORGANIZATION_ID", env.MAKE_ORGANIZATION_ID, "scenario cloning"],
    ["STRIPE_WEBHOOK_SECRET", env.STRIPE_WEBHOOK_SECRET, "Stripe payment webhooks"],
    ["OPUS_CLIP_API_KEY", env.OPUS_CLIP_API_KEY, "video clipping"],
    ["PUBLER_API_KEY", env.PUBLER_API_KEY, "social scheduling"],
    ["GITHUB_TOKEN", env.GITHUB_TOKEN, "Builder agent PRs"],
  ];

  const results: TestResult[] = [];

  for (const [name, val] of required) {
    results.push({
      test: `env:${name}`,
      pass: Boolean(val && val.length > 0),
      details: val ? `Present (${val.length} chars)` : "MISSING — server will fail to boot",
    });
  }

  for (const [name, val, purpose] of optional) {
    results.push({
      test: `env:${name}`,
      pass: true, // optional, never fail
      details: val ? `Present` : `Not set — ${purpose} will be disabled`,
    });
  }

  return results;
}

// ── Step 2: API connectivity ──────────────────────────────────────────────────

async function testAnthropic(): Promise<TestResult> {
  return run("api:anthropic", async () => {
    const res = await claude({
      system: "Respond with exactly the text: SYSTEM_CHECK_OK",
      userMessage: "System check",
      maxTokens: 20,
      label: "test:anthropic",
    });
    if (!res.text.includes("SYSTEM_CHECK_OK") && res.text.trim().length === 0) {
      throw new Error("Empty response");
    }
    return `Response: "${res.text.trim()}"`;
  });
}

async function testSheetsRead(): Promise<TestResult> {
  return run("api:google_sheets_read", async () => {
    const rows = await readSheetAsObjects("Action Log");
    return `Read ${rows.length} rows from Action Log`;
  });
}

async function testSheetsWrite(): Promise<TestResult> {
  return run("api:google_sheets_write", async () => {
    const testId = `SYS_TEST_${Date.now()}`;
    await appendToSheet("Action Log", [
      testId,
      new Date().toISOString(),
      "test",
      "system_connectivity_check",
      testId,
      "success",
      "Automated system test — safe to delete",
      "{}",
    ]);
    return `Wrote test row ${testId} to Action Log`;
  });
}

async function testGmail(): Promise<TestResult> {
  return run("api:gmail", async () => {
    const id = await sendEmail({
      to: "chester@7dtech.ca",
      subject: "7D Tech — System Check",
      bodyHtml: `<p style="font-family:Georgia,serif;">Automated connectivity check passed at ${new Date().toISOString()}. No action required.</p>`,
    });
    return `Sent. Message ID: ${id}`;
  });
}

async function testCalendar(): Promise<TestResult> {
  return run("api:google_calendar", async () => {
    const slots = await getOpenSlots(2);
    const first = slots[0];
    return `Found ${slots.length} open slots. First: ${first ? first.humanReadable : "none"}`;
  });
}

async function testDrive(): Promise<TestResult> {
  return run("api:google_drive", async () => {
    const drive = google.drive({ version: "v3", auth: getAuthClient() });
    const res = await drive.files.list({
      pageSize: 5,
      fields: "files(id, name)",
      orderBy: "modifiedTime desc",
    });
    const files = res.data.files ?? [];
    const names = files.map((f) => f.name).join(", ") || "(no files)";
    return `Listed ${files.length} recent files: ${names}`;
  });
}

async function testPlaces(): Promise<TestResult> {
  return run("api:google_places", async () => {
    const results = await searchPlaces("gym", "Calgary", "AB", 3);
    if (results.length === 0) throw new Error("Zero results returned");
    return `Found ${results.length} gyms. First: ${results[0]?.businessName ?? "unnamed"}`;
  });
}

async function testVapi(): Promise<TestResult> {
  return run("api:vapi", async () => {
    const res = await fetch(`https://api.vapi.ai/assistant/${env.VAPI_ASSISTANT_ID}`, {
      headers: { Authorization: `Bearer ${env.VAPI_API_KEY}` },
    });
    if (!res.ok) throw new Error(`Vapi returned ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { name?: string; id: string };
    return `Assistant confirmed: "${data.name ?? "unnamed"}" (id: ${data.id.slice(0, 8)}...)`;
  });
}

async function testMake(): Promise<TestResult> {
  return run("api:make", async () => {
    const scenarios = await listScenarios();
    const active = scenarios.filter((s) => s.isActive).length;
    return `Connected. ${scenarios.length} scenarios, ${active} active`;
  });
}

async function testStripe(): Promise<TestResult> {
  return run("api:stripe", async () => {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: "2025-02-24.acacia" });
    const bal = await stripe.balance.retrieve();
    const mode = env.STRIPE_SECRET_KEY.startsWith("sk_test") ? "TEST" : "LIVE";
    return `Connected (${mode} mode). Available: ${JSON.stringify(bal.available.map((b) => `${b.amount / 100} ${b.currency.toUpperCase()}`))}`;
  });
}

async function testTelegram(): Promise<TestResult> {
  return run("api:telegram", async () => {
    const res = await fetch(
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: env.TELEGRAM_CHESTER_CHAT_ID,
          text: "✅ 7D Tech system check — Telegram connectivity confirmed.",
        }),
      }
    );
    const data = (await res.json()) as { ok: boolean; description?: string };
    if (!data.ok) throw new Error(data.description ?? "Telegram API error");
    return "Message delivered to @7DTechBot";
  });
}

async function testGitHub(): Promise<TestResult> {
  return run("api:github", async () => {
    if (!env.GITHUB_TOKEN) return "Skipped — GITHUB_TOKEN not set";
    const res = await fetch(
      `https://api.github.com/repos/${env.GITHUB_REPO_OWNER}/${env.GITHUB_REPO_NAME}`,
      {
        headers: {
          Authorization: `Bearer ${env.GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
        },
      }
    );
    if (!res.ok) throw new Error(`GitHub returned ${res.status}`);
    const data = (await res.json()) as { full_name: string; private: boolean };
    return `Repo accessible: ${data.full_name} (private: ${data.private})`;
  });
}

// ── Step 3: Approval token security ──────────────────────────────────────────

async function testTokenValid(): Promise<TestResult> {
  return run("security:token_valid", async () => {
    const id = `test-${Date.now()}`;
    const token = await generateApprovalToken(id, "chester_outreach");
    const payload = await verifyApprovalToken(token);
    if (payload.approvalId !== id) throw new Error("Payload mismatch");
    return `Token generated and verified. approvalId: ${id}`;
  });
}

async function testTokenTampered(): Promise<TestResult> {
  return run("security:token_tampered_rejected", async () => {
    const id = `test-${Date.now()}`;
    const token = await generateApprovalToken(id, "chester_outreach");
    const tampered = token.slice(0, -6) + "XXXXXX";
    try {
      await verifyApprovalToken(tampered);
      throw new Error("Tampered token was accepted — SECURITY FAILURE");
    } catch (e) {
      if (String(e).includes("SECURITY FAILURE")) throw e;
      return `Tampered token correctly rejected: ${String(e).slice(0, 80)}`;
    }
  });
}

async function testSingleUseEnforced(): Promise<TestResult> {
  return run("security:single_use_enforced", async () => {
    const baseUrl = env.NEXT_PUBLIC_APP_URL;
    const id = `singleuse-${Date.now()}`;
    const token = await generateApprovalToken(id, "chester_outreach");

    // Write a fake pending row so the endpoint has something to find
    await appendToSheet("Approval Queue", [
      id,
      "outreach_email",
      "chester@7dtech.ca",
      "Test approval (single-use check)",
      "Test body — do not send",
      "test@example.com",
      "Test Lead",
      "pending",
      "passed",
      new Date().toISOString(),
      "",
      "FALSE",
      "test",
    ]);

    // First use — approve
    const r1 = await fetch(`${baseUrl}/api/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, decision: "approve" }),
    });
    const d1 = (await r1.json()) as { result?: string; error?: string };
    if (r1.status !== 200) throw new Error(`First use failed: ${JSON.stringify(d1)}`);

    // Second use — must be rejected
    const r2 = await fetch(`${baseUrl}/api/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, decision: "approve" }),
    });
    if (r2.status !== 410) {
      throw new Error(`Second use returned ${r2.status} instead of 410 — single-use NOT enforced`);
    }

    return `First use approved (200). Second use rejected (410). Single-use enforced correctly.`;
  });
}

async function testInvalidSignatureApprove(): Promise<TestResult> {
  return run("security:invalid_token_rejected", async () => {
    const baseUrl = env.NEXT_PUBLIC_APP_URL;
    const fakeToken = "eyJhbGciOiJIUzI1NiJ9.eyJhcHByb3ZhbElkIjoiZmFrZSIsInR5cGUiOiJjaGVzdGVyX291dHJlYWNoIn0.INVALIDSIGNATURE";
    const res = await fetch(`${baseUrl}/api/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: fakeToken, decision: "approve" }),
    });
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
    return "Invalid token correctly rejected with 401";
  });
}

// ── Step 4: Cron security ─────────────────────────────────────────────────────

async function testCronSecurity(): Promise<TestResult[]> {
  const baseUrl = env.NEXT_PUBLIC_APP_URL;
  const cronPaths = [
    "/api/cron/montgomery",
    "/api/cron/alistair",
    "/api/cron/franklin",
    "/api/cron/prospecting",
    "/api/cron/performance-review",
    "/api/cron/daily-summary",
    "/api/cron/intelligence",
    "/api/cron/chichester",
    "/api/cron/red-team",
    "/api/cron/reply-tracker",
    "/api/cron/monitor",
    "/api/cron/dorian",
    "/api/cron/lexington",
  ];

  const results: TestResult[] = [];

  for (const path of cronPaths) {
    const label = `security:cron_unauthed${path}`;
    try {
      const res = await fetch(`${baseUrl}${path}`, { method: "GET" });
      results.push({
        test: label,
        pass: res.status === 401,
        details: res.status === 401 ? "401 Unauthorized ✓" : `Expected 401, got ${res.status} — EXPOSED`,
      });
    } catch (e) {
      results.push({ test: label, pass: false, details: `Fetch error: ${String(e)}` });
    }
  }

  return results;
}

// ── Step 5: Webhook security ──────────────────────────────────────────────────

async function testMalformedWebhook(): Promise<TestResult> {
  return run("security:malformed_webhook", async () => {
    const baseUrl = env.NEXT_PUBLIC_APP_URL;

    // Wrong secret header — should get 401
    const r1 = await fetch(`${baseUrl}/api/webhooks/make`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Make-Secret": "wrong-secret" },
      body: JSON.stringify({ client_id: "test", name: "Test", email: "test@test.com", message: "hi" }),
    });
    if (r1.status !== 401) throw new Error(`Wrong secret got ${r1.status} instead of 401`);

    // Missing required fields — after auth, should get 400
    const r2 = await fetch(`${baseUrl}/api/webhooks/make`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Make-Secret": env.MAKE_WEBHOOK_SECRET },
      body: JSON.stringify({ name: "No client_id" }),
    });
    if (r2.status !== 400) throw new Error(`Missing fields got ${r2.status} instead of 400`);

    return "Wrong secret → 401 ✓. Missing fields → 400 ✓.";
  });
}

// ── Step 6: Sheets graceful failure ──────────────────────────────────────────

async function testLexingtonCasl(): Promise<TestResult> {
  return run("agent:lexington_casl", async () => {
    const { auditCaslCompliance } = await import("@/agents/lexington/casl-auditor");
    const findings = await auditCaslCompliance();
    return `CASL audit complete. ${findings.length} finding(s). ${findings.length > 0 ? "First: " + findings[0]?.issue : "No issues found"}`;
  });
}

async function testFranklinBrief(): Promise<TestResult> {
  return run("agent:franklin_brief", async () => {
    const { getFinancialSummary } = await import("@/agents/franklin/index");
    const summary = await getFinancialSummary();
    if (!summary) return "No financial data yet — Franklin returned empty summary";
    return `Financial summary generated. First 100 chars: ${summary.slice(0, 100)}...`;
  });
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (secret !== env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: TestResult[] = [];

  // Step 1: Env
  results.push(...envAudit());

  // Step 2: API connectivity (run all, don't abort on failure)
  const apiTests = await Promise.allSettled([
    testAnthropic(),
    testSheetsRead(),
    testSheetsWrite(),
    testGmail(),
    testCalendar(),
    testDrive(),
    testPlaces(),
    testVapi(),
    testMake(),
    testStripe(),
    testTelegram(),
    testGitHub(),
  ]);

  for (const r of apiTests) {
    results.push(r.status === "fulfilled" ? r.value : { test: "api:unknown", pass: false, details: String(r.reason) });
  }

  // Step 3: Security
  const [tokenValid, tokenTampered, singleUse, invalidSig] = await Promise.allSettled([
    testTokenValid(),
    testTokenTampered(),
    testSingleUseEnforced(),
    testInvalidSignatureApprove(),
  ]);
  for (const r of [tokenValid, tokenTampered, singleUse, invalidSig]) {
    results.push(r.status === "fulfilled" ? r.value : { test: "security:unknown", pass: false, details: String(r.reason) });
  }

  // Step 4: Cron security
  results.push(...(await testCronSecurity()));

  // Step 5: Webhook security
  results.push(await testMalformedWebhook());

  // Step 6: Agent checks
  const [casl, franklin] = await Promise.allSettled([
    testLexingtonCasl(),
    testFranklinBrief(),
  ]);
  for (const r of [casl, franklin]) {
    results.push(r.status === "fulfilled" ? r.value : { test: "agent:unknown", pass: false, details: String(r.reason) });
  }

  // Summary
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  const failures = results.filter((r) => !r.pass);

  return NextResponse.json({
    summary: { total: results.length, passed, failed },
    failures: failures.map((f) => ({ test: f.test, details: f.details })),
    results,
    timestamp: new Date().toISOString(),
  });
}
