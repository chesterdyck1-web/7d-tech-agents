// Quick diagnostic — prints recent Action Log entries, errors first.
import { google } from "googleapis";

const auth = new google.auth.OAuth2(
  process.env["GOOGLE_CLIENT_ID"]!,
  process.env["GOOGLE_CLIENT_SECRET"]!
);
auth.setCredentials({ refresh_token: process.env["GOOGLE_REFRESH_TOKEN"]! });
const sheets = google.sheets({ version: "v4", auth });

async function main() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env["GOOGLE_SHEETS_ID"]!,
    range: "Action Log",
  });

  const rows = res.data.values as string[][] ?? [];
  if (rows.length <= 1) { console.log("Action Log is empty."); return; }

  const [headers, ...data] = rows;
  const entries = data.map(row =>
    Object.fromEntries((headers ?? []).map((h, i) => [h, row[i] ?? ""]))
  );

  // Show failures first, then last 20 entries
  const failures = entries.filter(e => e["status"] === "failure");
  const recent = entries.slice(-20);

  if (failures.length > 0) {
    console.log(`\n=== FAILURES (${failures.length}) ===`);
    for (const f of failures) {
      console.log(`\n[${f["timestamp"]}] ${f["agent"]} — ${f["action"]}`);
      console.log(`  Error: ${f["error_message"]}`);
      if (f["metadata"]) console.log(`  Metadata: ${f["metadata"]}`);
    }
  }

  console.log(`\n=== RECENT ENTRIES (last ${recent.length}) ===`);
  for (const e of recent) {
    console.log(`[${e["timestamp"]}] ${e["agent"]} — ${e["action"]} — ${e["status"]}${e["error_message"] ? " — " + e["error_message"] : ""}`);
  }
}

main().catch(console.error);
