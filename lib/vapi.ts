// Vapi API helpers — create calls and parse outcome webhooks.

import { env } from "@/lib/env";

const BASE = "https://api.vapi.ai";

export interface VapiCallParams {
  phoneNumber: string;
  assistantId: string;
  assistantOverrides?: {
    variableValues?: Record<string, string>;
  };
}

// Trigger an outbound Vapi call. Returns the call ID.
export async function createCall(params: VapiCallParams): Promise<string> {
  const res = await fetch(`${BASE}/call/phone`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.VAPI_API_KEY}`,
    },
    body: JSON.stringify({
      phoneNumberId: params.phoneNumber,
      assistantId: params.assistantId,
      assistantOverrides: params.assistantOverrides,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Vapi createCall error: ${err}`);
  }

  const data = (await res.json()) as { id: string };
  return data.id;
}

export interface VapiCall {
  id: string;
  status: string;
  startedAt?: string;
  endedAt?: string;
  durationSeconds?: number;
  transcript?: string;
  endedReason?: string;
  assistantId?: string;
  metadata?: Record<string, string>;
}

// List recent Vapi calls with transcript data — used by Dorian for call analysis.
export async function listCalls(limit = 100, createdAfterIso?: string): Promise<VapiCall[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (createdAfterIso) params.set("createdAtGt", createdAfterIso);

  const res = await fetch(`${BASE}/call?${params}`, {
    headers: {
      Authorization: `Bearer ${env.VAPI_API_KEY}`,
    },
  });

  if (!res.ok) throw new Error(`Vapi listCalls error: ${await res.text()}`);

  const data = (await res.json()) as VapiCall[];
  return Array.isArray(data) ? data : [];
}

// Create a Vapi assistant with the First Response Rx call script.
// Returns the assistant ID — store this as VAPI_ASSISTANT_ID.
export async function createAssistant(name: string, systemPrompt: string): Promise<string> {
  const res = await fetch(`${BASE}/assistant`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.VAPI_API_KEY}`,
    },
    body: JSON.stringify({
      name,
      model: {
        provider: "anthropic",
        model: "claude-haiku-4-5-20251001",
        messages: [{ role: "system", content: systemPrompt }],
      },
      voice: {
        provider: "openai",
        voiceId: "nova",
      },
      firstMessage: "Hi, is this {{ownerName}} from {{businessName}}? I'll be quick — 30 seconds?",
      endCallMessage: "Thanks for your time. Have a great day.",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Vapi createAssistant error: ${err}`);
  }

  const data = (await res.json()) as { id: string };
  return data.id;
}

// Parse a Vapi webhook callback to extract call outcome.
export interface VapiCallOutcome {
  callId: string;
  status: "completed" | "failed" | "no-answer" | "busy";
  endedReason?: string;
  transcript?: string;
  durationSeconds?: number;
}

export function parseVapiWebhook(body: unknown): VapiCallOutcome | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;

  const call = b["call"] as Record<string, unknown> | undefined;
  if (!call) return null;

  return {
    callId: (call["id"] as string) ?? "",
    status: (call["status"] as VapiCallOutcome["status"]) ?? "failed",
    endedReason: call["endedReason"] as string | undefined,
    transcript: call["transcript"] as string | undefined,
    durationSeconds: call["duration"] as number | undefined,
  };
}
