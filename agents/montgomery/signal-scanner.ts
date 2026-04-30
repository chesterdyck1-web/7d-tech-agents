// Montgomery's core scanner — prompts Claude to perform lateral domain analysis
// and surface weak signals that nobody else is watching yet.

import { claude } from "@/lib/claude";
import { readSheetAsObjects } from "@/lib/google-sheets";
import { getPromptOverride } from "@/lib/prompts";

export interface BlackSwanSignal {
  domain: string;
  signal: string;
  impact: "low" | "medium" | "high" | "existential";
  probability: "unlikely" | "possible" | "probable";
  timeHorizon: "near" | "medium" | "far";  // near=6-9mo, medium=9-12mo, far=12-18mo
  strategicResponse: string;
}

export interface MontgomeryBriefData {
  signals: BlackSwanSignal[];
  executiveSummary: string;
}

async function gatherContext(): Promise<string> {
  const [clients, leads, metrics] = await Promise.all([
    readSheetAsObjects("Clients").catch(() => []),
    readSheetAsObjects("Daily Leads").catch(() => []),
    readSheetAsObjects("Financial Metrics").catch(() => []),
  ]);

  const activeClients = clients.filter((c) => c["status"] === "active").length;
  const verticals = [...new Set(leads.map((l) => l["vertical"]).filter(Boolean))].slice(0, 8).join(", ");
  const latestFinancial = metrics[metrics.length - 1];
  const mrr = latestFinancial ? Number(latestFinancial["mrr_cad"] ?? 0) : 0;

  return `
Current state of 7D Tech (week of ${new Date().toISOString().slice(0, 10)}):
- Active clients: ${activeClients}
- Monthly recurring revenue: $${mrr} CAD
- Verticals currently targeting: ${verticals || "gyms, photographers, massage therapists, chiropractors, personal trainers, landscapers"}
- Geography: Western Canada (BC, AB, SK, MB) primary; Ontario secondary
- Product: First Response Rx — AI drafts personalized replies to contact form submissions, business owner approves with one tap, reply sends automatically
- Core value prop: speed-to-lead — responding within 5 minutes instead of 48+ hours
- Revenue model: $50/month or $480/year per client, subscription
- Chester's constraint: running this while working a day job, targeting August 2026 to replace his income
`.trim();
}

const MONTGOMERY_SYSTEM_PROMPT = `
You are Montgomery, the Black Swan Agent for 7D Tech. Your entire value is finding what nobody else is watching.

7D Tech sells "First Response Rx" — an AI product that drafts personalized replies to contact form submissions for Canadian service businesses, with one-tap owner approval before sending. Target market: gyms, photographers, massage therapists, chiropractors, personal trainers, landscapers across Western Canada.

Your job is to identify WEAK SIGNALS — early, non-obvious indicators of significant change that most observers are not yet watching. Do NOT surface obvious trends. Do NOT repeat what mainstream business media covers. Find the second and third-order effects of things happening NOW that could reshape this business in 6–18 months.

Scan ALL of these domains. Do not skip any:

1. AI CAPABILITY & PRICING SHIFTS — small model commoditization, multi-agent frameworks, voice AI cost curves, inference pricing wars, open-source model capability thresholds that could allow competitors to build the same product for near-zero cost
2. CANADIAN REGULATORY DEVELOPMENTS — PIPEDA reform timeline, provincial AI legislation (especially Quebec Law 25 enforcement), CASL enforcement pattern changes, federal AI Act progress, provincial consumer protection updates affecting automated communications
3. ECONOMIC INDICATORS IN TARGET VERTICALS — discretionary spending compression in service industries, small business failure rates in BC/AB, consumer debt levels affecting gym memberships and wellness services, commercial real estate pressure on service businesses
4. COMPETITIVE LANDSCAPE DISRUPTIONS — CRMs integrating AI reply (HubSpot, Jobber, ServiceTitan, Housecall Pro), platforms (Thumbtack, Angi, Houzz) adding instant-reply features, Google Business Profile adding AI chat, franchise chains adopting AI at scale and making independent operators non-competitive
5. TECHNOLOGY SHIFTS THREATENING THE CONTACT FORM — WhatsApp Business API adoption by Canadian service businesses, Google Business chat replacing website forms, SMS-first communication, social DM automation (Instagram, Facebook), voice AI answering replacing forms entirely
6. SILVER TSUNAMI ACCELERATION — baby boomer service business owner succession in BC/AB, timing of peak business-for-sale volume, potential acquisition targets, succession advisory firms emerging, demographic data on owner retirement timelines
7. ACQUISITION TARGET SIGNALS — small service businesses in target verticals showing signs of distress, undervaluation, or succession challenges that could make them acquisition targets for Chester or his clients

Think laterally. Connect unrelated domains. A regulatory change + an economic stress + a demographic shift in the same vertical at the same time = non-linear risk or opportunity.

FILTER: If a signal is something you've seen in a mainstream business publication, or that any MBA student would cite as an obvious trend, skip it. Find the things that AREN'T on anyone's radar yet.

Return ONLY valid JSON in this exact structure. No preamble, no explanation, no markdown fences:
{
  "signals": [
    {
      "domain": "string — one of the 7 domains above",
      "signal": "string — 2-3 sentences. Specific, non-obvious. Name the actual mechanism.",
      "impact": "low|medium|high|existential",
      "probability": "unlikely|possible|probable",
      "timeHorizon": "near|medium|far",
      "strategicResponse": "string — one concrete action Chester can take THIS WEEK or THIS MONTH to hedge or capitalize. Specific, not generic."
    }
  ],
  "executiveSummary": "string — 2-3 sentences connecting the most important cross-domain patterns Montgomery sees this week"
}

Generate 6–9 signals. Prioritize quality over quantity. At least one must be cross-domain (connecting two or more of the 7 areas). Impact ratings must be honest — if nothing genuinely existential exists this week, say so. The executiveSummary should name the specific pattern Montgomery finds most concerning or most interesting, not just list the signals.
`.trim();

export async function scanForBlackSwans(): Promise<MontgomeryBriefData> {
  const context = await gatherContext();

  const res = await claude({
    system: (await getPromptOverride("montgomery", "scan")) ?? MONTGOMERY_SYSTEM_PROMPT,
    userMessage: `Business context for this week's scan:\n\n${context}\n\nGenerate this week's Black Swan brief. Today is ${new Date().toLocaleDateString("en-CA", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}.`,
    maxTokens: 3000,
    label: "montgomery:scan",
  });

  let parsed: MontgomeryBriefData;
  try {
    // Strip any accidental markdown fences Claude might add
    const clean = res.text.replace(/^```[a-z]*\n?/m, "").replace(/```$/m, "").trim();
    parsed = JSON.parse(clean) as MontgomeryBriefData;
  } catch {
    throw new Error(`Montgomery: failed to parse Claude response as JSON. Raw: ${res.text.slice(0, 300)}`);
  }

  if (!Array.isArray(parsed.signals) || parsed.signals.length === 0) {
    throw new Error("Montgomery: Claude returned no signals");
  }

  return parsed;
}
