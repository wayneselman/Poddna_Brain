import { Router } from "express";
import crypto from "crypto";
import { db } from "../db";
import { zoomMeetings, zoomTranscripts, jobs } from "@shared/schema";
import { eq } from "drizzle-orm";
import { importSingleMeeting } from "../integrations/zoom/zoomImport";
import { convertZoomMeetingToEpisode } from "../integrations/zoom/zoomToEpisodeConverter";

const router = Router();

function verifyZoomSignature(
  rawBody: string,
  signature: string,
  timestamp: string
): boolean {
  const secretToken = process.env.ZOOM_WEBHOOK_SECRET_TOKEN;
  if (!secretToken) {
    console.error("[ZOOM-WEBHOOK] ZOOM_WEBHOOK_SECRET_TOKEN not configured");
    return false;
  }

  const message = `v0:${timestamp}:${rawBody}`;
  const hashForVerify = crypto
    .createHmac("sha256", secretToken)
    .update(message)
    .digest("hex");

  const expectedSig = `v0=${hashForVerify}`;
  return signature === expectedSig;
}

router.post("/", async (req, res) => {
  try {
    const event = req.body?.event;

    if (event === "endpoint.url_validation") {
      const plainToken = req.body.payload?.plainToken;
      const secretToken = process.env.ZOOM_WEBHOOK_SECRET_TOKEN;

      if (!plainToken || !secretToken) {
        console.error("[ZOOM-WEBHOOK] CRC challenge missing plainToken or secret");
        return res.status(400).json({ error: "Missing plainToken or secret" });
      }

      const hashForValidation = crypto
        .createHmac("sha256", secretToken)
        .update(plainToken)
        .digest("hex");

      console.log("[ZOOM-WEBHOOK] CRC challenge-response validated");
      return res.status(200).json({
        plainToken,
        encryptedToken: hashForValidation,
      });
    }

    const timestamp = req.headers["x-zm-request-timestamp"] as string;
    const signature = req.headers["x-zm-signature"] as string;

    if (timestamp && signature) {
      const rawBody = JSON.stringify(req.body);
      if (!verifyZoomSignature(rawBody, signature, timestamp)) {
        console.warn("[ZOOM-WEBHOOK] Invalid signature, rejecting");
        return res.status(401).json({ error: "Invalid signature" });
      }
    }

    if (event === "recording.completed" || event === "recording.transcript_completed") {
      const payload = req.body.payload?.object;

      if (!payload) {
        console.warn(`[ZOOM-WEBHOOK] ${event} event with no payload object`);
        return res.status(200).json({ received: true });
      }

      const meetingId = String(payload.id || payload.uuid);
      const topic = payload.topic || "Unknown Meeting";
      const hostEmail = payload.host_email || "unknown";

      console.log(`[ZOOM-WEBHOOK] ${event}: meeting=${meetingId} topic="${topic}" host=${hostEmail}`);

      const existing = await db.query.zoomMeetings.findFirst({
        where: eq(zoomMeetings.zoomMeetingId, meetingId),
      });

      if (existing && event === "recording.completed") {
        console.log(`[ZOOM-WEBHOOK] Meeting ${meetingId} already exists, skipping recording.completed`);
        return res.status(200).json({ received: true, status: "already_exists" });
      }

      processZoomRecording(meetingId, event).catch((err) => {
        console.error(`[ZOOM-WEBHOOK] Background processing error for ${meetingId}:`, err);
      });

      return res.status(200).json({ received: true, status: "processing" });
    }

    console.log(`[ZOOM-WEBHOOK] Unhandled event: ${event}`);
    return res.status(200).json({ received: true });
  } catch (error: any) {
    console.error("[ZOOM-WEBHOOK] Error handling webhook:", error);
    return res.status(200).json({ received: true, error: error.message });
  }
});

async function processZoomRecording(meetingId: string, event: string): Promise<void> {
  try {
    console.log(`[ZOOM-WEBHOOK] Starting import for meeting ${meetingId} (event: ${event})`);

    const importResult = await importSingleMeeting(meetingId, false);

    if (!importResult.success) {
      console.error(`[ZOOM-WEBHOOK] Import failed for ${meetingId}:`, importResult.error);
      return;
    }

    console.log(`[ZOOM-WEBHOOK] Import complete for ${meetingId}: transcript=${importResult.transcriptFound}, downloaded=${importResult.transcriptDownloaded}`);

    if (!importResult.transcriptDownloaded) {
      if (event === "recording.completed") {
        console.log(`[ZOOM-WEBHOOK] No transcript yet for ${meetingId}, will process when recording.transcript_completed arrives`);
      } else {
        console.warn(`[ZOOM-WEBHOOK] No transcript available for ${meetingId} even on transcript_completed event`);
      }
      return;
    }

    let episodeId: string | null = null;
    try {
      const convResult = await convertZoomMeetingToEpisode(meetingId);
      episodeId = convResult.episodeId;
      console.log(`[ZOOM-WEBHOOK] Converted to episode ${episodeId} (new=${convResult.isNew})`);
    } catch (convErr: any) {
      console.error(`[ZOOM-WEBHOOK] Episode conversion error for ${meetingId}:`, convErr.message);
      return;
    }

    if (episodeId) {
      const [job] = await db
        .insert(jobs)
        .values({
          type: "analyze_zoom_call",
          status: "pending",
          result: { episodeId },
        })
        .returning({ id: jobs.id });
      console.log(`[ZOOM-WEBHOOK] Queued analyze_zoom_call job ${job.id} for episode ${episodeId}`);
    }
  } catch (err: any) {
    console.error(`[ZOOM-WEBHOOK] processZoomRecording failed for ${meetingId}:`, err.message);
  }
}

export default router;
