// Audits outreach emails for CASL compliance.
// CASL (Canada's Anti-Spam Law) requires: sender ID, unsubscribe mechanism, physical address.
// Checks the last 7 days of approved outreach emails.

import { readSheetAsObjects } from "@/lib/google-sheets";
import { claude } from "@/lib/claude";

export interface CaslFinding {
  approvalId: string;
  toName: string;
  issue: string;
  severity: "warning" | "critical";
}

const CASL_EVAL_SYSTEM = `You are a CASL (Canada's Anti-Spam Law) compliance auditor.
Evaluate this outreach email for compliance with CASL's commercial electronic message requirements:
1. Sender clearly identified (name + business + contact)
2. Unsubscribe mechanism present and functional
3. Physical mailing address included
4. No misleading subject lines or sender info
5. Implied consent applies for publicly listed B2B contact info — note this if applicable

Reply in this format, one issue per line:
[WARNING|CRITICAL] description

If compliant, reply: COMPLIANT`;

function isInLastNDays(dateStr: string, days: number): boolean {
  if (!dateStr) return false;
  return new Date(dateStr) >= new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export async function auditCaslCompliance(): Promise<CaslFinding[]> {
  const queue = await readSheetAsObjects("Approval Queue");
  const recentOutreach = queue.filter(
    (r) =>
      r["type"] === "outreach_email" &&
      r["status"] === "approved" &&
      isInLastNDays(r["decided_at"] ?? "", 7)
  );

  if (recentOutreach.length === 0) return [];

  const findings: CaslFinding[] = [];

  // Sample up to 5 emails — they all use the same template so issues are systemic
  for (const email of recentOutreach.slice(0, 5)) {
    const body = email["body"] ?? "";
    const subject = email["subject"] ?? "";
    const toName = email["to_name"] ?? "Unknown";
    const approvalId = email["approval_id"] ?? "";

    if (!body) continue;

    const res = await claude({
      system: CASL_EVAL_SYSTEM,
      userMessage: `Subject: ${subject}\n\n${body}`,
      maxTokens: 200,
      label: "lexington:casl-audit",
    });

    const text = res.text.trim();
    if (text === "COMPLIANT") continue;

    const lines = text.split("\n").filter((l) => l.trim());
    for (const line of lines) {
      const criticalMatch = line.match(/^\[CRITICAL\]\s+(.+)/i);
      const warningMatch = line.match(/^\[WARNING\]\s+(.+)/i);
      if (criticalMatch) {
        findings.push({ approvalId, toName, issue: criticalMatch[1]!, severity: "critical" });
      } else if (warningMatch) {
        findings.push({ approvalId, toName, issue: warningMatch[1]!, severity: "warning" });
      }
    }
  }

  // Deduplicate by issue text — systemic issues show once
  const seen = new Set<string>();
  return findings.filter((f) => {
    if (seen.has(f.issue)) return false;
    seen.add(f.issue);
    return true;
  });
}
