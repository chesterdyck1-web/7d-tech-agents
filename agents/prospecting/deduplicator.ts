// Checks whether a business already exists in Master Leads before adding it.
// business_id is SHA256(businessName + city + phone) — stable across runs.

import { createHash } from "crypto";
import { readSheet } from "@/lib/google-sheets";

export function generateBusinessId(
  businessName: string,
  city: string,
  phone: string
): string {
  return createHash("sha256")
    .update(`${businessName.toLowerCase()}${city.toLowerCase()}${phone}`)
    .digest("hex")
    .slice(0, 16); // 16 chars is plenty for dedup
}

// Returns a Set of all business_ids already in Master Leads.
export async function getExistingBusinessIds(): Promise<Set<string>> {
  const rows = await readSheet("Master Leads");
  const ids = new Set<string>();
  for (let i = 1; i < rows.length; i++) {
    const id = rows[i]?.[0];
    if (id) ids.add(id);
  }
  return ids;
}

export function isDuplicate(businessId: string, existing: Set<string>): boolean {
  return existing.has(businessId);
}
