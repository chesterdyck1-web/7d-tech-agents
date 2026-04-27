// Fetches competitor agency homepages weekly.
// Claude extracts pricing, offers, and positioning from each site's homepage text.
// Failures are silent — blocked sites are skipped, not fatal.

import { claude } from "@/lib/claude";

const COMPETITORS = [
  { name: "GoHighLevel", url: "https://www.gohighlevel.com" },
  { name: "Vendasta", url: "https://www.vendasta.com" },
  { name: "NiceJob", url: "https://nicejob.com" },
  { name: "Podium", url: "https://www.podium.com" },
  { name: "Birdeye", url: "https://birdeye.com" },
  { name: "Tidio", url: "https://www.tidio.com" },
];

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 3000);
}

export async function scrapeCompetitors(): Promise<string> {
  const results: string[] = [];

  for (const competitor of COMPETITORS) {
    try {
      const res = await fetch(competitor.url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; research bot)" },
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) continue;

      const html = await res.text();
      const pageText = stripHtml(html);

      const analysis = await claude({
        system:
          "You analyze competitor websites for a Canadian AI automation agency targeting service businesses. Extract facts only — no fluff.",
        userMessage: `Analyze this homepage. Reply with exactly 3 bullet points covering: pricing model, main product/offer, and target market or key differentiator. Skip any you cannot determine.

Company: ${competitor.name}
Page text: ${pageText}`,
        maxTokens: 150,
        label: "intelligence:analyze-competitor",
      });

      results.push(`*${competitor.name}*\n${analysis.text.trim()}`);
    } catch {
      // Serverless IPs are sometimes blocked — skip and move on
    }
  }

  if (results.length === 0) {
    return "No competitor data retrieved this week — sites may have blocked the request.";
  }

  return results.join("\n\n");
}
