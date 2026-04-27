// Audit Agent — verifies a client's First Response Rx setup is live and working.
// Chester triggers this with "audit [Business Name]" via Telegram.
// Checks: client exists, Make scenario is active, webhook responds correctly.

import { readSheetAsObjects } from "@/lib/google-sheets";
import { sendToChester } from "@/lib/telegram";
import { log } from "@/lib/logger";
import { getScenario } from "@/lib/make";
import { runClientTest } from "@/agents/fulfillment/tester";

export async function runAudit(businessName: string): Promise<void> {
  await sendToChester(`Running audit for ${businessName}...`);

  // 1. Find client in sheet
  const clients = await readSheetAsObjects("Clients");
  const client = clients.find(
    (c) => c["business_name"]?.toLowerCase() === businessName.toLowerCase().trim()
  );

  if (!client) {
    await sendToChester(
      `Audit failed: could not find "${businessName}" in the Clients sheet.`
    );
    return;
  }

  const clientId = client["client_id"] ?? "";
  const results: string[] = [];
  let allPassed = true;

  // 2. Check status
  const status = client["status"] ?? "unknown";
  if (status === "active") {
    results.push(`✓ Status: active`);
  } else {
    results.push(`✗ Status: ${status} (expected: active)`);
    allPassed = false;
  }

  // 3. Check Make scenario is active
  const scenarioId = Number(client["make_scenario_id"]);
  if (!scenarioId) {
    results.push(`✗ Make scenario: no scenario ID on file`);
    allPassed = false;
  } else {
    try {
      const scenario = await getScenario(scenarioId);
      if (scenario.isActive) {
        results.push(`✓ Make scenario #${scenarioId} (${scenario.name}): active`);
      } else {
        results.push(`✗ Make scenario #${scenarioId}: not active — activate it in Make`);
        allPassed = false;
      }
    } catch (err) {
      results.push(`✗ Make scenario check failed: ${String(err)}`);
      allPassed = false;
    }
  }

  // 4. Check webhook URL exists
  const webhookUrl = client["webhook_url"] ?? "";
  if (!webhookUrl) {
    results.push(`✗ Webhook URL: missing`);
    allPassed = false;
  } else {
    results.push(`✓ Webhook URL: on file`);
  }

  // 5. Run live test through the webhook
  if (webhookUrl && clientId) {
    const testResult = await runClientTest(clientId, webhookUrl);
    if (testResult.passed) {
      results.push(`✓ Live test: ${testResult.details}`);
    } else {
      results.push(`✗ Live test: ${testResult.details}`);
      allPassed = false;
    }
  }

  await log({
    agent: "audit",
    action: "client_audit",
    entityId: clientId,
    status: allPassed ? "success" : "failure",
    metadata: { businessName, checks: results.length } as unknown as Record<string, unknown>,
  });

  const header = allPassed
    ? `*AUDIT PASSED — ${businessName}*`
    : `*AUDIT FAILED — ${businessName}*`;

  await sendToChester(`${header}\n\n${results.join("\n")}`);
}
