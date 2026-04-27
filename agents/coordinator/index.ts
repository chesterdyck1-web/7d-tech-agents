// Coordinator Agent — Chester's daily interface via Telegram.
// Receives messages from @sevendtechbot, classifies intent, routes to the right handler.

import { claude } from "@/lib/claude";
import { sendToChester } from "@/lib/telegram";
import { readSheetAsObjects } from "@/lib/google-sheets";
import { log } from "@/lib/logger";
import { fastRouteIntent, type Intent } from "./router";

const COORDINATOR_SYSTEM_PROMPT = `
You are the Coordinator Agent for 7D Tech, an AI automation agency.
Chester Dyck is the founder. He messages you via Telegram to run his business.

Your job: classify Chester's message into exactly one of these intents:
view_pipeline | view_approvals | onboard_client | run_audit | send_prescription |
build_spec | run_prospecting | content_status | view_performance | view_intelligence | view_red_team | get_summary | ask_question

Reply with ONLY the intent string — no explanation, no punctuation.
`.trim();

export async function handleCoordinatorMessage(text: string): Promise<void> {
  // Try fast keyword routing first before spending a Claude call
  let intent: Intent = fastRouteIntent(text) ?? "ask_question";

  if (!fastRouteIntent(text)) {
    try {
      const res = await claude({
        system: COORDINATOR_SYSTEM_PROMPT,
        userMessage: text,
        maxTokens: 20,
        label: "coordinator:classify-intent",
      });
      const classified = res.text.trim() as Intent;
      if (classified) intent = classified;
    } catch {
      // If Claude fails, fall back to ask_question
      intent = "ask_question";
    }
  }

  await log({
    agent: "coordinator",
    action: "message_received",
    status: "success",
    metadata: { text: text.slice(0, 100), intent },
  });

  await routeIntent(intent, text);
}

async function routeIntent(intent: Intent, originalText: string): Promise<void> {
  switch (intent) {
    case "view_pipeline":
      await handleViewPipeline();
      break;

    case "view_approvals":
      await handleViewApprovals();
      break;

    case "get_summary":
      await sendToChester("Generating your daily brief now...");
      const { sendDailySummary } = await import("./daily-summary");
      await sendDailySummary();
      break;

    case "view_performance":
      await handleViewPerformance();
      break;

    case "onboard_client": {
      // Parse "client signed - Business Name" → "Business Name"
      const businessName = originalText
        .replace(/^client signed\s*[-–]\s*/i, "")
        .trim();
      const { handleClientSigned } = await import("@/agents/fulfillment/index");
      await handleClientSigned(businessName);
      break;
    }

    case "submit_content": {
      // Chester sends "new video - [Google Drive link]"
      const driveUrl = originalText.replace(/^new video\W*/i, "").trim();
      const { submitVideoForClipping } = await import("@/agents/content/index");
      await submitVideoForClipping(driveUrl);
      break;
    }

    case "content_status": {
      const { readSheetAsObjects } = await import("@/lib/google-sheets");
      const queue = await readSheetAsObjects("Content Queue");
      const processing = queue.filter((r) => r["status"] === "processing").length;
      const pending = queue.filter((r) => r["status"] === "pending_approval").length;
      const posted = queue.filter((r) => r["status"] === "posted").length;
      await sendToChester(
        `*CONTENT STATUS*\nProcessing: ${processing}\nPending your approval: ${pending}\nPosted this month: ${posted}`
      );
      break;
    }

    case "activate_client": {
      // Strip "activate client" plus any separator (dash, colon, space) to get the name
      const businessName = originalText
        .replace(/^activate\s+client\W*/i, "")
        .trim();
      const { activateClient } = await import("@/agents/fulfillment/index");
      await activateClient(businessName);
      break;
    }

    case "run_outreach": {
      await sendToChester("Starting outreach run — drafting emails for today's leads now.");
      const { runOutreach } = await import("@/agents/outreach/index");
      await runOutreach();
      break;
    }

    case "build_spec": {
      const { runBuildRequest } = await import("@/agents/builder/index");
      await runBuildRequest(originalText);
      break;
    }

    case "run_audit": {
      // Strip "audit" prefix to get the business name: "audit Chester Test Gym" → "Chester Test Gym"
      const auditTarget = originalText.replace(/^audit\s+/i, "").trim();
      if (!auditTarget) {
        await sendToChester(`Send me: audit [Business Name] — e.g. "audit Chester Test Gym"`);
        break;
      }
      const { runAudit } = await import("@/agents/audit/index");
      await runAudit(auditTarget);
      break;
    }

    case "view_intelligence": {
      const { getLatestBrief } = await import("@/agents/intelligence/index");
      const brief = await getLatestBrief();
      await sendToChester(brief);
      break;
    }

    case "view_red_team": {
      const { getLatestRedTeamReport } = await import("@/agents/red-team/index");
      const report = await getLatestRedTeamReport();
      await sendToChester(report);
      break;
    }

    case "run_prospecting": {
      await sendToChester("Starting prospecting run now — I will message you when it is done.");
      const { runProspecting } = await import("@/agents/prospecting/index");
      await runProspecting();
      break;
    }

    case "ask_question":
      await handleAskQuestion(originalText);
      break;

    default:
      await sendToChester(
        `Understood. That feature (${intent}) is not yet live. Building in sequence — check back soon.`
      );
  }
}

async function handleViewPipeline(): Promise<void> {
  const [leads, approvals] = await Promise.all([
    readSheetAsObjects("Daily Leads"),
    readSheetAsObjects("Approval Queue"),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const todayLeads = leads.filter((r) => r["date"] === today);
  const pending = approvals.filter((r) => r["status"] === "pending");

  await sendToChester(
    `*PIPELINE*\nToday's leads: ${todayLeads.length}\nPending approvals: ${pending.length}`
  );
}

async function handleViewApprovals(): Promise<void> {
  const approvals = await readSheetAsObjects("Approval Queue");
  const pending = approvals.filter((r) => r["status"] === "pending");

  if (pending.length === 0) {
    await sendToChester("No pending approvals. All clear.");
    return;
  }

  const lines = pending
    .slice(0, 5)
    .map((r, i) => `${i + 1}. ${r["type"]} → ${r["to_name"]} (${r["to_email"]})`)
    .join("\n");

  await sendToChester(
    `*PENDING APPROVALS (${pending.length})*\n${lines}\n\nCheck your email — approval links already sent.`
  );
}

async function handleViewPerformance(): Promise<void> {
  const metrics = await readSheetAsObjects("Performance Metrics");
  const flagged = metrics.filter((r) => r["flagged"] === "TRUE" || r["flagged"] === "true");

  if (metrics.length === 0) {
    await sendToChester("No performance data yet. Check back after the first full week of operation.");
    return;
  }

  if (flagged.length === 0) {
    await sendToChester("All agents meeting benchmarks. Nothing to flag.");
    return;
  }

  const lines = flagged
    .map((r) => `⚠ ${r["agent"]} — ${r["metric_name"]}: ${r["metric_value"]}`)
    .join("\n");

  await sendToChester(`*PERFORMANCE FLAGS*\n${lines}`);
}

async function handleAskQuestion(question: string): Promise<void> {
  const [leads, clients, approvals] = await Promise.all([
    readSheetAsObjects("Master Leads"),
    readSheetAsObjects("Clients"),
    readSheetAsObjects("Approval Queue"),
  ]);

  const context = `
Master Leads: ${leads.length} total.
Active clients: ${clients.filter((c) => c["status"] === "active").length}.
Pending approvals: ${approvals.filter((a) => a["status"] === "pending").length}.
  `.trim();

  const res = await claude({
    system: `You are the 7D Tech Coordinator. Answer Chester's question using the business data below. Be brief and direct — 2-3 sentences max. Data:\n${context}`,
    userMessage: question,
    maxTokens: 200,
    label: "coordinator:answer-question",
  });

  await sendToChester(res.text);
}
