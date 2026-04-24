// Clones the First Response Rx Make.com template scenario for a new client.
// Each client gets their own scenario with a unique webhook URL.

import { cloneScenario, activateScenario } from "@/lib/make";
import { updateFieldByRowId } from "@/lib/google-sheets";
import { log } from "@/lib/logger";
import { env } from "@/lib/env";

export interface ProvisionResult {
  scenarioId: number;
  webhookUrl: string;
}

export async function provisionMakeScenario(
  clientId: string,
  businessName: string,
  templateScenarioId: number
): Promise<ProvisionResult> {
  const newScenarioId = await cloneScenario(
    templateScenarioId,
    `First Response Rx — ${businessName}`
  );

  await activateScenario(newScenarioId);

  // Webhook URL pattern — each client scenario has a unique Make.com webhook URL
  // The actual webhook URL is set inside Make.com when the scenario is configured
  const webhookUrl = `${env.NEXT_PUBLIC_APP_URL}/api/webhooks/make?client=${clientId}`;

  await updateFieldByRowId("Clients", 0, clientId, 12, String(newScenarioId));
  await updateFieldByRowId("Clients", 0, clientId, 13, webhookUrl);

  await log({
    agent: "fulfillment",
    action: "make_scenario_provisioned",
    entityId: clientId,
    status: "success",
    metadata: { scenarioId: newScenarioId, businessName } as unknown as Record<string, unknown>,
  });

  return { scenarioId: newScenarioId, webhookUrl };
}
