// Content Agent (Clive) — turns long-form video into short clips and schedules them.
// Phase 1 (Chester sends Drive link): submits to OpusClip for clipping.
// Phase 2 (OpusClip webhook): drafts captions, sends Chester approval emails per clip.
// Phase 3 (Chester approves): posts clip to all connected Publer accounts.

import { createClipProject, driveUrlToDirectDownload } from "@/lib/opus-clip";
import { appendToSheet, updateFieldByRowId } from "@/lib/google-sheets";
import { claude } from "@/lib/claude";
import { generateApprovalToken, buildApprovalUrl } from "@/lib/approval-token";
import { sendEmail } from "@/lib/gmail";
import { sendToChester } from "@/lib/telegram";
import { log } from "@/lib/logger";
import { env } from "@/lib/env";
import { randomUUID } from "crypto";

// Called when Chester sends "new video - [drive link]" to Jason.
export async function submitVideoForClipping(driveUrl: string): Promise<void> {
  let directUrl: string;
  try {
    directUrl = driveUrlToDirectDownload(driveUrl);
  } catch {
    await sendToChester(
      `Could not read that Drive link. Make sure the file is shared as "Anyone with the link can view", then try again.`
    );
    return;
  }

  const contentId = randomUUID();
  const webhookUrl = `${env.NEXT_PUBLIC_APP_URL}/api/webhooks/opus-clip?secret=${env.CRON_SECRET}&contentId=${contentId}`;

  try {
    const projectId = await createClipProject(directUrl, webhookUrl);

    await appendToSheet("Content Queue", [
      contentId,
      projectId,
      driveUrl,
      "", // clip_url — filled per clip when OpusClip finishes
      "", // caption — filled when drafting
      "processing",
      "", // approval_id
      new Date().toISOString(),
      "", // posted_at
      "", // platforms
    ]);

    await log({
      agent: "content",
      action: "clip_project_submitted",
      entityId: contentId,
      status: "success",
      metadata: { projectId, driveUrl } as unknown as Record<string, unknown>,
    });

    await sendToChester(
      `Got it. Submitted to OpusClip — I will message you when the clips are ready for approval. This usually takes 5–15 minutes.`,
      "none"
    );
  } catch (err) {
    await log({
      agent: "content",
      action: "clip_project_submit_failed",
      entityId: contentId,
      status: "failure",
      errorMessage: String(err),
    });
    await sendToChester(`Failed to submit video: ${String(err)}`);
  }
}

// Called by the OpusClip webhook when processing completes.
// Drafts a caption for each clip and sends Chester one approval email per clip.
export async function handleClipsReady(
  contentId: string,
  clips: Array<{ clipId: string; url: string; duration: number; title?: string }>
): Promise<void> {
  if (clips.length === 0) {
    await sendToChester(`OpusClip finished processing but found no clips. Try a longer or more talk-heavy video.`);
    return;
  }

  await sendToChester(
    `OpusClip finished — ${clips.length} clip${clips.length > 1 ? "s" : ""} ready. Drafting captions and sending for your approval now.`,
    "none"
  );

  for (const clip of clips) {
    const clipContentId = randomUUID();
    const approvalId = randomUUID();

    try {
      const captionRes = await claude({
        system: `You are a social media copywriter for 7D Tech, an AI automation agency helping Canadian service businesses.
Write a punchy, engaging caption for a short video clip.
Rules:
- Under 200 characters for the main caption
- Add 5–8 relevant hashtags on a new line
- Sound human, not like AI
- Focus on the business value or story angle
- No emojis unless they add real meaning`,
        userMessage: `Write a social media caption for this video clip.\nTitle: ${clip.title ?? "Business tip clip"}\nDuration: ${clip.duration}s`,
        maxTokens: 300,
        label: "content:draft-caption",
      });

      const caption = captionRes.text.trim();
      const token = await generateApprovalToken(approvalId, "content_post");
      const approvalUrl = buildApprovalUrl(token);
      const now = new Date().toISOString();

      // Store each clip as its own Content Queue row
      await appendToSheet("Content Queue", [
        clipContentId,
        "",            // opus_project_id (already on the parent row)
        "",            // video_source
        clip.url,      // clip_url
        caption,
        "pending_approval",
        approvalId,
        now,
        "",            // posted_at
        "",            // platforms
      ]);

      // Also write to Approval Queue so the approve route can handle it
      await appendToSheet("Approval Queue", [
        approvalId,
        "content_post",
        "",              // to_email (not used for content)
        `Clip ${clips.indexOf(clip) + 1} of ${clips.length}`,  // subject = clip label
        caption,         // body = caption
        clip.url,        // prospect_email field repurposed for clip URL
        clip.title ?? "Video clip",  // to_name = clip title
        "pending",
        "n/a",
        now,
        "",              // decided_at
        "FALSE",         // token_used
        clipContentId,   // entity_id
      ]);

      await sendEmail({
        to: "chesterdyck1@gmail.com",
        subject: `New clip ready for approval — ${clip.title ?? "Video clip"}`,
        bodyHtml: `
          <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;padding:2rem;color:#1a1a1a;">
            <p style="font-size:0.8rem;letter-spacing:0.12em;text-transform:uppercase;color:#888;margin-bottom:1.5rem;">7D Tech Content</p>

            <p>Clip ${clips.indexOf(clip) + 1} of ${clips.length} is ready.</p>

            <p style="margin:1rem 0;">
              <a href="${clip.url}" style="color:#1a1a1a;">Preview clip (${clip.duration}s)</a>
            </p>

            <p style="margin:1rem 0;">Drafted caption:</p>

            <div style="background:#f5f5f5;padding:1rem 1.25rem;border-radius:4px;margin:1rem 0;border-left:3px solid #ccc;">
              ${caption.replace(/\n/g, "<br>")}
            </div>

            <a href="${approvalUrl}" style="display:inline-block;background:#1a1a1a;color:#fff;padding:0.85rem 2rem;border-radius:5px;text-decoration:none;font-size:0.95rem;margin:1rem 0;">Post This Clip</a>

            <p style="margin-top:1.5rem;font-size:0.8rem;color:#aaa;">One tap to schedule to all connected platforms. Link expires in 24 hours.</p>
          </div>
        `,
      });

      await log({
        agent: "content",
        action: "clip_approval_sent",
        entityId: clipContentId,
        status: "success",
        metadata: { clipId: clip.clipId, approvalId } as unknown as Record<string, unknown>,
      });
    } catch (err) {
      await log({
        agent: "content",
        action: "clip_approval_failed",
        entityId: clipContentId,
        status: "failure",
        errorMessage: String(err),
      });
    }
  }
}

// Called by the approval route when Chester approves a content_post.
// Uploads the clip to Publer and schedules it to all connected accounts.
export async function postApprovedClip(
  clipUrl: string,
  caption: string,
  clipTitle: string,
  contentId: string
): Promise<void> {
  const { scheduleVideoToAllAccounts } = await import("@/lib/publer");

  await scheduleVideoToAllAccounts(clipUrl, clipTitle, caption);

  await updateFieldByRowId("Approval Queue", 0, contentId, 5, "posted");

  await log({
    agent: "content",
    action: "clip_posted",
    entityId: contentId,
    status: "success",
  });
}
