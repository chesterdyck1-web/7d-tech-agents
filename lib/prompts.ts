// Prompt override system — reads from the "Agent Prompts" Google Sheet.
// Any agent can call getPromptOverride(agentId, promptKey) to get a live
// prompt from the sheet. If no override exists, returns null and the agent
// falls back to its hardcoded prompt.
//
// Sheet schema: agent_id | prompt_key | prompt_text | active | notes
//
// Jason or Chester can edit the sheet directly to tweak prompts without
// touching the code. Set active = FALSE to disable an override.

import { ensureSheetTab, readSheetAsObjects } from "@/lib/google-sheets";

const SHEET = "Agent Prompts";
const HEADERS = ["agent_id", "prompt_key", "prompt_text", "active", "notes"];

// In-process cache — refreshes every 5 minutes so edits propagate quickly
// without hammering the Sheets API on every request.
let cache: Record<string, string> | null = null;
let cacheAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

function cacheKey(agentId: string, promptKey: string) {
  return `${agentId}::${promptKey}`;
}

async function loadCache(): Promise<Record<string, string>> {
  await ensureSheetTab(SHEET, HEADERS);
  const rows = await readSheetAsObjects(SHEET).catch(() => []);
  const map: Record<string, string> = {};
  for (const row of rows) {
    if (row["active"]?.toUpperCase() !== "TRUE") continue;
    const key = cacheKey(row["agent_id"] ?? "", row["prompt_key"] ?? "");
    if (row["prompt_text"]) map[key] = row["prompt_text"] as string;
  }
  return map;
}

export async function getPromptOverride(
  agentId: string,
  promptKey: string
): Promise<string | null> {
  const now = Date.now();
  if (!cache || now - cacheAt > CACHE_TTL_MS) {
    cache = await loadCache();
    cacheAt = now;
  }
  return cache[cacheKey(agentId, promptKey)] ?? null;
}

// Force-clears the cache — useful after writing a new prompt override.
export function clearPromptCache(): void {
  cache = null;
  cacheAt = 0;
}
