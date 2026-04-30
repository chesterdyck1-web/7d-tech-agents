// Mines Google Reviews for target verticals to surface complaint patterns.
// Low-rated reviews reveal the pain points that drive outreach copy.
// Rotates through one vertical per week so all are covered over time.

import { env } from "@/lib/env";
import { claude } from "@/lib/claude";
import { getPromptOverride } from "@/lib/prompts";
import { VERTICALS } from "@/config/verticals";

const PLACES_BASE = "https://places.googleapis.com/v1";

interface PlaceReview {
  rating: number;
  text?: { text: string };
}

async function searchPlacesForVertical(searchTerm: string): Promise<string[]> {
  const res = await fetch(`${PLACES_BASE}/places:searchText`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": env.GOOGLE_PLACES_API_KEY,
      "X-Goog-FieldMask": "places.id",
    },
    body: JSON.stringify({
      textQuery: `${searchTerm} in Canada`,
      maxResultCount: 5,
      languageCode: "en",
    }),
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) return [];

  const data = (await res.json()) as { places?: { id: string }[] };
  return (data.places ?? []).map((p) => p.id);
}

async function getReviewsForPlace(placeId: string): Promise<PlaceReview[]> {
  const res = await fetch(`${PLACES_BASE}/places/${placeId}`, {
    headers: {
      "X-Goog-Api-Key": env.GOOGLE_PLACES_API_KEY,
      "X-Goog-FieldMask": "reviews",
    },
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) return [];

  const data = (await res.json()) as { reviews?: PlaceReview[] };
  return data.reviews ?? [];
}

export async function mineReviews(): Promise<string> {
  // Rotate verticals weekly so all are covered over time
  const weekNumber = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
  const vertical = VERTICALS[weekNumber % VERTICALS.length]!;

  const placeIds = await searchPlacesForVertical(vertical.searchTerms[0]!);

  if (placeIds.length === 0) {
    return `No places found for vertical: ${vertical.name}`;
  }

  const complaints: string[] = [];

  for (const placeId of placeIds.slice(0, 3)) {
    try {
      const reviews = await getReviewsForPlace(placeId);
      const lowRated = reviews
        .filter((r) => r.rating <= 2 && r.text?.text)
        .map((r) => r.text!.text);
      complaints.push(...lowRated);
    } catch {
      // Skip this place if details fetch fails
    }
  }

  if (complaints.length === 0) {
    return `No 1–2 star reviews found for ${vertical.name} this week.`;
  }

  const REVIEWS_SYSTEM = "You analyze negative Google Reviews to find pain points for an AI automation agency's outreach team. Be specific and concise.";
  const analysis = await claude({
    system: (await getPromptOverride("intelligence", "reviews")) ?? REVIEWS_SYSTEM,
    userMessage: `These are 1–2 star reviews from ${vertical.name} businesses in Canada.
Identify the top 3 recurring complaints related to: slow response, missed leads, poor follow-up, or communication failures.
Write each as a specific pain point statement (e.g. "prospects fill out the contact form and never hear back for days").

Reviews:
${complaints.slice(0, 15).join("\n---\n")}`,
    maxTokens: 200,
    label: "intelligence:analyze-reviews",
  });

  return `*${vertical.name} vertical — ${complaints.length} complaint${complaints.length !== 1 ? "s" : ""} analyzed:*\n${analysis.text.trim()}`;
}
