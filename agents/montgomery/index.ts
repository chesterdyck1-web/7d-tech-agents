// Montgomery — Black Swan Agent.
// Runs every Monday at 5 AM UTC, before all other weekly agents.
// Finds weak signals across unrelated domains that could reshape 7D Tech
// in the next 6–18 months. Delivers structured brief to Chester via Telegram.

import { appendToSheet, readSheetAsObjects, ensureSheetTab } from "@/lib/google-sheets";
import { sendToChester } from "@/lib/telegram";
import { log } from "@/lib/logger";
import { scanForBlackSwans, type BlackSwanSignal } from "./signal-scanner";

const SHEET = "Montgomery Briefs";
const HEADERS = [
  "week_start", "domain", "signal", "impact", "probability",
  "time_horizon", "strategic_response",
];

function getMondayISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

function impactEmoji(impact: BlackSwanSignal["impact"]): string {
  return { existential: "☠️", high: "🔴", medium: "🟡", low: "⚪" }[impact];
}

function horizonLabel(h: BlackSwanSignal["timeHorizon"]): string {
  return { near: "6–9 mo", medium: "9–12 mo", far: "12–18 mo" }[h];
}

const MAX_TELEGRAM = 3800; // leave headroom under the 4096 char limit

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 1) + "…";
}

function formatTelegramBrief(
  signals: BlackSwanSignal[],
  executiveSummary: string,
  dateStr: string
): string {
  const existential = signals.filter((s) => s.impact === "existential");
  const high = signals.filter((s) => s.impact === "high");
  const medium = signals.filter((s) => s.impact === "medium");
  const lower = signals.filter((s) => s.impact === "low").length;

  let msg = `*MONTGOMERY — WEEKLY BLACK SWAN BRIEF*\n${dateStr}\n\n`;

  if (executiveSummary) {
    msg += `_${truncate(executiveSummary, 280)}_\n`;
  }

  // Existential first, then high, then top-2 medium — capped to keep under limit
  const priority: Array<[string, BlackSwanSignal[]]> = [
    ["☠️ EXISTENTIAL", existential],
    ["🔴 HIGH IMPACT", high],
    ["🟡 MEDIUM", medium.slice(0, 2)],
  ];

  for (const [label, group] of priority) {
    if (group.length === 0) continue;
    msg += `\n*${label}*\n`;
    for (const s of group) {
      const signalText = truncate(s.signal, 140);
      const responseText = truncate(s.strategicResponse, 100);
      msg += `\n▸ *${s.domain}* · ${s.probability} · ${horizonLabel(s.timeHorizon)}\n`;
      msg += `${signalText}\n`;
      msg += `→ _${responseText}_\n`;
    }
  }

  const mediumExtra = medium.length > 2 ? medium.length - 2 : 0;
  const tail: string[] = [];
  if (mediumExtra > 0) tail.push(`${mediumExtra} more medium`);
  if (lower > 0) tail.push(`${lower} low`);
  if (tail.length > 0) msg += `\n_+ ${tail.join(", ")} signal${tail.length > 1 ? "s" : ""} in Montgomery Briefs sheet_`;

  msg += `\n\nFull report saved → Montgomery Briefs sheet`;
  msg += `\nReply "black swan brief" to recall at any time.`;

  // Hard cap — should never trigger but protects against edge cases
  return msg.slice(0, MAX_TELEGRAM);
}

export async function runMontgomery(): Promise<void> {
  await ensureSheetTab(SHEET, HEADERS);

  const weekStart = getMondayISO();
  const dateStr = new Date().toLocaleDateString("en-CA", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    timeZone: "America/Toronto",
  });

  const brief = await scanForBlackSwans();

  // Write one row per signal to the sheet
  for (const signal of brief.signals) {
    await appendToSheet(SHEET, [
      weekStart,
      signal.domain,
      signal.signal,
      signal.impact,
      signal.probability,
      signal.timeHorizon,
      signal.strategicResponse,
    ]);
  }

  // Send structured brief to Chester via Telegram
  const message = formatTelegramBrief(brief.signals, brief.executiveSummary, dateStr);
  await sendToChester(message);

  await log({
    agent: "montgomery",
    action: "black_swan_brief_sent",
    status: "success",
    metadata: {
      weekStart,
      signalCount: brief.signals.length,
      existentialCount: brief.signals.filter((s) => s.impact === "existential").length,
      highCount: brief.signals.filter((s) => s.impact === "high").length,
    } as unknown as Record<string, unknown>,
  });
}

// Returns the top high/existential signals from this week — used by the daily brief.
export async function getTopMontgomerySignals(): Promise<string | null> {
  const rows = await readSheetAsObjects(SHEET).catch(() => []);
  if (rows.length === 0) return null;

  const thisMonday = getMondayISO();
  const thisWeek = rows.filter((r) => r["week_start"] === thisMonday);
  if (thisWeek.length === 0) return null;

  const priority = thisWeek.filter(
    (r) => r["impact"] === "existential" || r["impact"] === "high"
  );
  if (priority.length === 0) return null;

  return priority
    .slice(0, 3)
    .map((r) => {
      const signal = r["signal"] ?? "";
      return `  ${impactEmoji(r["impact"] as BlackSwanSignal["impact"])} *${r["domain"] ?? ""}*: ${signal.slice(0, 120)}${signal.length > 120 ? "…" : ""}`;
    })
    .join("\n");
}

// Returns the full brief text for on-demand recall via "black swan brief" command.
export async function getLatestMontgomeryBrief(): Promise<string> {
  const rows = await readSheetAsObjects(SHEET).catch(() => []);
  if (rows.length === 0) return "No Montgomery brief available yet. Runs every Monday at 5 AM.";

  // Get the most recent week's data
  const latestWeek = rows[rows.length - 1]?.["week_start"];
  if (!latestWeek) return "No brief data found.";

  const weekRows = rows.filter((r) => r["week_start"] === latestWeek);
  const signals: BlackSwanSignal[] = weekRows.map((r) => ({
    domain: r["domain"] ?? "",
    signal: r["signal"] ?? "",
    impact: (r["impact"] ?? "low") as BlackSwanSignal["impact"],
    probability: (r["probability"] ?? "unlikely") as BlackSwanSignal["probability"],
    timeHorizon: (r["time_horizon"] ?? "far") as BlackSwanSignal["timeHorizon"],
    strategicResponse: r["strategic_response"] ?? "",
  }));

  const dateStr = new Date(latestWeek + "T12:00:00Z").toLocaleDateString("en-CA", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  return formatTelegramBrief(signals, "", dateStr);
}
