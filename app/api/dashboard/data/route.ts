// Dashboard data API — aggregates live metrics for the /dashboard page.
// Protected by CRON_SECRET to prevent public access to business metrics.
// Returns all data needed to render the live dashboard in one call.

import { NextRequest, NextResponse } from "next/server";
import { readSheetAsObjects } from "@/lib/google-sheets";
import { env } from "@/lib/env";

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (secret !== env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [clients, leads, approvals, financialMetrics, actionLog, content] = await Promise.all([
    readSheetAsObjects("Clients").catch(() => []),
    readSheetAsObjects("Daily Leads").catch(() => []),
    readSheetAsObjects("Approval Queue").catch(() => []),
    readSheetAsObjects("Financial Metrics").catch(() => []),
    readSheetAsObjects("Action Log").catch(() => []),
    readSheetAsObjects("Content Queue").catch(() => []),
  ]);

  const today = new Date().toISOString().slice(0, 10);

  // Clients
  const activeClients = clients.filter((c) => c["status"] === "active").length;
  const onboardingClients = clients.filter((c) => c["status"] === "onboarding").length;

  // Pipeline
  const todayLeads = leads.filter((r) => r["date"] === today).length;
  const pendingApprovals = approvals.filter((r) => r["status"] === "pending").length;

  // Financial (latest row)
  const latestFinancial = financialMetrics[financialMetrics.length - 1] ?? null;
  const mrr = latestFinancial ? Number(latestFinancial["mrr_cad"] ?? 0) : 0;
  const profitabilityRatio = latestFinancial ? Number(latestFinancial["profitability_ratio"] ?? 0) : 0;
  const operatingFund = latestFinancial ? Number(latestFinancial["operating_fund_cad"] ?? 0) : 0;
  const closeRate = latestFinancial ? Number(latestFinancial["close_rate_weekly"] ?? 0) : 0;

  // Agent health — last 24h failures
  const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const recentLog = actionLog.filter((r) => (r["timestamp"] ?? "") >= cutoff24h);
  const recentFailures = recentLog.filter((r) => r["status"] === "failure").length;
  const recentSuccesses = recentLog.filter((r) => r["status"] === "success").length;

  // Content
  const pendingContent = content.filter((r) => r["status"] === "pending_approval").length;
  const postedContent = content.filter((r) => r["status"] === "posted").length;

  // Pending approvals list for the approval panel
  const pendingApprovalsList = approvals
    .filter((r) => r["status"] === "pending")
    .map((r) => ({
      approvalId: r["approval_id"] ?? "",
      type: r["type"] ?? "",
      toName: r["to_name"] ?? "",
      toEmail: r["to_email"] ?? "",
      subject: r["subject"] ?? "",
      body: r["body"] ?? "",
      qaStatus: r["qa_status"] ?? "",
      createdAt: r["created_at"] ?? "",
    }));

  // Action Log — last 10 entries for the activity feed
  const recentActions = actionLog
    .slice(-10)
    .reverse()
    .map((r) => ({
      timestamp: r["timestamp"] ?? "",
      agent: r["agent"] ?? "",
      action: r["action"] ?? "",
      status: r["status"] ?? "",
    }));

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    clients: { active: activeClients, onboarding: onboardingClients },
    pipeline: { todayLeads, pendingApprovals },
    financial: { mrr, profitabilityRatio, operatingFund, closeRate },
    agentHealth: { recentFailures, recentSuccesses },
    content: { pending: pendingContent, posted: postedContent },
    recentActions,
    pendingApprovalsList,
  });
}
