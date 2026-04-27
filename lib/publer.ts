// Publer API helpers — upload video media and schedule posts to all connected accounts.

import { env } from "@/lib/env";

const BASE = "https://app.publer.com/api/v1";

function headers() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer-API ${env.PUBLER_API_KEY}`,
    "Publer-Workspace-Id": env.PUBLER_WORKSPACE_ID,
  };
}

export interface SocialAccount {
  id: string;
  name: string;
  network: string; // "instagram" | "facebook" | "tiktok" | "linkedin" | etc.
}

// Poll Publer's job status endpoint until completed or failed.
async function pollJob(
  jobId: string,
  maxAttempts = 20
): Promise<Record<string, unknown>> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const res = await fetch(`${BASE}/job_status/${jobId}`, {
      headers: headers(),
    });
    if (!res.ok) throw new Error(`Publer job_status error: ${await res.text()}`);
    const data = (await res.json()) as {
      status: string;
      payload?: Record<string, unknown>;
    };
    if (data.status === "completed") return data.payload ?? {};
    if (data.status === "failed")
      throw new Error(`Publer job failed: ${JSON.stringify(data.payload)}`);
  }
  throw new Error("Publer job timed out");
}

// Upload a video from a public URL to Publer's media library.
// Returns the Publer media ID needed to attach it to a post.
export async function uploadMediaFromUrl(
  url: string,
  name: string
): Promise<string> {
  const res = await fetch(`${BASE}/media/from-url`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      media: [{ url, name }],
      type: "single",
      direct_upload: false,
      in_library: false,
    }),
  });
  if (!res.ok)
    throw new Error(`Publer uploadMedia error: ${await res.text()}`);

  const { job_id } = (await res.json()) as { job_id: string };
  const payload = await pollJob(job_id);

  // Publer returns the media ID in the payload — field name varies by version
  const mediaId = (payload["id"] ?? payload["media_id"] ?? "") as string;
  if (!mediaId)
    throw new Error(
      `Publer uploadMedia: no media ID in payload — ${JSON.stringify(payload)}`
    );
  return mediaId;
}

// Return all connected social accounts for this workspace.
export async function listAccounts(): Promise<SocialAccount[]> {
  const res = await fetch(`${BASE}/social_accounts`, { headers: headers() });
  if (!res.ok)
    throw new Error(`Publer listAccounts error: ${await res.text()}`);
  const data = (await res.json()) as {
    accounts?: SocialAccount[];
    data?: SocialAccount[];
  };
  return data.accounts ?? data.data ?? [];
}

// Upload a clip and auto-schedule it to every connected Publer account.
export async function scheduleVideoToAllAccounts(
  clipUrl: string,
  clipTitle: string,
  caption: string
): Promise<void> {
  const [mediaId, accounts] = await Promise.all([
    uploadMediaFromUrl(clipUrl, clipTitle),
    listAccounts(),
  ]);

  if (accounts.length === 0)
    throw new Error(
      "No Publer social accounts connected — connect accounts in the Publer dashboard first."
    );

  // One post object per account so each uses the correct network key
  const posts = accounts.map((account) => ({
    networks: {
      [account.network]: {
        type: "video",
        text: caption,
        media: [{ id: mediaId, type: "video" }],
      },
    },
    accounts: [{ id: account.id }],
  }));

  const res = await fetch(`${BASE}/posts/schedule`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ bulk: { state: "auto_schedule", posts } }),
  });

  if (!res.ok)
    throw new Error(`Publer schedulePost error: ${await res.text()}`);
}
