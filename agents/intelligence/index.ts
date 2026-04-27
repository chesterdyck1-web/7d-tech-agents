// Intelligence Agent (Iris) — delivers Chester's weekly market and performance brief.
// Runs Monday at 12 PM ET, one hour after the performance cron.
// Chester rates each brief 1–5 in the Intelligence Briefs sheet — that rating feeds the KPI system.

import { appendToSheet, readSheetAsObjects } from "@/lib/google-sheets";
import { sendToChester } from "@/lib/telegram";
import { log } from "@/lib/logger";
import { scrapeCompetitors } from "./competitor-scraper";
import { mineReviews } from "./reviews-miner";
import { analyzePerformance } from "./performance-analyzer";
import { randomUUID } from "crypto";

function getMondayISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // rewind to Monday
  return d.toISOString().slice(0, 10);
}

export async function runIntelligenceBrief(): Promise<void> {
  const briefId = randomUUID();
  const weekStart = getMondayISO();

  await sendToChester("Building this week's intelligence brief — back in a minute.");

  // Run all three analyses in parallel to stay within the cron window
  const [competitorInsights, reviewsInsights, performanceInsights] =
    await Promise.all([
      scrapeCompetitors().catch((err) => `Competitor scrape failed: ${String(err)}`),
      mineReviews().catch((err) => `Reviews mine failed: ${String(err)}`),
      analyzePerformance().catch((err) => `Performance analysis failed: ${String(err)}`),
    ]);

  const dateStr = new Date().toLocaleDateString("en-CA", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "America/Toronto",
  });

  const fullBrief = [
    `*WEEKLY INTELLIGENCE BRIEF — ${dateStr}*`,
    "",
    `*COMPETITOR LANDSCAPE*`,
    competitorInsights,
    "",
    `*MARKET COMPLAINTS*`,
    reviewsInsights,
    "",
    `*AGENT PERFORMANCE*`,
    performanceInsights,
    "",
    `Rate this brief 1–5 in the Intelligence Briefs tab — your rating trains the system.`,
  ].join("\n");

  // Write to Intelligence Briefs sheet
  // Columns: brief_id | week_start | competitor_insights | reviews_insights | performance_insights | full_brief | rating | created_at
  await appendToSheet("Intelligence Briefs", [
    briefId,
    weekStart,
    competitorInsights,
    reviewsInsights,
    performanceInsights,
    fullBrief,
    "", // rating — Chester fills this in
    new Date().toISOString(),
  ]);

  await log({
    agent: "intelligence",
    action: "brief_delivered",
    entityId: briefId,
    status: "success",
    metadata: { weekStart } as unknown as Record<string, unknown>,
  });

  await sendToChester(fullBrief);
}

// Returns the latest intelligence brief from the sheet — used by Coordinator to answer questions.
export async function getLatestBrief(): Promise<string> {
  const rows = await readSheetAsObjects("Intelligence Briefs");
  if (rows.length === 0) return "No intelligence briefs have been generated yet.";

  const latest = rows[rows.length - 1]!;
  return latest["full_brief"] ?? "Brief content unavailable.";
}
