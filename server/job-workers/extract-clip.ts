import { storage } from "../storage";
import { extractYouTubeClip, ClipExtractionOptions } from "../services/clip-extractor";
import type { Job, EpisodeSource } from "@shared/schema";
import * as fs from "fs/promises";

export interface ClipExtractionJobResult {
  momentId: string;
  clipPath: string | null;
  duration: number;
  fileSize: number;
  success: boolean;
  error?: string;
}

function resolveExtractionOptions(): ClipExtractionOptions {
  const options: ClipExtractionOptions = {};
  return options;
}

export async function handleExtractClipJob(
  job: Job,
  onProgress?: (message: string, percentage: number) => void
): Promise<ClipExtractionJobResult> {
  console.log(`[EXTRACT-CLIP] Starting clip extraction job ${job.id}`);

  const payload = job.result as { viralMomentId?: string; adjustedStart?: number; adjustedEnd?: number; userId?: string; captionType?: string; hookText?: string | null; hookEnabled?: boolean; addWatermark?: boolean } | null;
  
  if (!payload?.viralMomentId) {
    throw new Error(`Job ${job.id} missing viralMomentId in payload`);
  }

  const moment = await storage.getViralMoment(payload.viralMomentId);
  if (!moment) {
    throw new Error(`Viral moment not found: ${payload.viralMomentId}`);
  }

  const effectiveStart = payload.adjustedStart ?? moment.startTime;
  const effectiveEnd = payload.adjustedEnd ?? moment.endTime;

  onProgress?.("Finding YouTube source...", 10);

  const sources = await storage.getEpisodeSourcesByEpisode(moment.episodeId);
  const youtubeSource = sources.find((s: EpisodeSource) => 
    s.platform === "youtube" && s.sourceUrl
  );

  if (!youtubeSource?.sourceUrl) {
    const errorMsg = "No YouTube source available for this episode";
    await storage.updateViralMomentClipStatus(moment.id, "failed", null, errorMsg);
    return {
      momentId: moment.id,
      clipPath: null,
      duration: 0,
      fileSize: 0,
      success: false,
      error: errorMsg,
    };
  }

  onProgress?.("Preparing download...", 20);
  const extractionOptions = resolveExtractionOptions();

  onProgress?.("Extracting video clip...", 30);

  await storage.updateViralMomentClipStatus(moment.id, "extracting");

  try {
    const result = await extractYouTubeClip(
      youtubeSource.sourceUrl,
      effectiveStart,
      effectiveEnd,
      undefined,
      extractionOptions
    );

    onProgress?.("Verifying extracted file...", 85);

    try {
      const stat = await fs.stat(result.clipPath);
      if (stat.size < 1000) {
        throw new Error(`Extracted file too small (${stat.size} bytes): ${result.clipPath}`);
      }
      console.log(`[EXTRACT-CLIP] File verified: ${result.clipPath} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);
    } catch (verifyErr: any) {
      const errorMsg = `File verification failed: ${verifyErr.message}`;
      await storage.updateViralMomentClipStatus(moment.id, "failed", null, errorMsg);
      return { momentId: moment.id, clipPath: null, duration: 0, fileSize: 0, success: false, error: errorMsg };
    }

    onProgress?.("Saving clip metadata...", 90);
    await storage.updateViralMomentClipStatus(moment.id, "ready", result.clipPath, null);

    const captionType = payload.captionType || "karaoke";
    console.log(`[EXTRACT-CLIP] Auto-chaining burn_captions job (${captionType}) for moment ${moment.id}`);
    try {
      await storage.createJob({
        type: "burn_captions",
        episodeSourceId: youtubeSource?.id || null,
        pipelineStage: "INTEL",
        result: {
          viralMomentId: moment.id,
          captionType,
          hookText: payload.hookText,
          hookEnabled: payload.hookEnabled,
          addWatermark: payload.addWatermark,
        },
      });
    } catch (chainErr: any) {
      console.error(`[EXTRACT-CLIP] Failed to chain burn_captions:`, chainErr.message);
    }

    onProgress?.("Complete!", 100);
    console.log(`[EXTRACT-CLIP] Successfully extracted clip for moment ${moment.id}`);

    return {
      momentId: moment.id,
      clipPath: result.clipPath,
      duration: result.duration,
      fileSize: result.fileSize,
      success: true,
    };
  } catch (error: any) {
    const errorMsg = error.message || "Unknown extraction error";
    await storage.updateViralMomentClipStatus(moment.id, "failed", null, errorMsg);

    console.error(`[EXTRACT-CLIP] Failed to extract clip for moment ${moment.id}:`, errorMsg);

    return {
      momentId: moment.id,
      clipPath: null,
      duration: 0,
      fileSize: 0,
      success: false,
      error: errorMsg,
    };
  }
}
