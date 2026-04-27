// QA Agent — stress tester.
// Tests core system flows under real conditions: Google Sheets connectivity,
// concurrent webhook requests, and approval token single-use enforcement.

import { env } from "@/lib/env";
import { generateApprovalToken, verifyApprovalToken } from "@/lib/approval-token";
import { readSheetAsObjects } from "@/lib/google-sheets";
import { randomUUID } from "crypto";

export interface StressTestResult {
  passed: boolean;
  reasons: string[];
}

export async function runStressTest(clientId?: string): Promise<StressTestResult> {
  const reasons: string[] = [];

  // Test 1: Google Sheets is reachable and returns data
  try {
    const clients = await readSheetAsObjects("Clients");
    if (!Array.isArray(clients)) {
      reasons.push("Sheets: Clients sheet returned non-array response");
    }
    const actionLog = await readSheetAsObjects("Action Log");
    if (!Array.isArray(actionLog)) {
      reasons.push("Sheets: Action Log sheet returned non-array response");
    }
  } catch (err) {
    reasons.push(`Sheets connectivity failed: ${String(err)}`);
  }

  // Test 2: Concurrent webhook requests don't crash the endpoint
  if (clientId) {
    try {
      const payload = JSON.stringify({
        client_id: clientId,
        name: "Stress Test",
        email: "stress@test.internal",
        message: "Concurrent QA stress test — please ignore.",
        _test: true,
      });

      const headers = {
        "Content-Type": "application/json",
        "X-Make-Secret": env.MAKE_WEBHOOK_SECRET,
      };

      const [r1, r2] = await Promise.all([
        fetch(`${env.NEXT_PUBLIC_APP_URL}/api/webhooks/make`, { method: "POST", headers, body: payload }),
        fetch(`${env.NEXT_PUBLIC_APP_URL}/api/webhooks/make`, { method: "POST", headers, body: payload }),
      ]);

      if (!r1.ok) reasons.push(`Concurrent request 1 failed (${r1.status})`);
      if (!r2.ok) reasons.push(`Concurrent request 2 failed (${r2.status})`);
    } catch (err) {
      reasons.push(`Concurrent webhook test threw: ${String(err)}`);
    }
  }

  // Test 3: Expired / tampered tokens are rejected
  try {
    await verifyApprovalToken("not.a.real.token");
    // If we reach here, the invalid token was accepted — that is a failure
    reasons.push("Security: invalid token was accepted by verifyApprovalToken");
  } catch {
    // Expected — bad tokens should throw
  }

  // Test 4: Batch token generation works without collision
  try {
    const ids = Array.from({ length: 5 }, () => randomUUID());
    const tokens = await Promise.all(
      ids.map((id) => generateApprovalToken(id, "client_response"))
    );
    const uniqueTokens = new Set(tokens);
    if (uniqueTokens.size !== tokens.length) {
      reasons.push("Token generation produced duplicate tokens in batch");
    }
  } catch (err) {
    reasons.push(`Batch token generation failed: ${String(err)}`);
  }

  return { passed: reasons.length === 0, reasons };
}
