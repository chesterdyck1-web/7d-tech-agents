// Stripe helpers — create payment links and verify incoming webhooks.

import Stripe from "stripe";
import { env } from "@/lib/env";
import { withRetry } from "@/lib/retry";
import { withCircuitBreaker, CIRCUIT } from "@/lib/circuit-breaker";

let _stripe: Stripe | null = null;

function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: "2025-02-24.acacia" });
  }
  return _stripe;
}

// Create a one-time Stripe payment link for client onboarding.
export async function createPaymentLink(params: {
  clientName: string;
  clientEmail: string;
  amountCad: number;
  description: string;
}): Promise<{ url: string; paymentLinkId: string }> {
  return withCircuitBreaker(CIRCUIT.STRIPE, () =>
    withRetry(async () => {
      const stripe = getStripe();
      const price = await stripe.prices.create({
        currency: "cad",
        unit_amount: params.amountCad * 100,
        product_data: { name: params.description },
      });
      const link = await stripe.paymentLinks.create({
        line_items: [{ price: price.id, quantity: 1 }],
        metadata: {
          client_name: params.clientName,
          client_email: params.clientEmail,
        },
        after_completion: {
          type: "hosted_confirmation",
          hosted_confirmation: {
            custom_message:
              "Payment received. Chester will be in touch within 24 hours to begin your setup.",
          },
        },
      });
      return { url: link.url, paymentLinkId: link.id };
    })
  );
}

// Verify a Stripe webhook signature and return the parsed event.
export function constructWebhookEvent(
  rawBody: Buffer,
  signature: string
): Stripe.Event {
  return getStripe().webhooks.constructEvent(
    rawBody,
    signature,
    env.STRIPE_WEBHOOK_SECRET
  );
}

// Check if a payment link has been paid.
export async function isPaymentLinkPaid(paymentLinkId: string): Promise<boolean> {
  return withCircuitBreaker(CIRCUIT.STRIPE, () =>
    withRetry(async () => {
      const sessions = await getStripe().checkout.sessions.list({
        payment_link: paymentLinkId,
        limit: 5,
      });
      return sessions.data.some((s) => s.payment_status === "paid");
    })
  );
}
