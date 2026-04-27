// QA Agent — automation tester.
// Tests the live Make webhook and approval token system to ensure they respond correctly.

import { env } from "@/lib/env";
import { generateApprovalToken, verifyApprovalToken } from "@/lib/approval-token";
import { randomUUID } from "crypto";

export interface AutomationTestResult {
  passed: boolean;
  reasons: string[];
}

export async function runAutomationTest(
  clientId?: string
): Promise<AutomationTestResult> {
  const reasons: string[] = [];

  // Test 1: Make webhook endpoint accepts test payloads
  if (clientId) {
    try {
      const res = await fetch(`${env.NEXT_PUBLIC_APP_URL}/api/webhooks/make`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Make-Secret": env.MAKE_WEBHOOK_SECRET,
        },
        body: JSON.stringify({
          client_id: clientId,
          name: "QA Test",
          email: "qa@test.internal",
          message: "Automated QA test — please ignore.",
          _test: true,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        reasons.push(`Make webhook returned ${res.status}: ${text}`);
      } else {
        const data = (await res.json()) as { ok?: boolean; test?: boolean };
        if (!data.ok || !data.test) {
          reasons.push("Make webhook returned unexpected response body");
        }
      }
    } catch (err) {
      reasons.push(`Make webhook unreachable: ${String(err)}`);
    }
  }

  // Test 2: Approval token round-trip (generate → verify → correct payload back)
  try {
    const approvalId = randomUUID();
    const token = await generateApprovalToken(approvalId, "client_response");
    const payload = await verifyApprovalToken(token);

    if (payload.approvalId !== approvalId) {
      reasons.push("Approval token approvalId mismatch after verify");
    }
    if (payload.type !== "client_response") {
      reasons.push("Approval token type mismatch after verify");
    }
  } catch (err) {
    reasons.push(`Approval token round-trip failed: ${String(err)}`);
  }

  return { passed: reasons.length === 0, reasons };
}
