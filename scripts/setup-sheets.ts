// One-time script: writes all 10 sheet headers to the Google Sheets database.
// Run: npx tsx --env-file=.env.local scripts/setup-sheets.ts
// Safe to re-run — it checks if headers already exist before writing.

import { google } from "googleapis";

const CLIENT_ID = process.env["GOOGLE_CLIENT_ID"]!;
const CLIENT_SECRET = process.env["GOOGLE_CLIENT_SECRET"]!;
const REFRESH_TOKEN = process.env["GOOGLE_REFRESH_TOKEN"]!;
const SHEETS_ID = process.env["GOOGLE_SHEETS_ID"]!;

const auth = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
auth.setCredentials({ refresh_token: REFRESH_TOKEN });
const sheets = google.sheets({ version: "v4", auth });

const SHEET_HEADERS: Record<string, string[]> = {
  "Master Leads": [
    "business_id", "business_name", "vertical", "city", "province",
    "phone", "email", "website", "google_place_id",
    "first_seen_date", "last_outreach_date", "outreach_count", "status",
  ],
  "Daily Leads": [
    "date", "business_id", "business_name", "vertical", "city",
    "phone", "email", "website", "approval_id",
  ],
  "Approval Queue": [
    "approval_id", "type", "approver", "subject", "body",
    "to_email", "to_name", "status", "qa_status",
    "created_at", "actioned_at", "token_used", "business_id",
  ],
  "Clients": [
    "client_id", "business_name", "owner_name", "owner_email", "owner_phone",
    "vertical", "city", "status", "signed_date",
    "stripe_payment_link", "stripe_payment_status", "stripe_payment_date",
    "make_scenario_id", "webhook_url", "claude_prompt_version",
    "monthly_revenue", "first_response_approval_rate", "notes",
  ],
  "Action Log": [
    "log_id", "timestamp", "agent", "action", "entity_id",
    "status", "metadata", "error_message",
  ],
  "Follow-up Queue": [
    "business_id", "email_sent_at", "follow_up_due_at", "status",
  ],
  "Content Queue": [
    "content_id", "drive_file_id", "drive_file_name", "opus_job_id",
    "clips_count", "platforms", "publer_post_ids", "status",
    "scheduled_at", "published_at", "engagement_score",
  ],
  "Intelligence Briefs": [
    "brief_id", "week_of", "competitor_findings",
    "review_insights", "recommendations", "coordinator_rating",
  ],
  "Performance Metrics": [
    "metric_id", "week_of", "agent", "metric_name",
    "metric_value", "benchmark", "status", "flagged", "notes",
  ],
  "Audits": [
    "audit_id", "business_name", "website", "requested_by", "requested_at",
    "phase1_completed_at", "phase1_brief_sent",
    "phase2_completed_at", "pdf_url", "pdf_sent_at",
    "touchpoint_scores", "top_3_gaps", "estimated_revenue_at_risk",
    "recommended_first_product", "outcome",
  ],
};

async function setup() {
  console.log("Setting up Google Sheets headers...\n");
  let ok = 0;
  let skipped = 0;

  for (const [sheetName, headers] of Object.entries(SHEET_HEADERS)) {
    try {
      const existing = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEETS_ID,
        range: `${sheetName}!A1:Z1`,
      });

      if (existing.data.values && existing.data.values.length > 0) {
        console.log(`  ⏭  ${sheetName} — headers already set, skipping`);
        skipped++;
        continue;
      }

      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEETS_ID,
        range: `${sheetName}!A1`,
        valueInputOption: "RAW",
        requestBody: { values: [headers] },
      });

      console.log(`  ✓  ${sheetName} — ${headers.length} columns written`);
      ok++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ✗  ${sheetName} — ERROR: ${msg}`);
      console.error(`     → Make sure a tab named exactly "${sheetName}" exists in the spreadsheet`);
    }
  }

  console.log(`\nDone. ${ok} sheets configured, ${skipped} skipped.`);
}

setup().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
