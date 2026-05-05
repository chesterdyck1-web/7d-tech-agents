// Prospecting Agent — demand-driven lead finder.
// Edmund calls this with a specific target. Aldous finds exactly that many
// email-verified leads and stops. Never over-prospects.

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
import type { UncontactedLead } from "@/lib/capacity";

export interface ProspectingResult {
  found: number;         // total places returned by Google Places API
  deduplicated: number;  // already in Master Leads — skipped
  noEmail: number;       // no scraped email — not usable, skipped
  written: number;       // new leads written to sheets (all have email)
}

// Budget: stop prospecting with 60s left so the orchestrator can wrap up
const RUN_BUDGET_MS = 220_000;

// Rotates through cities daily so coverage is even across all target cities
function getCityForToday(): typeof TARGET_CITIES[number] {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
  );
  return TARGET_CITIES[dayOfYear % TARGET_CITIES.length]!;
}

// Find up to targetLeads email-verified leads and write them to sheets.
// Returns the lead objects found (for immediate handoff to Cornelius) and
// the shortfall if the target could not be fully met.
export async function runProspecting(targetLeads: number): Promise<{
  result: ProspectingResult;
  leads: UncontactedLead[];
  shortfall: number;
  city: string;
}> {
  const result: ProspectingResult = { found: 0, deduplicated: 0, noEmail: 0, written: 0 };
  const leads: UncontactedLead[] = [];

  if (targetLeads <= 0) {
    return { result, leads, shortfall: 0, city: "" };
  }

  const city = getCityForToday();
  const runStart = Date.now();

  await log({
    agent: "prospecting",
    action: "run_started",
    status: "pending",
    metadata: { city: city.name, targetLeads } as unknown as Record<string, unknown>,
  });

  const existingIds = await getExistingBusinessIds();

  outer: for (const vertical of VERTICALS) {
    for (const searchTerm of vertical.searchTerms) {
      if (leads.length >= targetLeads) break outer;

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

      // Deduplicate before scraping — skip known leads
      const newPlaces = places.filter(place => {
        const id = generateBusinessId(place.businessName, place.city, place.phone);
        if (isDuplicate(id, existingIds)) {
          result.deduplicated++;
          return false;
        }
        return true;
      });

      // Scrape emails in parallel for all new places in this batch
      const scraped = await Promise.allSettled(
        newPlaces.map(async place => {
          const email = place.website
            ? ((await scrapeEmailFromWebsite(place.website)) ?? "")
            : "";
          return { place, email };
        })
      );

      for (const item of scraped) {
        if (leads.length >= targetLeads) break;
        if (item.status === "rejected") continue;

        const { place, email } = item.value;
        if (!email) {
          result.noEmail++;
          continue; // leads without email cannot be contacted — skip entirely
        }

        const businessId = generateBusinessId(place.businessName, place.city, place.phone);
        const leadRecord = {
          businessId,
          businessName: place.businessName,
          vertical: vertical.id,
          city: place.city,
          province: place.province,
          phone: place.phone,
          email,
          website: place.website ?? "",
          googlePlaceId: place.googlePlaceId,
        };

        try {
          await writeToMasterLeads(leadRecord);
          await writeToDailyLeads(leadRecord);
          existingIds.add(businessId);
          result.written++;
          leads.push({
            businessId,
            businessName: place.businessName,
            vertical: vertical.id,
            city: place.city,
            province: place.province,
            phone: place.phone,
            email,
            website: place.website || undefined,
          });
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

  const shortfall = Math.max(0, targetLeads - leads.length);

  await log({
    agent: "prospecting",
    action: "run_completed",
    status: "success",
    metadata: { ...result, targetLeads, shortfall, city: city.name } as unknown as Record<string, unknown>,
  });

  return { result, leads, shortfall, city: city.name };
}
