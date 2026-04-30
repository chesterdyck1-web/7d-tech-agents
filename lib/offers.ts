// Offer rotation system — reads from the "Offers" Google Sheet.
// Chester and Jason can add/edit offers in the sheet to A/B test which
// framing gets better reply rates. The system cycles through active offers
// in round-robin order using a counter in the Settings sheet.
//
// Sheet schema:
//   offer_id | title | outreach_hook | content_hook | active | notes
//
// outreach_hook: the 1-sentence beta/offer framing used in cold emails
//   (replaces "try it at no cost while I build my first case studies")
// content_hook:  the framing used in social content captions
// active: TRUE/FALSE — only active offers are served

import { ensureSheetTab, readSheetAsObjects } from "@/lib/google-sheets";
import { getSetting, setSetting } from "@/lib/settings";

const SHEET = "Offers";
const HEADERS = ["offer_id", "title", "outreach_hook", "content_hook", "active", "notes"];

export interface Offer {
  id: string;
  title: string;
  outreachHook: string;
  contentHook: string;
}

// Default fallback if the sheet has no active offers yet
const DEFAULT_OFFER: Offer = {
  id: "default",
  title: "Beta Case Study",
  outreachHook: "Looking for a couple of businesses to try it at no cost while I build my first case studies.",
  contentHook: "Currently onboarding founding beta members at no cost in exchange for a case study.",
};

async function getActiveOffers(): Promise<Offer[]> {
  await ensureSheetTab(SHEET, HEADERS);
  const rows = await readSheetAsObjects(SHEET).catch(() => []);
  return rows
    .filter((r) => r["active"]?.toUpperCase() === "TRUE")
    .map((r) => ({
      id: r["offer_id"] ?? "",
      title: r["title"] ?? "",
      outreachHook: r["outreach_hook"] ?? DEFAULT_OFFER.outreachHook,
      contentHook: r["content_hook"] ?? DEFAULT_OFFER.contentHook,
    }));
}

// Returns the next offer in rotation and advances the counter.
// Call this once per outreach run (not once per lead) to keep the rotation
// meaningful for comparison — same offer across all leads in a given day.
export async function getCurrentOffer(): Promise<Offer> {
  const offers = await getActiveOffers();
  if (offers.length === 0) return DEFAULT_OFFER;
  if (offers.length === 1) return offers[0]!;

  const counterStr = await getSetting("offer_rotation_index").catch(() => "0");
  const current = parseInt(counterStr ?? "0", 10) || 0;
  const offer = offers[current % offers.length]!;

  // Advance for next run
  await setSetting("offer_rotation_index", String((current + 1) % offers.length));

  return offer;
}
