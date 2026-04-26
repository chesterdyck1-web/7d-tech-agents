// Fulfillment Agent orchestrator.
// Phase 1 (Coordinator trigger): finds client in sheet, sends Stripe invoice.
// Phase 2 (Stripe webhook): builds Claude prompt, provisions Make, runs test, marks active.

import { readSheetAsObjects, updateFieldByRowId } from "@/lib/google-sheets";
import { sendToChester } from "@/lib/telegram";
import { log } from "@/lib/logger";
import { env } from "@/lib/env";
import { sendStripeInvoice } from "./stripe-invoicer";
import { buildClientPrompt } from "./claude-config-builder";
import { provisionMakeScenario } from "./make-provisioner";
import { runClientTest } from "./tester";

// Called by Coordinator when Chester types "client signed - [Business Name]".
// Finds the client row Chester already entered in the Clients sheet, then fires the invoice.
export async function handleClientSigned(businessName: string): Promise<void> {
  const clients = await readSheetAsObjects("Clients");
  const client = clients.find(
    (c) => c["business_name"]?.toLowerCase() === businessName.toLowerCase().trim()
  );

  if (!client) {
    await sendToChester(
      `Could not find "${businessName}" in the Clients sheet. Add the row (cols A-I) and try again.`
    );
    return;
  }

  const clientId = client["client_id"] ?? "";

  if (client["stripe_payment_status"] === "paid") {
    await sendToChester(`${businessName} already paid — onboarding is in progress.`);
    return;
  }

  await sendToChester(`Found ${businessName}. Generating Stripe invoice now...`);

  try {
    const { paymentLinkUrl } = await sendStripeInvoice({
      clientId,
      businessName: client["business_name"] ?? "",
      ownerName: client["owner_name"] ?? "",
      ownerEmail: client["owner_email"] ?? "",
      monthlyRateCad: Number(client["monthly_revenue"]) || 97,
    });

    await sendToChester(
      `Invoice sent to ${client["owner_email"]}.\n\nPayment link: ${paymentLinkUrl}\n\nI will automatically provision their First Response Rx once payment clears.`
    );
  } catch (err) {
    await log({
      agent: "fulfillment",
      action: "handle_client_signed",
      entityId: clientId,
      status: "failure",
      errorMessage: String(err),
    });
    await sendToChester(`Failed to send invoice for ${businessName}: ${String(err)}`);
  }
}

// Called by the Stripe webhook once payment clears.
// Builds their Claude prompt, clones their Make scenario, runs the end-to-end test.
export async function completeClientOnboarding(ownerEmail: string): Promise<void> {
  const clients = await readSheetAsObjects("Clients");
  const client = clients.find((c) => c["owner_email"] === ownerEmail);

  if (!client) {
    await log({
      agent: "fulfillment",
      action: "complete_onboarding",
      status: "failure",
      errorMessage: `No client found with email ${ownerEmail}`,
    });
    return;
  }

  const clientId = client["client_id"] ?? "";
  const businessName = client["business_name"] ?? "";

  await log({
    agent: "fulfillment",
    action: "onboarding_started",
    entityId: clientId,
    status: "pending",
    metadata: { businessName } as unknown as Record<string, unknown>,
  });

  await sendToChester(`Payment confirmed for ${businessName}. Starting technical onboarding...`);

  try {
    const prompt = await buildClientPrompt({
      businessName,
      ownerName: client["owner_name"] ?? "",
      vertical: client["vertical"] ?? "",
      city: client["city"] ?? "",
      services: client["services"],
      tone: client["tone"],
    });

    await updateFieldByRowId("Clients", 0, clientId, 14, prompt); // col 14 = claude_prompt_version

    const templateId = Number(env.MAKE_TEMPLATE_SCENARIO_ID);
    const { scenarioId, webhookUrl } = await provisionMakeScenario(
      clientId,
      businessName,
      templateId
    );

    const testResult = await runClientTest(clientId, webhookUrl);

    await updateFieldByRowId("Clients", 0, clientId, 7, "active"); // col 7 = status

    await log({
      agent: "fulfillment",
      action: "onboarding_complete",
      entityId: clientId,
      status: "success",
      metadata: { scenarioId, testPassed: testResult.passed } as unknown as Record<string, unknown>,
    });

    const testNote = testResult.passed
      ? "End-to-end test passed."
      : `Test note: ${testResult.details}`;

    await sendToChester(
      `*${businessName} is live!*\nMake scenario #${scenarioId} active.\n${testNote}\n\nFirst Response Rx is running for them.`
    );
  } catch (err) {
    await log({
      agent: "fulfillment",
      action: "onboarding_failed",
      entityId: clientId,
      status: "failure",
      errorMessage: String(err),
    });
    await sendToChester(
      `Onboarding error for ${businessName}: ${String(err)}\n\nCheck the Action Log.`
    );
  }
}
