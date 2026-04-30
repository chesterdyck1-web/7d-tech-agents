// Dashboard approval endpoint — lets Chester approve/reject outreach emails directly
// from the /dashboard page without needing the email link.
// Authenticated by CRON_SECRET (Chester is already logged in to the dashboard).
// POST { approvalId, decision: "approve"|"reject", secret }

import { NextRequest, NextResponse } from "next/server";
import { readSheetAsObjects, updateFieldByRowId } from "@/lib/google-sheets";
import { sendEmail } from "@/lib/gmail";
import { log } from "@/lib/logger";
import { env } from "@/lib/env";

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    approvalId: string;
    decision: "approve" | "reject";
    secret: string;
  };

  if (body.secret !== env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { approvalId, decision } = body;
  if (!approvalId || !decision) {
    return NextResponse.json({ error: "Missing approvalId or decision" }, { status: 400 });
  }

  const rows = await readSheetAsObjects("Approval Queue");
  const row = rows.find((r) => r["approval_id"] === approvalId);

  if (!row) {
    return NextResponse.json({ error: "Approval not found" }, { status: 404 });
  }
  if (row["status"] !== "pending") {
    return NextResponse.json({ error: `Already ${row["status"]}` }, { status: 410 });
  }

  const now = new Date().toISOString();

  if (decision === "approve") {
    await updateFieldByRowId("Approval Queue", 0, approvalId, 7, "approved");
    await updateFieldByRowId("Approval Queue", 0, approvalId, 10, now);
    await updateFieldByRowId("Approval Queue", 0, approvalId, 11, "TRUE");

    if (row["type"] === "outreach_email") {
      await sendEmail({
        to: row["to_email"] ?? "",
        from: "chester@7dtech.ca",
        subject: row["subject"] ?? "",
        bodyHtml: (row["body"] ?? "").replace(/\n/g, "<br>"),
      });
    }

    await log({
      agent: "coordinator",
      action: "dashboard_approval_approved",
      entityId: approvalId,
      status: "success",
      metadata: { type: row["type"], toEmail: row["to_email"] } as unknown as Record<string, unknown>,
    });
  } else {
    await updateFieldByRowId("Approval Queue", 0, approvalId, 7, "rejected");
    await updateFieldByRowId("Approval Queue", 0, approvalId, 10, now);
    await updateFieldByRowId("Approval Queue", 0, approvalId, 11, "TRUE");

    await log({
      agent: "coordinator",
      action: "dashboard_approval_rejected",
      entityId: approvalId,
      status: "success",
      metadata: { type: row["type"] } as unknown as Record<string, unknown>,
    });
  }

  return NextResponse.json({ result: decision === "approve" ? "approved" : "rejected" });
}
