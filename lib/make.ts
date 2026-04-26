// Make.com API helpers — clone scenarios and trigger webhooks.

import { env } from "@/lib/env";

const BASE = "https://us2.make.com/api/v2";

function headers() {
  return {
    "Content-Type": "application/json",
    Authorization: `Token ${env.MAKE_API_KEY}`,
  };
}

// Clone a Make.com scenario template for a new client.
// Returns the new scenario ID.
export async function cloneScenario(
  templateScenarioId: number,
  newName: string
): Promise<number> {
  const res = await fetch(`${BASE}/scenarios/${templateScenarioId}/clone`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      teamId: Number(env.MAKE_TEAM_ID),
      organizationId: Number(env.MAKE_ORGANIZATION_ID),
      name: newName,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Make.com cloneScenario error: ${err}`);
  }

  const data = (await res.json()) as { scenario: { id: number } };
  return data.scenario.id;
}

// List all scenarios in the team.
export async function listScenarios(): Promise<{ id: number; name: string; isActive: boolean }[]> {
  const res = await fetch(
    `${BASE}/scenarios?teamId=${env.MAKE_TEAM_ID}&pg[limit]=50`,
    { headers: headers() }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Make.com listScenarios error: ${err}`);
  }

  const data = (await res.json()) as {
    scenarios: { id: number; name: string; isActive: boolean }[];
  };
  return data.scenarios ?? [];
}

// Activate a scenario so it starts running.
export async function activateScenario(scenarioId: number): Promise<void> {
  const res = await fetch(`${BASE}/scenarios/${scenarioId}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({ isActive: true }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Make.com activateScenario error: ${err}`);
  }
}
