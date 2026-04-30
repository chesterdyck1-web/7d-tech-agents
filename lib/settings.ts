// Key-value settings stored in the "Settings" Google Sheet.
// Columns: key | value | updated_at
// Used for runtime toggles like autonomous_outreach mode.

import { readSheetAsObjects, appendToSheet, updateFieldByRowId } from "@/lib/google-sheets";

export async function getSetting(key: string): Promise<string | null> {
  const rows = await readSheetAsObjects("Settings").catch(() => []);
  const row = rows.find((r) => r["key"] === key);
  return row?.["value"] ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const rows = await readSheetAsObjects("Settings").catch(() => []);
  const exists = rows.some((r) => r["key"] === key);
  const now = new Date().toISOString();

  if (exists) {
    // Update existing row — value is column index 1
    await updateFieldByRowId("Settings", 0, key, 1, value);
    await updateFieldByRowId("Settings", 0, key, 2, now);
  } else {
    await appendToSheet("Settings", [key, value, now]);
  }
}
