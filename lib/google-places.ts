// Google Places API (New) — searches for businesses by type and city.
// Used by the Prospecting Agent to find leads every morning.

import { env } from "@/lib/env";

const BASE = "https://places.googleapis.com/v1/places:searchText";

export interface PlaceResult {
  googlePlaceId: string;
  businessName: string;
  address: string;
  city: string;
  province: string;
  phone: string;
  website: string;
}

// Search for businesses matching a query in a specific city.
// Returns up to maxResults results.
export async function searchPlaces(
  query: string,
  city: string,
  province: string,
  maxResults = 20
): Promise<PlaceResult[]> {
  const res = await fetch(BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": env.GOOGLE_PLACES_API_KEY,
      "X-Goog-FieldMask": [
        "places.id",
        "places.displayName",
        "places.formattedAddress",
        "places.nationalPhoneNumber",
        "places.websiteUri",
      ].join(","),
    },
    body: JSON.stringify({
      textQuery: `${query} in ${city}, ${province}, Canada`,
      maxResultCount: maxResults,
      languageCode: "en",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google Places API error: ${err}`);
  }

  const data = (await res.json()) as {
    places?: {
      id: string;
      displayName?: { text: string };
      formattedAddress?: string;
      nationalPhoneNumber?: string;
      websiteUri?: string;
    }[];
  };

  return (data.places ?? []).map((p) => ({
    googlePlaceId: p.id,
    businessName: p.displayName?.text ?? "",
    address: p.formattedAddress ?? "",
    city,
    province,
    phone: p.nationalPhoneNumber ?? "",
    website: p.websiteUri ?? "",
  }));
}
