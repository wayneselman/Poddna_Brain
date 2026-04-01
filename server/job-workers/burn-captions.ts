import { storage } from "../storage";
import { addTikTokCaptions, addTikTokCaptionsWithSegments, addAnimatedCaptions, type CaptionStyle, type CaptionOptions, type TimedTranscriptSegment } from "../services/caption-generator";
import { extractYouTubeClip } from "../services/clip-extractor";
import { objectStorageClient } from "../objectStorage";
import type { Job, EpisodeSource } from "@shared/schema";
import * as fs from "fs/promises";

export interface BurnCaptionsJobResult {
  viralMomentId: string;
  captionedPath: string;
  fileSize: number;
}

const SUBTITLE_STYLE: CaptionStyle = {
  wordsPerLine: 8,
  position: "bottom",
  fontSize: 46,
  highlightColor: "#FFFFFF",
};

const BOLD_STYLE: CaptionStyle = {
  wordsPerLine: 2,
  position: "center",
  fontSize: 68,
  highlightColor: "#F5C518",
};

async function ensureClipExists(moment: any): Promise<string> {
  if (moment.videoPath) {
    try {
      await fs.access(moment.videoPath);
      const stats = await fs.stat(moment.videoPath);
      if (stats.size > 1000) {
        console.log(`[BURN-CAPTIONS] Clip file verified: ${moment.videoPath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
        return moment.videoPath;
      }
    } catch {}
  }

  console.log(`[BURN-CAPTIONS] Clip file missing at ${moment.videoPath || 'N/A'}, re-extracting...`);

  const sources = await storage.getEpisodeSourcesByEpisode(moment.episodeId);
  const youtubeSource = sources.find((s: EpisodeSource) =>
    s.platform === "youtube" && s.sourceUrl
  );

  if (!youtubeSource?.sourceUrl) {
    throw new Error(`No YouTube source available for episode ${moment.episodeId} - cannot re-extract clip`);
  }

  const result = await extractYouTubeClip(
    youtubeSource.sourceUrl,
    moment.startTime,
    moment.endTime
  );

  await storage.updateViralMomentClipStatus(moment.id, "ready", result.clipPath, null);
  console.log(`[BURN-CAPTIONS] Re-extracted clip: ${result.clipPath} (${(result.fileSize / 1024 / 1024).toFixed(2)} MB)`);

  return result.clipPath;
}

async function uploadToObjectStorage(localPath: string, momentId: string): Promise<string | null> {
  try {
    const privateDir = process.env.PRIVATE_OBJECT_DIR;
    if (!privateDir) {
      console.warn(`[BURN-CAPTIONS] PRIVATE_OBJECT_DIR not set, skipping object storage upload`);
      return null;
    }

    const fileBuffer = await fs.readFile(localPath);
    const objectPath = `${privateDir}/clips/moment_${momentId}.mp4`;
    const parts = objectPath.startsWith("/") ? objectPath.slice(1).split("/") : objectPath.split("/");
    const bucketName = parts[0];
    const objectName = parts.slice(1).join("/");

    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectName);
    await file.save(fileBuffer, { contentType: "video/mp4" });

    const [signedUrl] = await file.getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });

    console.log(`[BURN-CAPTIONS] Uploaded to object storage: ${objectName} (${(fileBuffer.length / 1024 / 1024).toFixed(1)}MB)`);
    return signedUrl;
  } catch (err: any) {
    console.error(`[BURN-CAPTIONS] Object storage upload failed:`, err.message);
    return null;
  }
}

async function fetchTranscriptSegments(
  episodeId: string,
  startTime: number,
  endTime: number
): Promise<TimedTranscriptSegment[]> {
  try {
    const segments = await storage.getTranscriptSegmentsByTimeRange(episodeId, startTime, endTime);
    if (segments && segments.length > 0) {
      console.log(`[BURN-CAPTIONS] Found ${segments.length} transcript segments for time range ${startTime}-${endTime}`);
      return segments.map(s => ({
        text: s.text,
        startTime: s.startTime,
        endTime: s.endTime,
      }));
    }
  } catch (err: any) {
    console.warn(`[BURN-CAPTIONS] Failed to fetch transcript segments: ${err.message}`);
  }
  return [];
}

export async function handleBurnCaptionsJob(
  job: Job,
  onProgress?: (message: string, percentage: number) => void
): Promise<BurnCaptionsJobResult> {
  console.log(`[BURN-CAPTIONS] Starting caption burn job ${job.id}`);

  const payload = job.result as {
    viralMomentId?: string;
    style?: CaptionStyle;
    captionType?: string;
    hookText?: string | null;
    hookEnabled?: boolean;
    addWatermark?: boolean;
  } | null;

  if (!payload?.viralMomentId) {
    throw new Error(`Job ${job.id} missing viralMomentId in payload`);
  }

  const moment = await storage.getViralMoment(payload.viralMomentId);
  if (!moment) {
    throw new Error(`Viral moment not found: ${payload.viralMomentId}`);
  }

  onProgress?.("Verifying clip file...", 5);

  const videoPath = await ensureClipExists(moment);

  const captionType = payload.captionType || "karaoke";
  onProgress?.(`Starting ${captionType} caption burn`, 10);

  try {
    let style: CaptionStyle = { ...(payload.style || {}), forceRegenerate: true };
    if (captionType === "subtitle") {
      style = { ...SUBTITLE_STYLE, ...style };
    } else if (captionType === "bold") {
      style = { ...BOLD_STYLE, ...style };
    }

    const captionOptions: CaptionOptions = {
      hookText: payload.hookEnabled !== false ? (payload.hookText ?? (moment as any).suggestedTitle ?? (moment as any).title ?? null) : null,
      hookEnabled: payload.hookEnabled !== false,
      addWatermark: payload.addWatermark === true,
    };

    onProgress?.("Loading transcript segments...", 20);
    const segments = await fetchTranscriptSegments(moment.episodeId, moment.startTime, moment.endTime);

    let result;
    if (segments.length > 0) {
      console.log(`[BURN-CAPTIONS] Using ${segments.length} real transcript segments for synced captions`);
      onProgress?.("Burning synced captions...", 40);
      result = await addTikTokCaptionsWithSegments(
        videoPath,
        segments,
        moment.startTime,
        moment.endTime,
        style,
        captionOptions
      );
    } else {
      console.log(`[BURN-CAPTIONS] No transcript segments found, using even distribution fallback`);
      onProgress?.("Burning captions (fallback)...", 40);
      result = await addTikTokCaptions(
        videoPath,
        moment.text,
        moment.startTime,
        moment.endTime,
        style,
        captionOptions
      );
    }

    onProgress?.("Caption burn complete, uploading...", 80);

    const objectUrl = await uploadToObjectStorage(result.captionedPath, moment.id);

    const storedPath = objectUrl || result.captionedPath;
    await storage.updateViralMomentCaptionedPath(moment.id, storedPath);

    if (objectUrl) {
      console.log(`[BURN-CAPTIONS] Uploaded to object storage, URL stored`);
    }

    onProgress?.("Database updated", 100);
    console.log(`[BURN-CAPTIONS] Completed: ${storedPath}`);

    return {
      viralMomentId: moment.id,
      captionedPath: storedPath,
      fileSize: result.fileSize,
    };
  } catch (error: any) {
    console.error(`[BURN-CAPTIONS] Failed for moment ${moment.id}:`, error.message);
    throw error;
  }
}
