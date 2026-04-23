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

// Rotates through cities daily so all cities are covered every N days.
// Avoids Vercel's 60-second function timeout by limiting work per run.
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
  await log({ agent: "prospecting", action: "run_started", status: "pending", metadata: { city: city.name } as unknown as Record<string, unknown> });

  const existingIds = await getExistingBusinessIds();

  // Process one city per run, all verticals
  for (const vertical of VERTICALS) {
      for (const searchTerm of vertical.searchTerms) {
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

        for (const place of places) {
          const businessId = generateBusinessId(
            place.businessName,
            place.city,
            place.phone
          );

          if (isDuplicate(businessId, existingIds)) {
            result.deduplicated++;
            continue;
          }

          // Scrape email from website
          let email = "";
          if (place.website) {
            email = (await scrapeEmailFromWebsite(place.website)) ?? "";
            if (email) result.emailsDiscovered++;
          }

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

  // Notify Chester via Telegram
  await sendToChester(
    `*Prospecting complete — ${city.name}*\nFound: ${result.found} | New: ${result.written} | Emails discovered: ${result.emailsDiscovered} | Duplicates skipped: ${result.deduplicated}`
  );

  return result;
}
