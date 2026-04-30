// Monitors terms of service pages for key third-party APIs.
// Detects changes that could affect automated commercial usage.
// Services: Anthropic, Vapi, Make.com, Google Workspace, Stripe.

import { claude } from "@/lib/claude";
import { getPromptOverride } from "@/lib/prompts";

export interface TosChange {
  service: string;
  url: string;
  concern: string;
  severity: "info" | "warning" | "critical";
}

// Services whose ToS Chester's automated system depends on
const MONITORED_SERVICES = [
  { service: "Anthropic", url: "https://www.anthropic.com/legal/usage-policy" },
  { service: "Vapi", url: "https://vapi.ai/terms-of-service" },
  { service: "Make.com", url: "https://www.make.com/en/terms-of-service" },
  { service: "Google Workspace", url: "https://workspace.google.com/terms/user_features.html" },
  { service: "Stripe", url: "https://stripe.com/en-ca/ssa" },
];

const TOS_EVAL_SYSTEM = `You are a legal compliance assistant reviewing API terms of service for a small Canadian AI automation agency.
The agency uses this service to: send automated commercial emails, make AI-powered phone calls, process payments, and store client data.
Identify any clauses that might restrict or require disclosure for:
1. Automated commercial messaging
2. AI-generated content sent to third parties
3. Data retention and privacy obligations
4. Rate limits or commercial use restrictions
5. Canadian business compliance (CASL, PIPEDA)

Reply with one finding per line:
[INFO|WARNING|CRITICAL] description

If no concerns, reply: NO_CONCERNS`;

// Fetch a ToS page and have Claude flag any concerns for automated B2B usage.
export async function checkServiceTos(service: string, url: string): Promise<TosChange[]> {
  let pageText: string;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; compliance-bot/1.0)" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    // Strip HTML tags — rough but sufficient for ToS text extraction
    pageText = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 8000);
  } catch {
    return [];
  }

  const system = (await getPromptOverride("lexington", "tos")) ?? TOS_EVAL_SYSTEM;
  const res = await claude({
    system,
    userMessage: `Service: ${service}\nURL: ${url}\n\nContent excerpt:\n${pageText}`,
    maxTokens: 300,
    label: "lexington:tos-check",
  });

  const text = res.text.trim();
  if (text === "NO_CONCERNS") return [];

  const findings: TosChange[] = [];
  for (const line of text.split("\n").filter((l) => l.trim())) {
    const critical = line.match(/^\[CRITICAL\]\s+(.+)/i);
    const warning = line.match(/^\[WARNING\]\s+(.+)/i);
    const info = line.match(/^\[INFO\]\s+(.+)/i);
    if (critical) findings.push({ service, url, concern: critical[1]!, severity: "critical" });
    else if (warning) findings.push({ service, url, concern: warning[1]!, severity: "warning" });
    else if (info) findings.push({ service, url, concern: info[1]!, severity: "info" });
  }
  return findings;
}

// Check all monitored services and return findings above info level.
export async function monitorTermsOfService(): Promise<TosChange[]> {
  const results = await Promise.allSettled(
    MONITORED_SERVICES.map((s) => checkServiceTos(s.service, s.url))
  );

  const allFindings: TosChange[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      allFindings.push(...result.value);
    }
  }

  // Return warnings and criticals — info-level is too noisy for alerts
  return allFindings.filter((f) => f.severity !== "info");
}
