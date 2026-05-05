// Self-healing infrastructure — the autonomous recovery layer between agents.
// Quincy → Alistair → Edmund is the escalation chain. Chester only hears about
// something if all three have tried and failed, or if it genuinely requires a decision.

import { readSheetAsObjects, sleep } from "@/lib/google-sheets";
import { sendToChester } from "@/lib/telegram";
import { log } from "@/lib/logger";

// ─── QA Feedback ─────────────────────────────────────────────────────────────

// Translates QA failure reasons into specific rewrite instructions Cornelius can act on.
// Plain English so Claude understands exactly what to fix on the next attempt.
export function generateEmailFixInstructions(reasons: string[]): string {
  const instructions: string[] = ["REWRITE REQUIRED. Fix every item below:"];

  for (const reason of reasons) {
    const r = reason.toLowerCase();

    if (r.includes("too short")) {
      instructions.push("Body is too short. Write at least 5 full sentences before the signature.");
    }
    if (r.includes("no clear cta") || r.includes("missing cta") || r.includes("no mention of demo")) {
      instructions.push("Final sentence before signature must ask for a 15-minute call. Use: 'Worth a quick 15-minute call this week?' or a close variant.");
    }
    if (r.includes("missing signature")) {
      instructions.push("Sign off with two lines: 'Chester' then '7D Tech' — both required, nothing else.");
    }
    if (r.includes("forbidden term")) {
      const match = reason.match(/forbidden term: "(.+?)"/);
      const term = match?.[1] ?? "a forbidden word";
      instructions.push(`Do not use the word "${term}". Describe the outcome, not the technology.`);
    }
    if (r.includes("spam trigger")) {
      const match = reason.match(/spam trigger word: "(.+?)"/);
      const trigger = match?.[1] ?? "a flagged word";
      instructions.push(`Remove the spam trigger word "${trigger}".`);
    }
    if (r.includes("too long")) {
      instructions.push("Body is too long. Cut to 5-6 sentences maximum. Remove filler.");
    }
  }

  if (instructions.length === 1) {
    instructions.push("Rewrite from scratch following the reference format exactly: opening observation, product sentence, beta offer sentence, CTA question, Chester/7D Tech signature.");
  }

  return instructions.join("\n- ");
}

// ─── Action Log Queries ───────────────────────────────────────────────────────

export interface RecentFailure {
  action: string;
  errorMessage: string;
  timestamp: string;
  entityId: string;
}

// Returns the last N failures for a specific agent within the last N minutes.
export async function getRecentAgentFailures(
  agentName: string,
  withinMinutes = 60,
  limit = 10
): Promise<RecentFailure[]> {
  try {
    const rows = await readSheetAsObjects("Action Log");
    const cutoff = new Date(Date.now() - withinMinutes * 60 * 1000);

    return rows
      .filter(
        (r) =>
          r["agent"] === agentName &&
          r["status"] === "failure" &&
          r["timestamp"] &&
          new Date(r["timestamp"]) >= cutoff
      )
      .slice(-limit)
      .map((r) => ({
        action: r["action"] ?? "",
        errorMessage: r["error_message"] ?? r["errorMessage"] ?? r["metadata"] ?? "",
        timestamp: r["timestamp"] ?? "",
        entityId: r["entity_id"] ?? "",
      }));
  } catch {
    return [];
  }
}

// Returns failures that were subsequently auto-fixed (by Alistair) in the last 24h.
// Used by Edmund to report resolved issues in past tense.
export async function getAutoResolvedIssues(withinHours = 24): Promise<string[]> {
  try {
    const rows = await readSheetAsObjects("Action Log");
    const cutoff = new Date(Date.now() - withinHours * 60 * 60 * 1000);

    const resolved = rows.filter(
      (r) =>
        r["agent"] === "alistair" &&
        (r["action"] === "auto_fixed" || r["action"] === "scenario_reactivated" || r["action"] === "repair_completed") &&
        r["status"] === "success" &&
        r["timestamp"] &&
        new Date(r["timestamp"]) >= cutoff
    );

    return resolved.map((r) => {
      try {
        const meta = JSON.parse(r["metadata"] ?? "{}") as Record<string, string>;
        return meta["description"] ?? `${meta["fromAgent"] ?? "agent"} issue on ${meta["failedAction"] ?? r["action"]}`;
      } catch {
        return r["action"] ?? "unknown issue";
      }
    });
  } catch {
    return [];
  }
}

// ─── Error Diagnosis ──────────────────────────────────────────────────────────

export type FixType = "backoff" | "retry" | "skip" | "none";

export interface Diagnosis {
  canAutoFix: boolean;
  fixType: FixType;
  explanation: string;
  retryDelayMs: number;
}

// Classifies an error message and returns how Alistair should respond.
export function diagnoseError(errorMessage: string): Diagnosis {
  const msg = errorMessage.toLowerCase();

  if (msg.includes("429") || msg.includes("quota") || msg.includes("rate limit") || msg.includes("resource exhausted")) {
    return { canAutoFix: true, fixType: "backoff", explanation: "API quota exceeded — waiting and retrying", retryDelayMs: 5000 };
  }
  if (msg.includes("timeout") || msg.includes("econnreset") || msg.includes("socket") || msg.includes("network") || msg.includes("fetch")) {
    return { canAutoFix: true, fixType: "retry", explanation: "Network error — retrying after 30 seconds", retryDelayMs: 30000 };
  }
  if (msg.includes("not found") || msg.includes("no such") || msg.includes("missing")) {
    return { canAutoFix: true, fixType: "skip", explanation: "Missing data — skipping record and continuing", retryDelayMs: 0 };
  }
  if (msg.includes("json") || msg.includes("parse") || msg.includes("malformed") || msg.includes("unexpected token")) {
    return { canAutoFix: true, fixType: "skip", explanation: "Malformed data — cleaning and skipping bad record", retryDelayMs: 0 };
  }

  return { canAutoFix: false, fixType: "none", explanation: "Unknown error — cannot auto-fix", retryDelayMs: 0 };
}

// ─── Escalation ───────────────────────────────────────────────────────────────

// Routes a failure to Alistair for technical diagnosis and fix attempt.
// Alistair logs a repair_request entry; his hourly scan will pick it up.
export async function routeToAlistair(
  agentName: string,
  action: string,
  error: string,
  context: string
): Promise<void> {
  await log({
    agent: "alistair",
    action: "repair_request",
    status: "pending",
    metadata: {
      fromAgent: agentName,
      failedAction: action,
      error: error.slice(0, 300),
      context,
      description: `${agentName} failed on ${action}: ${error.slice(0, 100)}`,
    } as unknown as Record<string, unknown>,
  });
}

// Escalates a persistent failure to Edmund and alerts Chester via Telegram.
// All exhausted-retry escalations ping Chester — urgency controls tone only.
// "immediate" = urgent flag for money/security issues
// "brief" = informational alert for operational failures
export async function escalateToEdmund(
  agentName: string,
  action: string,
  attempts: number,
  failureReasons: string[],
  urgency: "brief" | "immediate" = "brief"
): Promise<void> {
  await log({
    agent: "coordinator",
    action: "escalation_received",
    status: "failure",
    errorMessage: `${agentName} failed ${attempts}x on ${action} — self-healing exhausted`,
    metadata: {
      fromAgent: agentName,
      failedAction: action,
      attempts,
      reasons: failureReasons.slice(0, 3),
      urgency,
    } as unknown as Record<string, unknown>,
  });

  const reasonLines = failureReasons.slice(0, 3).map((r) => `• ${r}`).join("\n");

  if (urgency === "immediate") {
    await sendToChester(
      `*EDMUND — Immediate attention needed*\n\n${agentName} has failed ${attempts} times on "${action}" and cannot self-recover.\n\nReasons:\n${reasonLines}\n\nNothing client-facing has been affected.`
    );
  } else {
    // Operational failure — Chester gets a plain alert, no alarm
    await sendToChester(
      `*EDMUND — Self-healing exhausted*\n${agentName} failed ${attempts}x on "${action}".\n\nReasons:\n${reasonLines}\n\nNo action needed from you — this has been logged. I will investigate.`
    );
  }
}

// ─── Retry Wrapper ────────────────────────────────────────────────────────────

// Runs a task. On failure, diagnoses the error and retries if Alistair can fix it.
// After maxAttempts, routes to Alistair and then Edmund if still failing.
export async function withAgentRecovery<T>(
  agentName: string,
  action: string,
  task: () => Promise<T>,
  maxAttempts = 3
): Promise<T | null> {
  let lastError = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await task();
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      const diagnosis = diagnoseError(lastError);

      await log({
        agent: agentName as Parameters<typeof log>[0]["agent"],
        action: `${action}_attempt_${attempt}`,
        status: "failure",
        errorMessage: lastError,
        retryCount: attempt,
        metadata: { diagnosis: diagnosis.explanation } as unknown as Record<string, unknown>,
      });

      if (!diagnosis.canAutoFix || attempt === maxAttempts) break;

      // Apply the fix before retrying
      if (diagnosis.retryDelayMs > 0) {
        await sleep(diagnosis.retryDelayMs);
      }
    }
  }

  // Self-healing failed — route to Alistair
  await routeToAlistair(agentName, action, lastError, `Failed after ${maxAttempts} attempts`);
  await escalateToEdmund(agentName, action, maxAttempts, [lastError], "brief");

  return null;
}
