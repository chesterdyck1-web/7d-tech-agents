// Analyzes Vapi call transcripts from the last 7 days.
// Extracts objections, outcomes, talk ratios, and common drop-off points.
// Used by coaching-brief.ts to generate weekly coaching recommendations.

import { listCalls, type VapiCall } from "@/lib/vapi";
import { claude } from "@/lib/claude";
import { getPromptOverride } from "@/lib/prompts";

export interface CallPattern {
  totalCalls: number;
  completedCalls: number;
  avgDurationSeconds: number;
  topObjections: string[];
  commonDropOffPoints: string[];
  positiveSignals: string[];
  rawSummary: string;
}

const CALL_ANALYSIS_SYSTEM = `You are a sales coach analyzing AI cold call transcripts for a Canadian B2B SaaS company.
The product is "First Response Rx" — AI that auto-replies to contact form submissions so business owners never miss a lead.
Price: $50/month or $480/year. Target: gyms, photographers, massage therapists, chiropractors, landscapers.

Analyze the transcripts and extract:
1. TOP OBJECTIONS (3 most common, one per line, concise)
2. DROP-OFF POINTS (where prospects disengage, one per line)
3. POSITIVE SIGNALS (phrases that correlate with interest, one per line)

Format exactly:
OBJECTIONS:
[objection 1]
[objection 2]
[objection 3]
DROP-OFF:
[point 1]
[point 2]
POSITIVE:
[signal 1]
[signal 2]`;

function sevenDaysAgo(): string {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
}

// Parse the Claude analysis response into structured data.
function parseAnalysis(text: string): Pick<CallPattern, "topObjections" | "commonDropOffPoints" | "positiveSignals"> {
  const objections: string[] = [];
  const dropOffs: string[] = [];
  const positives: string[] = [];

  let section: "obj" | "drop" | "pos" | null = null;
  for (const line of text.split("\n").map((l) => l.trim()).filter(Boolean)) {
    if (line.startsWith("OBJECTIONS:")) { section = "obj"; continue; }
    if (line.startsWith("DROP-OFF:")) { section = "drop"; continue; }
    if (line.startsWith("POSITIVE:")) { section = "pos"; continue; }
    if (section === "obj") objections.push(line);
    else if (section === "drop") dropOffs.push(line);
    else if (section === "pos") positives.push(line);
  }

  return { topObjections: objections, commonDropOffPoints: dropOffs, positiveSignals: positives };
}

export async function analyzeRecentCalls(): Promise<CallPattern> {
  const calls = await listCalls(50, sevenDaysAgo());

  const completedCalls = calls.filter((c) => c.status === "ended" && c.durationSeconds && c.durationSeconds > 30);
  const totalDuration = completedCalls.reduce((sum, c) => sum + (c.durationSeconds ?? 0), 0);
  const avgDurationSeconds = completedCalls.length > 0 ? Math.round(totalDuration / completedCalls.length) : 0;

  if (completedCalls.length === 0) {
    return {
      totalCalls: calls.length,
      completedCalls: 0,
      avgDurationSeconds: 0,
      topObjections: [],
      commonDropOffPoints: [],
      positiveSignals: [],
      rawSummary: "No completed calls with transcripts in the last 7 days.",
    };
  }

  // Concatenate up to 10 transcripts for analysis — enough for pattern detection
  const transcriptBlock = completedCalls
    .slice(0, 10)
    .filter((c): c is VapiCall & { transcript: string } => !!c.transcript)
    .map((c, i) => `--- CALL ${i + 1} (${Math.round((c.durationSeconds ?? 0) / 60 * 10) / 10} min) ---\n${c.transcript}`)
    .join("\n\n");

  if (!transcriptBlock) {
    return {
      totalCalls: calls.length,
      completedCalls: completedCalls.length,
      avgDurationSeconds,
      topObjections: [],
      commonDropOffPoints: [],
      positiveSignals: [],
      rawSummary: "Calls completed but no transcripts available.",
    };
  }

  const system = (await getPromptOverride("dorian", "call_analyzer")) ?? CALL_ANALYSIS_SYSTEM;
  const res = await claude({
    system,
    userMessage: transcriptBlock,
    maxTokens: 400,
    label: "dorian:call-analysis",
  });

  const parsed = parseAnalysis(res.text);

  return {
    totalCalls: calls.length,
    completedCalls: completedCalls.length,
    avgDurationSeconds,
    ...parsed,
    rawSummary: res.text,
  };
}
