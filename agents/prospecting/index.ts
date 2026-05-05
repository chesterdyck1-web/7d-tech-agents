// Prospecting Agent — runs daily at 6 AM ET.
// Searches Google Places for target businesses, scrapes emails, deduplicates, writes to sheets.

import { searchPlaces } from "@/lib/google-places";
import { log } from "@/lib/logger";
import { scrapeEmailFromWebsite } from "./website-email-scraper";
import {
  generateBusinessId,
  getExistingBusinessIds,
  isDuplicate,
} from "./deduplicator";
import { writeToMasterLeads, writeToDailyLeads } from "./sheet-writer";
import { TARGET_CITIES } from "@/config/cities";
import { VERTICALS } from "@/config/verticals";
import { sendToChester } from "@/lib/telegram";

export interface ProspectingResult {
  found: number;
  deduplicated: number;
  emailsDiscovered: number;
  written: number;
}

// Budget: leave 60s buffer under the 300s maxDuration for sheet writes and logging.
const RUN_BUDGET_MS = 240_000;

// Rotates through cities daily so all cities are covered every N days.
function getCityForToday(): typeof TARGET_CITIES[number] {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
  );
  return TARGET_CITIES[dayOfYear % TARGET_CITIES.length]!;
}

export async function runProspecting(): Promise<ProspectingResult> {
  const result: ProspectingResult = {
    found: 0,
    deduplicated: 0,
    emailsDiscovered: 0,
    written: 0,
  };

  const city = getCityForToday();
  const runStart = Date.now();

  await log({ agent: "prospecting", action: "run_started", status: "pending", metadata: { city: city.name } as unknown as Record<string, unknown> });

  const existingIds = await getExistingBusinessIds();

  outer: for (const vertical of VERTICALS) {
    for (const searchTerm of vertical.searchTerms) {
      // Stop if we are approaching the function time limit
      if (Date.now() - runStart > RUN_BUDGET_MS) {
        await log({
          agent: "prospecting",
          action: "budget_limit_reached",
          status: "success",
          metadata: { elapsed: Date.now() - runStart, written: result.written } as unknown as Record<string, unknown>,
        });
        break outer;
      }

      let places;
      try {
        places = await searchPlaces(searchTerm, city.name, city.province, 20);
      } catch (err) {
        await log({
          agent: "prospecting",
          action: "places_search",
          status: "failure",
          metadata: { searchTerm, city: city.name } as unknown as Record<string, unknown>,
          errorMessage: String(err),
        });
        continue;
      }

      result.found += places.length;

      // Deduplicate before scraping — no point fetching websites for known leads
      const newPlaces = places.filter((place) => {
        const businessId = generateBusinessId(place.businessName, place.city, place.phone);
        if (isDuplicate(businessId, existingIds)) {
          result.deduplicated++;
          return false;
        }
        return true;
      });

      // Scrape emails in parallel for all new places in this batch
      const scraped = await Promise.allSettled(
        newPlaces.map(async (place) => {
          const email = place.website
            ? ((await scrapeEmailFromWebsite(place.website)) ?? "")
            : "";
          return { place, email };
        })
      );

      for (const item of scraped) {
        if (item.status === "rejected") continue;
        const { place, email } = item.value;

        if (email) result.emailsDiscovered++;

        const businessId = generateBusinessId(place.businessName, place.city, place.phone);
        const lead = {
          businessId,
          businessName: place.businessName,
          vertical: vertical.id,
          city: place.city,
          province: place.province,
          phone: place.phone,
          email,
          website: place.website,
          googlePlaceId: place.googlePlaceId,
        };

        try {
          await writeToMasterLeads(lead);
          await writeToDailyLeads(lead);
          existingIds.add(businessId); // prevent same-run duplicates
          result.written++;
        } catch (err) {
          await log({
            agent: "prospecting",
            action: "write_lead",
            entityId: businessId,
            status: "failure",
            errorMessage: String(err),
          });
        }
      }
    }
  }

  await log({
    agent: "prospecting",
    action: "run_completed",
    status: "success",
    metadata: result as unknown as Record<string, unknown>,
  });

  if (result.written === 0) {
    await sendToChester(
      `*Prospecting — ${city.name}*\nNo new leads today (${result.found} found, ${result.deduplicated} already in system). No outreach queued.`
    );
    return result;
  }

  // New leads written — Cornelius picks them up at 8 AM ET via the outreach cron.
  await sendToChester(
    `*Prospecting — ${city.name}*\n${result.written} new leads written | ${result.emailsDiscovered} emails found | ${result.deduplicated} duplicates skipped\n\nCornelius will draft and queue emails at 8 AM ET — they will be ready in your dashboard before the morning brief.`
  );

  return result;
}
