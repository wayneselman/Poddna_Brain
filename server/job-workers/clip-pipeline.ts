import { storage } from "../storage";
import type { Job } from "@shared/schema";

export interface ClipPipelineJobResult {
  episodeId: string;
  runId: string;
  momentsDetected: number;
  clipsExtracted: number;
  clipsCaptioned: number;
  clipsOptimized: number;
}

export async function handleClipPipelineJob(
  job: Job,
  onProgress?: (message: string, percentage: number) => void
): Promise<ClipPipelineJobResult> {
  console.log(`[CLIP-PIPELINE] Starting pipeline job ${job.id}`);

  const payload = job.result as {
    episodeId?: string;
    maxClips?: number;
    platform?: "tiktok" | "instagram" | "youtube";
    skipOptimize?: boolean;
  } | null;

  if (!payload?.episodeId) {
    throw new Error(`Job ${job.id} missing episodeId in payload`);
  }

  const episode = await storage.getEpisode(payload.episodeId);
  if (!episode) {
    throw new Error(`Episode not found: ${payload.episodeId}`);
  }

  const maxClips = payload.maxClips || 10;
  const platform = payload.platform || "tiktok";

  const run = await storage.createClipGenerationRun({
    runDate: new Date(),
    status: "running",
    episodesProcessed: 1,
  });

  onProgress?.("Checking for viral moments", 10);

  try {
    const moments = await storage.getViralMomentsByEpisode(payload.episodeId);

    if (moments.length === 0) {
      console.log(`[CLIP-PIPELINE] No viral moments for episode ${payload.episodeId} - queue detect job`);

      await storage.createJob({
        type: "detect_viral_moments",
        episodeSourceId: job.episodeSourceId,
        pipelineStage: "INTEL",
        result: { episodeId: payload.episodeId },
      });

      await storage.updateClipGenerationRun(run.id, {
        status: "completed",
        completedAt: new Date(),
        momentsDetected: 0,
      });

      return {
        episodeId: payload.episodeId,
        runId: run.id,
        momentsDetected: 0,
        clipsExtracted: 0,
        clipsCaptioned: 0,
        clipsOptimized: 0,
      };
    }

    onProgress?.(`Found ${moments.length} viral moments`, 20);

    const pendingExtraction = moments.filter(m => m.clipStatus === "pending").slice(0, maxClips);
    const pendingCaptions = moments.filter(m => m.clipStatus === "ready" && !m.captionedPath).slice(0, maxClips);
    const pendingOptimize = moments.filter(m => m.captionedPath && !m.optimizedPath).slice(0, maxClips);

    let jobsCreated = 0;

    for (const moment of pendingExtraction) {
      const sources = await storage.getEpisodeSourcesByEpisode(moment.episodeId);
      const youtubeSource = sources.find((s: any) => s.platform === "youtube" && s.sourceUrl);

      if (youtubeSource) {
        await storage.createJob({
          type: "extract_clip",
          episodeSourceId: youtubeSource.id,
          pipelineStage: "INTEL",
          result: { viralMomentId: moment.id },
        });
        jobsCreated++;
      }
    }

    onProgress?.(`Queued ${pendingExtraction.length} extraction jobs`, 40);

    for (const moment of pendingCaptions) {
      await storage.createJob({
        type: "burn_captions",
        episodeSourceId: job.episodeSourceId,
        pipelineStage: "INTEL",
        result: { viralMomentId: moment.id },
      });
      jobsCreated++;
    }

    onProgress?.(`Queued ${pendingCaptions.length} caption jobs`, 60);

    if (!payload.skipOptimize) {
      for (const moment of pendingOptimize) {
        await storage.createJob({
          type: "optimize_clip",
          episodeSourceId: job.episodeSourceId,
          pipelineStage: "INTEL",
          result: { viralMomentId: moment.id, platform },
        });
        jobsCreated++;
      }

      onProgress?.(`Queued ${pendingOptimize.length} optimize jobs`, 80);
    }

    await storage.updateClipGenerationRun(run.id, {
      status: "completed",
      completedAt: new Date(),
      momentsDetected: moments.length,
      clipsExtracted: pendingExtraction.length,
      clipsCaptioned: pendingCaptions.length,
      clipsOptimized: pendingOptimize.length,
    });

    onProgress?.("Pipeline complete", 100);

    console.log(`[CLIP-PIPELINE] Completed: ${jobsCreated} jobs created for episode ${payload.episodeId}`);

    return {
      episodeId: payload.episodeId,
      runId: run.id,
      momentsDetected: moments.length,
      clipsExtracted: pendingExtraction.length,
      clipsCaptioned: pendingCaptions.length,
      clipsOptimized: pendingOptimize.length,
    };
  } catch (error: any) {
    console.error(`[CLIP-PIPELINE] Failed:`, error.message);
    await storage.updateClipGenerationRun(run.id, {
      status: "failed",
      completedAt: new Date(),
      errorLog: error.message,
    });
    throw error;
  }
}
