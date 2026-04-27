// OpusClip API helpers — submit videos for AI clipping and retrieve results.

import { env } from "@/lib/env";

const BASE = "https://api.opus.pro";

function headers() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${env.OPUS_CLIP_API_KEY}`,
  };
}

export interface Clip {
  clipId: string;
  url: string;         // direct download/stream URL for the clip
  duration: number;    // seconds
  score?: number;      // OpusClip virality score 0–100
  title?: string;
}

// Submit a video URL for clipping. OpusClip calls webhookUrl when done.
// Returns the projectId used to fetch clips later.
export async function createClipProject(
  videoUrl: string,
  webhookUrl: string
): Promise<string> {
  const res = await fetch(`${BASE}/api/clip-projects`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      videoUrl,
      conclusionActions: [{ type: "webhook", webhookUrl }],
    }),
  });

  if (!res.ok) {
    throw new Error(`OpusClip createClipProject error: ${await res.text()}`);
  }

  const data = (await res.json()) as { projectId?: string; id?: string };
  const projectId = data.projectId ?? data.id ?? "";
  if (!projectId) throw new Error("OpusClip returned no projectId");
  return projectId;
}

// Fetch all clips produced by a completed project.
export async function getClips(projectId: string): Promise<Clip[]> {
  const res = await fetch(
    `${BASE}/api/exportable-clips?q=findByProjectId&projectId=${encodeURIComponent(projectId)}`,
    { headers: headers() }
  );

  if (!res.ok) {
    throw new Error(`OpusClip getClips error: ${await res.text()}`);
  }

  const data = (await res.json()) as {
    clips?: Clip[];
    data?: Clip[];
  };
  return data.clips ?? data.data ?? [];
}

// Convert a Google Drive sharing URL to a direct download URL OpusClip can fetch.
// Requires the Drive file to be shared as "Anyone with the link can view".
export function driveUrlToDirectDownload(driveUrl: string): string {
  const match = driveUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (!match?.[1]) throw new Error(`Could not extract file ID from Drive URL: ${driveUrl}`);
  return `https://drive.google.com/uc?export=download&id=${match[1]}`;
}
