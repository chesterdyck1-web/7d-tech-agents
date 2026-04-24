// Generates a Stripe payment link and emails it to the new client.
// Called first in the onboarding sequence — nothing else starts until payment is confirmed.

import { createPaymentLink } from "@/lib/stripe";
import { sendEmail } from "@/lib/gmail";
import { updateFieldByRowId } from "@/lib/google-sheets";
import { log } from "@/lib/logger";

export interface InvoiceInput {
  clientId: string;
  businessName: string;
  ownerName: string;
  ownerEmail: string;
  monthlyRateCad: number;
}

export interface InvoiceResult {
  paymentLinkUrl: string;
  paymentLinkId: string;
}

export async function sendStripeInvoice(input: InvoiceInput): Promise<InvoiceResult> {
  const { url, paymentLinkId } = await createPaymentLink({
    clientName: input.businessName,
    clientEmail: input.ownerEmail,
    amountCad: input.monthlyRateCad,
    description: `First Response Rx — ${input.businessName} (Monthly)`,
  });

  // Email payment link to client
  await sendEmail({
    to: input.ownerEmail,
    subject: `Your First Response Rx invoice - ${input.businessName}`,
    bodyHtml: `
      <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;padding:2rem;color:#1a1a1a;">
        <p style="font-size:0.8rem;letter-spacing:0.12em;text-transform:uppercase;color:#888;margin-bottom:1.5rem;">7D Tech</p>

        <p>Hi ${input.ownerName},</p>
        <p style="margin:1rem 0;">Great to have you on board. Your First Response Rx setup begins as soon as payment is confirmed.</p>
        <p style="margin:1rem 0;"><strong>Amount:</strong> $${input.monthlyRateCad} CAD/month</p>

        <a href="${url}" style="display:inline-block;background:#1a1a1a;color:#fff;padding:0.85rem 2rem;border-radius:5px;text-decoration:none;font-size:0.95rem;margin:1rem 0;">Pay Now</a>

        <p style="margin-top:1.5rem;font-size:0.9rem;color:#555;">Once payment clears, you will hear from me within 24 hours with your setup details.</p>
        <p style="margin-top:1rem;font-size:0.9rem;">Chester Dyck<br>7D Tech — 7dtech.ca</p>
      </div>
    `,
  });

  // Record in Clients sheet
  await updateFieldByRowId("Clients", 0, input.clientId, 9, url);
  await updateFieldByRowId("Clients", 0, input.clientId, 10, "pending");

  await log({
    agent: "fulfillment",
    action: "stripe_invoice_sent",
    entityId: input.clientId,
    status: "success",
    metadata: { paymentLinkId, ownerEmail: input.ownerEmail } as unknown as Record<string, unknown>,
  });

  return { paymentLinkUrl: url, paymentLinkId };
}
