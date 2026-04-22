// Approval API — handles both rendering the approval page and processing decisions.
// GET  /api/approve?token=JWT  → validates token, returns approval data for the UI
// POST /api/approve             → processes approve or reject decision

import { NextRequest, NextResponse } from "next/server";
import { verifyApprovalToken } from "@/lib/approval-token";
import {
  readSheetAsObjects,
  updateFieldByRowId,
} from "@/lib/google-sheets";
import { sendEmail } from "@/lib/gmail";
import { log } from "@/lib/logger";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  let payload;
  try {
    payload = await verifyApprovalToken(token);
  } catch {
    return NextResponse.json(
      { error: "This link has expired or is invalid." },
      { status: 401 }
    );
  }

  const rows = await readSheetAsObjects("Approval Queue");
  const row = rows.find((r) => r["approval_id"] === payload.approvalId);

  if (!row) {
    return NextResponse.json({ error: "Approval not found." }, { status: 404 });
  }

  if (row["token_used"] === "TRUE" || row["token_used"] === "true") {
    return NextResponse.json(
      { error: "This link has already been used." },
      { status: 410 }
    );
  }

  if (row["status"] !== "pending") {
    return NextResponse.json(
      { error: `This item was already ${row["status"]}.` },
      { status: 410 }
    );
  }

  return NextResponse.json({
    approvalId: payload.approvalId,
    type: row["type"],
    subject: row["subject"],
    body: row["body"],
    toEmail: row["to_email"],
    toName: row["to_name"],
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    token: string;
    decision: "approve" | "reject";
  };

  const { token, decision } = body;
  if (!token || !decision) {
    return NextResponse.json({ error: "Missing token or decision" }, { status: 400 });
  }

  let payload;
  try {
    payload = await verifyApprovalToken(token);
  } catch {
    return NextResponse.json({ error: "Invalid or expired token." }, { status: 401 });
  }

  const rows = await readSheetAsObjects("Approval Queue");
  const rowIndex = rows.findIndex((r) => r["approval_id"] === payload.approvalId);
  const row = rows[rowIndex];

  if (!row) {
    return NextResponse.json({ error: "Approval not found." }, { status: 404 });
  }

  if (row["token_used"] === "TRUE" || row["token_used"] === "true") {
    return NextResponse.json({ error: "Already used." }, { status: 410 });
  }

  if (row["status"] !== "pending") {
    return NextResponse.json({ error: `Already ${row["status"]}.` }, { status: 410 });
  }

  // Mark token as used immediately to prevent double-use
  await updateFieldByRowId("Approval Queue", 0, payload.approvalId, 11, "TRUE");

  const now = new Date().toISOString();

  if (decision === "approve") {
    // Send the email
    await sendEmail({
      to: row["to_email"] ?? "",
      subject: row["subject"] ?? "",
      bodyHtml: (row["body"] ?? "").replace(/\n/g, "<br>"),
    });

    await updateFieldByRowId("Approval Queue", 0, payload.approvalId, 7, "approved");
    await updateFieldByRowId("Approval Queue", 0, payload.approvalId, 10, now);

    await log({
      agent: "coordinator",
      action: "approval_approved",
      entityId: payload.approvalId,
      status: "success",
      metadata: { type: row["type"], toEmail: row["to_email"] },
    });

    return NextResponse.json({ result: "approved" });
  } else {
    await updateFieldByRowId("Approval Queue", 0, payload.approvalId, 7, "rejected");
    await updateFieldByRowId("Approval Queue", 0, payload.approvalId, 10, now);

    await log({
      agent: "coordinator",
      action: "approval_rejected",
      entityId: payload.approvalId,
      status: "success",
      metadata: { type: row["type"] },
    });

    return NextResponse.json({ result: "rejected" });
  }
}
