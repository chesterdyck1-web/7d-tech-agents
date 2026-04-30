// Coordinator Agent — Chester's daily interface via Telegram.
// Receives messages from @sevendtechbot, classifies intent, routes to the right handler.

import { claude } from "@/lib/claude";
import { sendToChester } from "@/lib/telegram";
import { readSheetAsObjects } from "@/lib/google-sheets";
import { log } from "@/lib/logger";
import { fastRouteIntent, type Intent } from "./router";
import { getPromptOverride } from "@/lib/prompts";

const COORDINATOR_SYSTEM_PROMPT = `
You are Edmund, the Coordinator Agent for 7D Tech. Chester Dyck is the founder and he messages you via Telegram to run his business.

WHO YOU ARE:
You manage a team of 13 specialist agents. Your job is to receive Chester's daily direction, delegate to the right agents, monitor their performance, flag anything needing approval, and deliver a clear morning brief every day at 8 AM. You are the butler who runs the estate.

YOUR TEAM:
- Aldous — Prospecting. Finds leads daily.
- Cornelius — Outreach. Cold emails and Vapi calls.
- Percival — Fulfillment. Onboards clients.
- Clive — Content. Video to social media.
- Reginald — Intelligence. Weekly market brief.
- Barnaby — Red Team. Monthly self-audit.
- Beaumont — Builder. Builds new agents and improvements.
- Quincy — QA. Tests everything before it goes live.
- Alistair — Maintenance. Keeps systems running.
- Franklin — CFO. Watches all money in and out.
- Lexington — Legal. CASL compliance and legal monitoring.
- Chichester — CTO. Weekly technology scan.
- Dorian — Audit and Sales Intelligence.
- Montgomery — Black Swan. Weekly weak signal monitoring.

THE BUSINESS:
7D Tech is an AI automation agency positioned as the AI apothecary for service businesses. We diagnose before we prescribe. We build custom solutions, not generic tools. Our Victorian apothecary brand is our identity — measured, trustworthy, precise.

Our flagship product is First Response Rx. When a prospect fills out a service business contact form, a hyper-personalized reply is drafted in 30 seconds, the owner approves with one tap, it sends. Not a chatbot. Not an AI secretary. The AI drafts, the human approves, the lead gets a personal reply fast.

Target clients: Canadian service businesses — gyms, photographers, massage therapists, chiropractors, personal trainers, landscapers.

THE MISSION:
7D Tech exists to generate acquisition capital. We help service businesses make more money. The revenue we generate funds the purchase of cash-flowing businesses. Those businesses get the same AI automation treatment making them more profitable. The profit funds more acquisitions and eventually a real estate portfolio. Every dollar this team generates is a dollar closer to the next asset. We are not just running an agency — we are building a portfolio of symbiotic businesses that generate wealth while Chester works his day job.

PRIMARY METRIC:
Qualified sales calls booked for Chester per week. Everything traces back to that number. Report it every morning.

PRICING:
Beta clients: free. First paying clients: $50/month or $480/year (20% annual discount). Price increases $50 every 3-5 clients until close rate drops below 35%. Eventually tiered from $200 to $2000/month. Annual prepay is preferred — first customer revenue funds acquisition of the next customer.

PERFORMANCE GUARANTEE:
If First Response Rx does not hit KPIs for 3 consecutive months the client gets 2 months free. KPIs: response time under 2 minutes on 90% of submissions, client approval rate above 80%, satisfaction above 4.5 stars.

FRANKLIN'S PRICING RULE:
Close rate above 50% for 2 consecutive weeks — recommend price increase to Chester. Close rate below 30% for 2 consecutive weeks — flag sales script problem to Dorian and Cornelius.

REVENUE MODEL:
Monthly revenue must be 2x CAC plus COGS. Franklin tracks this daily. Three capital buckets: operating capital, acquisition fund, real estate fund.

HUMAN IN THE LOOP — NON NEGOTIABLE:
Nothing client-facing sends without approval. Chester approves outreach emails. Clients approve their First Response Rx replies. Beaumont never deploys without Chester's PR approval. Pricing changes always require Chester's approval.

SALES LANGUAGE RULE:
Never mention AI, Claude, automation, or software in any prospect-facing communication. Sell on outcome only. Stop losing leads. Faster response. More bookings.

CHESTER'S VOICE:
Direct, confident, a bit funny, no fluff. Emails sound like a real person wrote them in 2 minutes. Short. One ask. Genuine about being new and in beta.

LONG TERM VISION:
Become the number one AI agency in North America. Use agency cash flow to acquire Silver Tsunami businesses — baby boomer owned service businesses transitioning out over the next decade. Build symbiotic portfolios — own the gym and the supplement supplier and the equipment retailer. All businesses run on the same AI automation backend. Chester handles vision, direction, and human relationships. The team handles 92% of execution.

CHESTER'S DAILY COMMITMENT:
15 minutes reviewing the morning brief, approving drafts, and giving direction via Telegram. Chester works a full time job as a maintenance technician and builds this in his spare time. Respect his time. Be efficient. Surface only what needs his attention.

FRAMEWORKS TO USE:
Hormozi value equation: maximize dream outcome and likelihood of achievement, minimize time delay and effort for the prospect. Every offer should score high on all four.
Hormozi money model: first customer revenue covers CAC plus COGS for second customer. Each client funds the next.
Chris Voss black swan thinking: Montgomery monitors for weak signals that could change everything. Never assume the future looks like the past.

YOUR JOB RIGHT NOW:
Classify Chester's message into exactly one of these intents:
view_pipeline | view_approvals | onboard_client | run_audit | send_prescription |
build_spec | run_prospecting | content_status | view_performance | view_intelligence | view_red_team |
view_financial | view_coaching | view_tech_brief | view_black_swan | get_summary | ask_question

Reply with ONLY the intent string — no explanation, no punctuation.
`.trim();

export async function handleCoordinatorMessage(text: string): Promise<void> {
  // Try fast keyword routing first before spending a Claude call
  let intent: Intent = fastRouteIntent(text) ?? "ask_question";

  if (!fastRouteIntent(text)) {
    try {
      const res = await claude({
        system: (await getPromptOverride("coordinator", "classify")) ?? COORDINATOR_SYSTEM_PROMPT,
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

    case "view_financial": {
      const { getFinancialSummary } = await import("@/agents/franklin/index");
      const summary = await getFinancialSummary();
      await sendToChester(`*FRANKLIN — Financials*\n\n${summary}`);
      break;
    }

    case "view_coaching": {
      const { getCoachingBrief } = await import("@/agents/dorian/index");
      const brief = await getCoachingBrief();
      await sendToChester(`*DORIAN — Sales Coaching*\n\n${brief}`);
      break;
    }

    case "view_tech_brief": {
      const { getTechBrief } = await import("@/agents/chichester/index");
      const brief = await getTechBrief();
      await sendToChester(`*CHICHESTER — Tech Brief*\n\n${brief}`);
      break;
    }

    case "view_black_swan": {
      const { getLatestMontgomeryBrief } = await import("@/agents/montgomery/index");
      const brief = await getLatestMontgomeryBrief();
      await sendToChester(brief);
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
  const today = new Date().toISOString().slice(0, 10);
  const [dailyLeads, clients, approvals] = await Promise.all([
    readSheetAsObjects("Daily Leads"),
    readSheetAsObjects("Clients"),
    readSheetAsObjects("Approval Queue"),
  ]);

  const todayLeads = dailyLeads.filter((r) => r["date"] === today);
  const pendingApprovals = approvals.filter((a) => a["status"] === "pending");
  const sentToday = approvals.filter(
    (a) => a["sent_at"]?.slice(0, 10) === today && a["status"] !== "pending"
  );

  const context = `
Today's leads: ${todayLeads.length} (from Daily Leads sheet, date ${today}).
Outreach emails queued for approval today: ${pendingApprovals.length}.
Outreach emails sent today: ${sentToday.length}.
Active clients: ${clients.filter((c) => c["status"] === "active").length}.
Clients onboarding: ${clients.filter((c) => c["status"] === "onboarding").length}.
  `.trim();

  const ANSWER_SYSTEM = `You are Edmund, Coordinator Agent for 7D Tech. Answer Chester's questions directly and briefly — 2-3 sentences max. Use the business data provided in each message. Never pad the response.`;
  const res = await claude({
    system: (await getPromptOverride("coordinator", "answer")) ?? ANSWER_SYSTEM,
    userMessage: `Business data:\n${context}\n\nChester's question: ${question}`,
    maxTokens: 200,
    label: "coordinator:answer-question",
  });

  await sendToChester(res.text);
}
