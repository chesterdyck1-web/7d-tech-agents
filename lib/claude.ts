// Anthropic SDK wrapper with automatic retry and action logging.
// All agents call claude() from here — never instantiate the SDK directly.

import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }
  return _client;
}

export interface ClaudeRequest {
  system: string;
  userMessage: string;
  maxTokens?: number;
  // Pass a label for logging — e.g. "outreach:draft-email"
  label?: string;
}

export interface ClaudeResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1500;

// Send a message to Claude and return the text response.
// Retries up to 3 times on transient errors (rate limits, timeouts).
export async function claude(req: ClaudeRequest): Promise<ClaudeResponse> {
  const client = getClient();
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: req.maxTokens ?? 1024,
        system: req.system,
        messages: [{ role: "user", content: req.userMessage }],
      });

      const text =
        res.content[0]?.type === "text" ? res.content[0].text : "";

      return {
        text,
        inputTokens: res.usage.input_tokens,
        outputTokens: res.usage.output_tokens,
      };
    } catch (err: unknown) {
      lastError = err;
      const isRetryable =
        err instanceof Anthropic.APIError &&
        (err.status === 429 || err.status >= 500);

      if (!isRetryable || attempt === MAX_RETRIES) break;

      await sleep(RETRY_DELAY_MS * attempt);
    }
  }

  throw new Error(
    `Claude request failed after ${MAX_RETRIES} attempts${req.label ? ` (${req.label})` : ""}: ${String(lastError)}`
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
