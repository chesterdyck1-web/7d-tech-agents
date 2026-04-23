// Writes new leads to both Master Leads and Daily Leads sheets.

import { appendToSheet } from "@/lib/google-sheets";

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

export async function writeToMasterLeads(lead: LeadRecord): Promise<void> {
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
