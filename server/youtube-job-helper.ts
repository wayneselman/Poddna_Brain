import { storage } from "./storage";
import { shouldGenerateTranscript, logTranscriptGuardDecision } from "./transcript-guard";

function isYouTubeUrl(url: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  return lower.includes("youtube.com") || lower.includes("youtu.be");
}

export interface EnqueueResult {
  enqueued: boolean;
  reason: string;
  jobId?: string;
  sourceId?: string;
}

export async function maybeEnqueueYoutubeTranscriptJob(episodeId: string): Promise<{
  results: EnqueueResult[];
  totalEnqueued: number;
}> {
  const results: EnqueueResult[] = [];
  
  try {
    // Use centralized transcript guard
    const guardResult = await shouldGenerateTranscript(episodeId);
    logTranscriptGuardDecision("YOUTUBE-ENQUEUE", episodeId, guardResult);
    
    if (!guardResult.shouldGenerate) {
      return { 
        results: [{ enqueued: false, reason: guardResult.reason }], 
        totalEnqueued: 0 
      };
    }
    
    const episode = await storage.getEpisode(episodeId);
    if (!episode) {
      return { results: [{ enqueued: false, reason: "Episode not found" }], totalEnqueued: 0 };
    }

    const sources = await storage.getEpisodeSourcesByEpisode(episodeId);
    const youtubeSources = sources.filter(s => 
      s.platform === "youtube" || isYouTubeUrl(s.sourceUrl || "")
    );

    if (youtubeSources.length === 0) {
      return { 
        results: [{ enqueued: false, reason: "No YouTube sources found" }], 
        totalEnqueued: 0 
      };
    }

    let totalEnqueued = 0;

    for (const youtubeSource of youtubeSources) {
      const existingJobs = await storage.getJobsByEpisodeSource(youtubeSource.id);
      const hasPendingOrRunningJob = existingJobs.some(j => 
        j.type === "youtube_transcript" && 
        (j.status === "pending" || j.status === "running")
      );

      if (hasPendingOrRunningJob) {
        results.push({ 
          enqueued: false, 
          reason: "YouTube transcript job already pending/running",
          sourceId: youtubeSource.id
        });
        continue;
      }

      const hasCompletedJob = existingJobs.some(j => 
        j.type === "youtube_transcript" && j.status === "done"
      );
      
      if (hasCompletedJob) {
        results.push({ 
          enqueued: false, 
          reason: "YouTube transcript job already completed",
          sourceId: youtubeSource.id
        });
        continue;
      }

      try {
        const job = await storage.createJob({
          episodeSourceId: youtubeSource.id,
          type: "youtube_transcript",
        });

        console.log(`[AUTO-ENQUEUE] Created youtube_transcript job ${job.id} for source ${youtubeSource.id} (episode: ${episode.title})`);
        
        results.push({
          enqueued: true,
          reason: "Job created successfully",
          jobId: job.id,
          sourceId: youtubeSource.id,
        });
        totalEnqueued++;
      } catch (createError) {
        console.error(`[AUTO-ENQUEUE] Failed to create job for source ${youtubeSource.id}:`, createError);
        results.push({
          enqueued: false,
          reason: `Failed to create job: ${createError instanceof Error ? createError.message : "Unknown"}`,
          sourceId: youtubeSource.id,
        });
      }
    }

    return { results, totalEnqueued };
  } catch (error) {
    console.error(`[AUTO-ENQUEUE] Error checking/creating jobs for episode ${episodeId}:`, error);
    return { 
      results: [{ enqueued: false, reason: `Error: ${error instanceof Error ? error.message : "Unknown"}` }], 
      totalEnqueued: 0 
    };
  }
}

export async function backfillYoutubeTranscriptJobs(): Promise<{
  total: number;
  enqueued: number;
  skipped: number;
  details: Array<{ episodeId: string; title: string; result: string }>;
}> {
  console.log("[BACKFILL] Starting YouTube transcript job backfill...");
  
  const allEpisodes = await storage.getAllEpisodes();
  const details: Array<{ episodeId: string; title: string; result: string }> = [];
  let enqueued = 0;
  let skipped = 0;

  for (const episode of allEpisodes) {
    const { results, totalEnqueued } = await maybeEnqueueYoutubeTranscriptJob(episode.id);
    
    if (totalEnqueued > 0) {
      enqueued += totalEnqueued;
      const jobIds = results.filter(r => r.enqueued).map(r => r.jobId).join(", ");
      details.push({
        episodeId: episode.id,
        title: episode.title,
        result: `Created ${totalEnqueued} job(s): ${jobIds}`,
      });
    } else {
      skipped++;
      const reasons = results.map(r => r.reason).join("; ");
      details.push({
        episodeId: episode.id,
        title: episode.title,
        result: `Skipped: ${reasons}`,
      });
    }
  }

  console.log(`[BACKFILL] Complete: ${enqueued} jobs created, ${skipped} episodes skipped`);
  
  return {
    total: allEpisodes.length,
    enqueued,
    skipped,
    details,
  };
}

export interface PipelineEnqueueResult {
  enqueued: boolean;
  reason: string;
  jobId?: string;
  sourceId?: string;
}

export async function enqueueEpisodePipelineJob(episodeId: string, forceRecovery: boolean = false): Promise<PipelineEnqueueResult> {
  try {
    const episode = await storage.getEpisode(episodeId);
    if (!episode) {
      return { enqueued: false, reason: "Episode not found" };
    }

    if (episode.processingStatus === "complete") {
      return { enqueued: false, reason: "Episode already processed" };
    }

    // Use centralized transcript guard to check if transcript generation is needed
    const guardResult = await shouldGenerateTranscript(episodeId);
    logTranscriptGuardDecision("PIPELINE-ENQUEUE", episodeId, guardResult);
    
    if (!guardResult.shouldGenerate) {
      return { enqueued: false, reason: guardResult.reason };
    }

    const sources = await storage.getEpisodeSourcesByEpisode(episodeId);
    
    if (sources.length === 0) {
      return { enqueued: false, reason: "No episode sources found" };
    }

    const canonicalSource = sources.find(s => s.isCanonical) || sources[0];

    const existingJobs = await storage.getJobsByEpisodeSource(canonicalSource.id);
    const hasPendingOrRunningImportJob = existingJobs.some(j => 
      j.type === "episode_import" && 
      (j.status === "pending" || j.status === "running")
    );

    if (hasPendingOrRunningImportJob) {
      return { 
        enqueued: false, 
        reason: "Episode import job already pending/running",
        sourceId: canonicalSource.id
      };
    }

    // Check if stuck in importing/analyzing without an active job (orphaned state)
    const isStuck = (episode.processingStatus === "importing" || episode.processingStatus === "analyzing");
    const hasAnyImportJob = existingJobs.some(j => j.type === "episode_import");
    
    if (isStuck && !hasAnyImportJob) {
      // Orphaned episode - no import job ever created. Reset and allow requeue.
      console.log(`[PIPELINE-ENQUEUE] Recovering orphaned episode ${episode.id} (status: ${episode.processingStatus}, no import jobs found)`);
      await storage.updateEpisode(episodeId, { processingStatus: "new" });
    } else if (isStuck && !forceRecovery) {
      // Has jobs but still stuck - only allow with forceRecovery flag
      return { enqueued: false, reason: "Episode stuck in processing (use forceRecovery to reset)" };
    }

    const job = await storage.createJob({
      episodeSourceId: canonicalSource.id,
      type: "episode_import",
    });

    console.log(`[PIPELINE-ENQUEUE] Created episode_import job ${job.id} for episode ${episode.title}`);

    return {
      enqueued: true,
      reason: isStuck ? "Recovered orphaned episode and created job" : "Episode import job created",
      jobId: job.id,
      sourceId: canonicalSource.id,
    };
  } catch (err) {
    console.error(`[PIPELINE-ENQUEUE] Error for episode ${episodeId}:`, err);
    return { 
      enqueued: false, 
      reason: err instanceof Error ? err.message : "Unknown error" 
    };
  }
}

export async function backfillEpisodePipelineJobs(): Promise<{
  total: number;
  enqueued: number;
  skipped: number;
  details: Array<{ episodeId: string; title: string; result: string }>;
}> {
  console.log("[BACKFILL-PIPELINE] Starting episode pipeline job backfill...");
  
  const allEpisodes = await storage.getAllEpisodes();
  const details: Array<{ episodeId: string; title: string; result: string }> = [];
  let enqueued = 0;
  let skipped = 0;

  for (const episode of allEpisodes) {
    const result = await enqueueEpisodePipelineJob(episode.id);
    
    if (result.enqueued) {
      enqueued++;
      details.push({
        episodeId: episode.id,
        title: episode.title,
        result: `Created job: ${result.jobId}`,
      });
    } else {
      skipped++;
      details.push({
        episodeId: episode.id,
        title: episode.title,
        result: `Skipped: ${result.reason}`,
      });
    }
  }

  console.log(`[BACKFILL-PIPELINE] Complete: ${enqueued} jobs created, ${skipped} episodes skipped`);
  
  return {
    total: allEpisodes.length,
    enqueued,
    skipped,
    details,
  };
}
