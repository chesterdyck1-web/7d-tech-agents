import { SignJWT, jwtVerify } from "jose";
import { env } from "@/lib/env";

// Chester's outreach approvals last 24h. Client First Response Rx approvals last 1h.
type ApprovalType = "chester_outreach" | "client_response" | "builder_deploy" | "content_post";

export interface ApprovalTokenPayload {
  approvalId: string;
  type: ApprovalType;
  // iat and exp are added automatically by SignJWT
}

function getSecret(): Uint8Array {
  return new TextEncoder().encode(env.APPROVAL_SECRET);
}

function expiryForType(type: ApprovalType): string {
  if (type === "client_response") return "1h";
  return "24h";
}

export async function generateApprovalToken(
  approvalId: string,
  type: ApprovalType
): Promise<string> {
  return new SignJWT({ approvalId, type })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiryForType(type))
    .sign(getSecret());
}

export async function verifyApprovalToken(
  token: string
): Promise<ApprovalTokenPayload> {
  const { payload } = await jwtVerify(token, getSecret(), {
    algorithms: ["HS256"],
  });

  if (
    typeof payload["approvalId"] !== "string" ||
    typeof payload["type"] !== "string"
  ) {
    throw new Error("Invalid token payload structure");
  }

  return {
    approvalId: payload["approvalId"],
    type: payload["type"] as ApprovalType,
  };
}

export function buildApprovalUrl(token: string): string {
  return `${env.NEXT_PUBLIC_APP_URL}/approve?token=${encodeURIComponent(token)}`;
}
