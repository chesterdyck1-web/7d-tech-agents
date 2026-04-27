// Lexington — Legal Compliance Agent.
// Runs weekly on Fridays at 9 AM UTC.
// Three responsibilities:
//   1. CASL audit of outreach emails sent in the last 7 days
//   2. Terms of service monitoring for key third-party services
//   3. GST/HST tax deadline reminders

import { sendToChester } from "@/lib/telegram";
import { log } from "@/lib/logger";
import { auditCaslCompliance } from "./casl-auditor";
import { monitorTermsOfService } from "./tos-monitor";
import { computeTaxStatus } from "./tax-tracker";

export async function runLegalReview(): Promise<void> {
  const [caslFindings, tosFindings, taxStatus] = await Promise.all([
    auditCaslCompliance().catch((err) => {
      void log({ agent: "lexington", action: "casl_audit_failed", status: "failure", errorMessage: String(err) });
      return [];
    }),
    monitorTermsOfService().catch((err) => {
      void log({ agent: "lexington", action: "tos_check_failed", status: "failure", errorMessage: String(err) });
      return [];
    }),
    computeTaxStatus().catch((err) => {
      void log({ agent: "lexington", action: "tax_check_failed", status: "failure", errorMessage: String(err) });
      return null;
    }),
  ]);

  const sections: string[] = [];

  // CASL findings
  const caslCriticals = caslFindings.filter((f) => f.severity === "critical");
  const caslWarnings = caslFindings.filter((f) => f.severity === "warning");

  if (caslCriticals.length > 0) {
    const lines = caslCriticals.map((f) => `• ${f.issue}`).join("\n");
    sections.push(`*CASL — CRITICAL*\n${lines}\n\n_Fix these before next outreach send._`);
  } else if (caslWarnings.length > 0) {
    const lines = caslWarnings.map((f) => `• ${f.issue}`).join("\n");
    sections.push(`*CASL — Warnings*\n${lines}`);
  }

  // ToS findings
  const tosCriticals = tosFindings.filter((f) => f.severity === "critical");
  const tosWarnings = tosFindings.filter((f) => f.severity === "warning");

  if (tosCriticals.length > 0) {
    const lines = tosCriticals.map((f) => `• ${f.service}: ${f.concern}`).join("\n");
    sections.push(`*Terms of Service — CRITICAL*\n${lines}`);
  } else if (tosWarnings.length > 0) {
    const lines = tosWarnings.map((f) => `• ${f.service}: ${f.concern}`).join("\n");
    sections.push(`*Terms of Service — Warnings*\n${lines}`);
  }

  // Tax status
  if (taxStatus) {
    if (taxStatus.gstRegistrationRequired) {
      const deadline = taxStatus.nextFilingDeadline ?? "unknown";
      const days = taxStatus.daysUntilDeadline ?? 0;
      const urgency = days <= 14 ? "⚠️ " : "";
      sections.push(
        `*GST/HST Status*\n${urgency}Next filing: ${taxStatus.quarterLabel} due ${deadline} (${days} days)\nEstimated owing: ~$${taxStatus.estimatedGstOwing} CAD\n_Consult your accountant for exact amounts._`
      );
    } else if (taxStatus.totalRevenueLast4QuartersCad > 25_000) {
      // Approaching threshold — warn Chester ahead of time
      const remaining = 30_000 - taxStatus.totalRevenueLast4QuartersCad;
      sections.push(
        `*GST/HST — Approaching Threshold*\n$${taxStatus.totalRevenueLast4QuartersCad} CAD in last 4 quarters (threshold: $30,000). $${remaining} CAD until mandatory registration.`
      );
    }
  }

  if (sections.length === 0) {
    await log({ agent: "lexington", action: "weekly_review_complete", status: "success", metadata: { caslFindings: 0, tosFindings: 0 } as unknown as Record<string, unknown> });
    return;
  }

  const message = `*LEXINGTON — Weekly Legal Review*\n\n${sections.join("\n\n")}`;
  await sendToChester(message);

  await log({
    agent: "lexington",
    action: "weekly_review_complete",
    status: "success",
    metadata: {
      caslCriticals: caslCriticals.length,
      caslWarnings: caslWarnings.length,
      tosCriticals: tosCriticals.length,
      tosWarnings: tosWarnings.length,
    } as unknown as Record<string, unknown>,
  });
}
