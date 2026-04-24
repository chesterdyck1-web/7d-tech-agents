// Stripe webhook — fires when a client's payment is confirmed.
// Kicks off the technical onboarding: Claude prompt, Make scenario, end-to-end test.

import { NextRequest, NextResponse } from "next/server";
import { constructWebhookEvent } from "@/lib/stripe";
import { completeClientOnboarding } from "@/agents/fulfillment/index";
import { updateFieldByRowId, readSheetAsObjects } from "@/lib/google-sheets";
import { log } from "@/lib/logger";
import type Stripe from "stripe";

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  const rawBody = await req.arrayBuffer();
  const buf = Buffer.from(rawBody);

  let event: Stripe.Event;
  try {
    event = constructWebhookEvent(buf, sig);
  } catch (err) {
    return NextResponse.json(
      { error: `Webhook verification failed: ${String(err)}` },
      { status: 400 }
    );
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    // Stripe puts the customer email on the session if collected at checkout
    const clientEmail =
      session.customer_details?.email ??
      session.metadata?.["client_email"] ??
      "";

    if (!clientEmail) {
      await log({
        agent: "fulfillment",
        action: "stripe_webhook_no_email",
        status: "failure",
        errorMessage: "checkout.session.completed had no client email",
      });
      return NextResponse.json({ ok: true });
    }

    // Update payment status in Clients sheet synchronously so it is accurate,
    // then run the full onboarding flow in the background.
    try {
      const clients = await readSheetAsObjects("Clients");
      const client = clients.find((c) => c["owner_email"] === clientEmail);
      if (client?.["client_id"]) {
        await updateFieldByRowId("Clients", 0, client["client_id"], 10, "paid");
      }
    } catch {
      // Non-fatal — onboarding will still proceed
    }

    completeClientOnboarding(clientEmail).catch(async (err) => {
      await log({
        agent: "fulfillment",
        action: "onboarding_background_error",
        status: "failure",
        errorMessage: String(err),
      });
    });
  }

  return NextResponse.json({ ok: true });
}
