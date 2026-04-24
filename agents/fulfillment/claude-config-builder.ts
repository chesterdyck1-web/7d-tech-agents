// Builds a business-specific Claude system prompt for a client's First Response Rx.
// Each client gets a prompt tuned to their vertical, tone, and business details.

import { claude } from "@/lib/claude";

export interface ClientConfig {
  businessName: string;
  ownerName: string;
  vertical: string;
  city: string;
  services?: string;
  tone?: string;
}

export async function buildClientPrompt(config: ClientConfig): Promise<string> {
  const res = await claude({
    system: `You write Claude system prompts for service businesses.
The prompt will be used to draft replies to contact form inquiries.
Output ONLY the system prompt — no explanation, no markdown fencing.`,
    userMessage: `Write a system prompt for this business:

Business: ${config.businessName}
Owner: ${config.ownerName}
Type: ${config.vertical} in ${config.city}
${config.services ? `Services: ${config.services}` : ""}
${config.tone ? `Preferred tone: ${config.tone}` : ""}

The prompt must instruct Claude to:
1. Draft a warm, personal reply to the prospect's specific inquiry
2. Mention the business name naturally
3. Propose a clear next step (book a call, visit, or consultation)
4. Keep replies to 3-5 sentences
5. Sign off as ${config.ownerName} at ${config.businessName}
6. Never sound like an auto-reply or template`,
    maxTokens: 600,
    label: "fulfillment:build-client-prompt",
  });

  return res.text.trim();
}
