import { storage } from "../storage";
import { optimizeForSocial } from "../services/caption-generator";
import type { Job } from "@shared/schema";

export interface OptimizeClipJobResult {
  viralMomentId: string;
  optimizedPath: string;
  platform: string;
  fileSize: number;
}

export async function handleOptimizeClipJob(
  job: Job,
  onProgress?: (message: string, percentage: number) => void
): Promise<OptimizeClipJobResult> {
  console.log(`[OPTIMIZE-CLIP] Starting optimize job ${job.id}`);

  const payload = job.result as { viralMomentId?: string; platform?: "tiktok" | "instagram" | "youtube" } | null;

  if (!payload?.viralMomentId) {
    throw new Error(`Job ${job.id} missing viralMomentId in payload`);
  }

  const moment = await storage.getViralMoment(payload.viralMomentId);
  if (!moment) {
    throw new Error(`Viral moment not found: ${payload.viralMomentId}`);
  }

  const inputPath = moment.captionedPath || moment.videoPath;
  if (!inputPath) {
    throw new Error(`Viral moment ${moment.id} has no video to optimize`);
  }

  const platform = payload.platform || "tiktok";
  onProgress?.("Starting platform optimization", 10);

  try {
    const result = await optimizeForSocial(inputPath, platform);

    onProgress?.("Updating database", 90);

    await storage.updateViralMomentOptimizedPath(moment.id, result.captionedPath, platform);
    await storage.updateViralMomentPosting(moment.id, { postingStatus: "ready" });

    onProgress?.("Optimization complete", 100);
    console.log(`[OPTIMIZE-CLIP] Completed: ${result.captionedPath}`);

    return {
      viralMomentId: moment.id,
      optimizedPath: result.captionedPath,
      platform,
      fileSize: result.fileSize,
    };
  } catch (error: any) {
    console.error(`[OPTIMIZE-CLIP] Failed for moment ${moment.id}:`, error.message);
    throw error;
  }
}
