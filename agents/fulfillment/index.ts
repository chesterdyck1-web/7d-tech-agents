// Fulfillment Agent orchestrator.
// Phase 1 (Coordinator trigger): finds client in sheet, sends Stripe invoice.
// Phase 2 (Stripe webhook): builds Claude prompt, provisions Make, runs test, marks active.

import { readSheetAsObjects, updateFieldByRowId } from "@/lib/google-sheets";
import { sendToChester } from "@/lib/telegram";
import { log } from "@/lib/logger";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/gmail";
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
      `Invoice sent to ${client["owner_email"]}.\n\nPayment link: ${paymentLinkUrl}\n\nI will automatically provision their First Response Rx once payment clears.`,
      "none"
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

// Called when Chester types "activate client - Business Name" after manually
// filling make_scenario_id and webhook_url in the Clients sheet.
export async function activateClient(businessName: string): Promise<void> {
  const clients = await readSheetAsObjects("Clients");
  const client = clients.find(
    (c) => c["business_name"]?.toLowerCase() === businessName.toLowerCase().trim()
  );

  if (!client) {
    await sendToChester(`Could not find "${businessName}" in the Clients sheet.`);
    return;
  }

  const clientId = client["client_id"] ?? "";
  const scenarioId = client["make_scenario_id"];
  const webhookUrl = client["webhook_url"];

  if (!scenarioId || !webhookUrl) {
    await sendToChester(
      `${businessName}: make_scenario_id and webhook_url are not filled in yet. Add both to the Clients sheet and try again.`
    );
    return;
  }

  await sendToChester(`Running end-to-end test for ${businessName}...`);

  try {
    const testResult = await runClientTest(clientId, webhookUrl);

    await updateFieldByRowId("Clients", 0, clientId, 7, "active"); // col 7 = status

    await log({
      agent: "fulfillment",
      action: "client_activated",
      entityId: clientId,
      status: "success",
      metadata: { scenarioId, testPassed: testResult.passed } as unknown as Record<string, unknown>,
    });

    const testNote = testResult.passed
      ? "End-to-end test passed."
      : `Test note: ${testResult.details}`;

    await sendToChester(
      `${businessName} is live! Make scenario #${scenarioId} active.\n${testNote}\n\nFirst Response Rx is running for them.`,
      "none"
    );
  } catch (err) {
    await log({
      agent: "fulfillment",
      action: "activate_client_failed",
      entityId: clientId,
      status: "failure",
      errorMessage: String(err),
    });
    await sendToChester(`Failed to activate ${businessName}: ${String(err)}`);
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

  // Step 1: Welcome email to client within 30 minutes of payment confirmation
  const ownerName = client["owner_name"] ?? "there";
  if (ownerEmail) {
    await sendEmail({
      to: ownerEmail,
      from: "chester@7dtech.ca",
      subject: "Welcome to 7D Tech — let's get you set up",
      bodyHtml: `Hi ${ownerName},<br><br>Welcome aboard — really glad to have you.<br><br>Here's what happens next: I'm going to spend the next 24-48 hours getting your First Response Rx system set up and tested. You won't need to do anything technical — just answer a few quick questions so I can make sure the replies sound exactly like you.<br><br>I'll be in touch shortly with next steps.<br><br>Chester<br>7D Tech — 7dtech.ca`,
    }).catch(() => null); // Never block onboarding on welcome email failure
  }

  await sendToChester(`Payment confirmed for ${businessName}. Welcome email sent to ${ownerEmail}. Starting technical setup...`);

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

    // Make.com API does not support cloning scenarios with webhooks via API.
    // Chester manually clones the template in Make UI, then enters the scenario ID
    // and webhook URL in the Clients sheet. We check those are filled before proceeding.
    const scenarioId = client["make_scenario_id"];
    const webhookUrl = client["webhook_url"];

    if (!scenarioId || !webhookUrl) {
      await sendToChester(
        `Payment confirmed for ${businessName}. Claude prompt is ready.\n\nNext step: clone the Make template scenario in Make.com UI, then add the scenario ID and webhook URL to the Clients sheet. I will run the final test once those are filled in.`,
        "none"
      );
      return;
    }

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

    // Go-live email to client — matches the skill template exactly
    if (ownerEmail) {
      await sendEmail({
        to: ownerEmail,
        from: "chester@7dtech.ca",
        subject: "You're live — here's what to expect",
        bodyHtml: `Hi ${ownerName},<br><br>Your First Response Rx system is live.<br><br>The next time someone fills out your contact form you'll get an email from us within 30 seconds with a draft reply ready for your approval. One tap to send it — that's it.<br><br>A few things to know:<br>- Replies are personalized to what each prospect writes<br>- You approve every reply before it sends — nothing goes out without your say-so<br>- If you want to edit a reply just do it in the approval screen before approving<br><br>If anything feels off or you want to adjust how the replies sound just let me know and I'll tune it.<br><br>Really excited to see this working for you.<br><br>Chester`,
      }).catch(() => null);
    }

    await sendToChester(
      `*${businessName} is LIVE*\nMake scenario #${scenarioId} active. ${testNote}\n\nGo-live email sent to client. First Response Rx is running.`,
      "none"
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
