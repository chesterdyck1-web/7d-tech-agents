// Writes new leads to both Master Leads and Daily Leads sheets.

import { appendToSheet, ensureSheetTab } from "@/lib/google-sheets";

export interface LeadRecord {
  businessId: string;
  businessName: string;
  vertical: string;
  city: string;
  province: string;
  phone: string;
  email: string;
  website: string;
  googlePlaceId: string;
}

const MASTER_LEADS_HEADERS = [
  "business_id", "business_name", "vertical", "city", "province",
  "phone", "email", "website", "google_place_id",
  "date_added", "last_outreach_date", "outreach_count", "status",
];

const DAILY_LEADS_HEADERS = [
  "date", "business_id", "business_name", "vertical", "city",
  "phone", "email", "website", "approval_id",
];

export async function writeToMasterLeads(lead: LeadRecord): Promise<void> {
  await ensureSheetTab("Master Leads", MASTER_LEADS_HEADERS);
  const today = new Date().toISOString().slice(0, 10);
  await appendToSheet("Master Leads", [
    lead.businessId,
    lead.businessName,
    lead.vertical,
    lead.city,
    lead.province,
    lead.phone,
    lead.email,
    lead.website,
    lead.googlePlaceId,
    today,
    "",   // last_outreach_date
    0,    // outreach_count
    "new",
  ]);
}

export async function writeToDailyLeads(lead: LeadRecord): Promise<void> {
  await ensureSheetTab("Daily Leads", DAILY_LEADS_HEADERS);
  const today = new Date().toISOString().slice(0, 10);
  await appendToSheet("Daily Leads", [
    today,
    lead.businessId,
    lead.businessName,
    lead.vertical,
    lead.city,
    lead.phone,
    lead.email,
    lead.website,
    "", // approval_id — filled in by Outreach Agent
  ]);
}
