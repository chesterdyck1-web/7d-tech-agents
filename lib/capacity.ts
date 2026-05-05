// Demand-driven outreach capacity management.
// Calculates available email slots, marks stale leads, finds uncontacted leads.

import { readSheetAsObjects, updateFieldByRowId } from "@/lib/google-sheets";
import { log } from "@/lib/logger";

export const DAILY_EMAIL_MAX = 30;
const STALE_DAYS = 30;

// Master Leads column indices (0-based), matching MASTER_LEADS_HEADERS in sheet-writer.ts:
// 0:business_id  1:business_name  2:vertical  3:city  4:province  5:phone
// 6:email  7:website  8:google_place_id  9:date_added  10:last_outreach_date
// 11:outreach_count  12:status
const ML_STATUS_COL = 12;

export interface UncontactedLead {
  businessId: string;
  businessName: string;
  vertical: string;
  city: string;
  province: string;
  phone: string;
  email: string;
  website?: string;
  ownerName?: string;
}

// Available slots = DAILY_EMAIL_MAX minus pending approvals minus emails sent last 24h.
export async function getAvailableSlots(): Promise<number> {
  const queue = await readSheetAsObjects("Approval Queue").catch(() => []);
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const pending = queue.filter(r => r["status"] === "pending").length;
  const recentlySent = queue.filter(r =>
    r["status"] === "sent" &&
    r["actioned_at"] &&
    r["actioned_at"] >= yesterday
  ).length;

  return Math.max(0, DAILY_EMAIL_MAX - pending - recentlySent);
}

// Mark leads older than 30 days with status=new as stale. Returns count marked.
export async function markStaleLeads(): Promise<number> {
  const leads = await readSheetAsObjects("Master Leads").catch(() => []);
  const cutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000);

  let marked = 0;
  for (const lead of leads) {
    if (lead["status"] !== "new") continue;
    const dateAdded = lead["date_added"];
    if (!dateAdded) continue;
    const added = new Date(dateAdded);
    if (isNaN(added.getTime()) || added >= cutoff) continue;

    try {
      await updateFieldByRowId("Master Leads", 0, lead["business_id"] ?? "", ML_STATUS_COL, "stale");
      marked++;
    } catch {
      // Row not found — skip
    }
  }

  if (marked > 0) {
    await log({
      agent: "coordinator",
      action: "stale_leads_marked",
      status: "success",
      metadata: { count: marked } as unknown as Record<string, unknown>,
    });
  }

  return marked;
}

// Uncontacted leads from Master Leads — status=new, has email, not yet stale.
// Sorted oldest first so leads nearing the 30-day cutoff get priority.
export async function getUncontactedLeads(limit: number): Promise<UncontactedLead[]> {
  if (limit <= 0) return [];

  const leads = await readSheetAsObjects("Master Leads").catch(() => []);
  const staleCutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000);

  return leads
    .filter(r => {
      if (r["status"] !== "new") return false;
      if (!r["email"]) return false;
      const added = r["date_added"] ? new Date(r["date_added"]) : null;
      if (added && !isNaN(added.getTime()) && added < staleCutoff) return false;
      return true;
    })
    .sort((a, b) => {
      const aT = a["date_added"] ? new Date(a["date_added"]).getTime() : 0;
      const bT = b["date_added"] ? new Date(b["date_added"]).getTime() : 0;
      return aT - bT;
    })
    .slice(0, limit)
    .map(r => ({
      businessId: r["business_id"] ?? "",
      businessName: r["business_name"] ?? "",
      vertical: r["vertical"] ?? "",
      city: r["city"] ?? "",
      province: r["province"] ?? "",
      phone: r["phone"] ?? "",
      email: r["email"] ?? "",
      website: r["website"] || undefined,
      ownerName: r["owner_name"] || undefined,
    }));
}

// Update a lead's status in Master Leads after outreach queues it.
export async function updateLeadStatus(
  businessId: string,
  status: "new" | "queued" | "contacted" | "stale"
): Promise<void> {
  await updateFieldByRowId("Master Leads", 0, businessId, ML_STATUS_COL, status).catch(() => null);
}
