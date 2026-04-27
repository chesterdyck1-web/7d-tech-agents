// OpusClip webhook — fires when a clip project finishes processing.
// Fetches the resulting clips, then hands off to the Content Agent to draft captions.

import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { getClips } from "@/lib/opus-clip";
import { handleClipsReady } from "@/agents/content/index";
import { log } from "@/lib/logger";
import { env } from "@/lib/env";

interface OpusClipWebhookBody {
  projectId?: string;
  status?: string;
  [key: string]: unknown;
}

export async function POST(req: NextRequest) {
  // Validate secret passed in query string when we registered the webhook URL
  const secret = req.nextUrl.searchParams.get("secret");
  if (secret !== env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contentId = req.nextUrl.searchParams.get("contentId") ?? "";

  let body: OpusClipWebhookBody;
  try {
    body = (await req.json()) as OpusClipWebhookBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const projectId = body.projectId ?? "";
  if (!projectId) {
    await log({
      agent: "content",
      action: "opus_clip_webhook_no_project_id",
      status: "failure",
      errorMessage: "Webhook body missing projectId",
    });
    return NextResponse.json({ ok: true }); // ack to prevent OpusClip retries
  }

  waitUntil(
    (async () => {
      try {
        const clips = await getClips(projectId);
        await handleClipsReady(contentId, clips);
      } catch (err) {
        await log({
          agent: "content",
          action: "opus_clip_webhook_error",
          entityId: contentId,
          status: "failure",
          errorMessage: String(err),
        });
      }
    })()
  );

  return NextResponse.json({ ok: true });
}
