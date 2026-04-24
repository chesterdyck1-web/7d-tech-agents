// Fires a test form submission through a client's First Response Rx flow.
// Used to validate the full chain before going live.

import { log } from "@/lib/logger";
import { env } from "@/lib/env";

export interface TestResult {
  passed: boolean;
  details: string;
}

export async function runClientTest(
  clientId: string,
  clientWebhookUrl: string
): Promise<TestResult> {
  const testPayload = {
    client_id: clientId,
    name: "Test Prospect",
    email: "test@7dtech.ca",
    message: "Hi, I found you online and I am interested in learning more about your services. Could we set up a quick call?",
    _test: true,
  };

  try {
    const res = await fetch(`${env.NEXT_PUBLIC_APP_URL}/api/webhooks/make`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Make-Secret": env.MAKE_WEBHOOK_SECRET,
      },
      body: JSON.stringify(testPayload),
    });

    if (!res.ok) {
      const err = await res.text();
      await log({
        agent: "fulfillment",
        action: "client_test",
        entityId: clientId,
        status: "failure",
        errorMessage: `Webhook returned ${res.status}: ${err}`,
      });
      return { passed: false, details: `Webhook failed: ${res.status}` };
    }

    await log({
      agent: "fulfillment",
      action: "client_test",
      entityId: clientId,
      status: "success",
    });

    return {
      passed: true,
      details: "Test form submission processed. Check client's approval email.",
    };
  } catch (err) {
    await log({
      agent: "fulfillment",
      action: "client_test",
      entityId: clientId,
      status: "failure",
      errorMessage: String(err),
    });
    return { passed: false, details: String(err) };
  }
}
