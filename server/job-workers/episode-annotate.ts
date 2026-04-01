import { storage } from "../storage";
import type { Job, Episode, EpisodeSource } from "@shared/schema";
import { handleAnnotateJob } from "./annotate";

export async function handleEpisodeAnnotateJob(
  job: Job,
  onProgress: (message: string, percentage: number) => void
): Promise<{ type: string; episodeId: string; chaptersCreated: number; nextJob?: string }> {
  onProgress("Starting annotation job", 0);
  
  const source = await storage.getEpisodeSource(job.episodeSourceId);
  if (!source) {
    throw new Error(`Episode source not found: ${job.episodeSourceId}`);
  }
  
  const episode = await storage.getEpisode(source.episodeId);
  if (!episode) {
    throw new Error(`Episode not found: ${source.episodeId}`);
  }
  
  onProgress("Setting processing status to analyzing", 10);
  
  await storage.updateEpisode(episode.id, {
    processingStatus: "analyzing",
  });
  
  try {
    onProgress("Loading transcript segments", 20);
    
    const transcriptSegments = await storage.getSegmentsByEpisode(episode.id);
    
    if (transcriptSegments.length === 0) {
      console.log(`[EPISODE-ANNOTATE] No transcript segments found for episode ${episode.id}, skipping annotation`);
      
      await storage.updateEpisode(episode.id, {
        processingStatus: "complete",
      });
      
      return {
        type: "episode_annotate",
        episodeId: episode.id,
        chaptersCreated: 0,
      };
    }
    
    onProgress("Running AI annotation", 30);
    
    const jobs = await storage.getJobsByEpisodeSource(source.id);
    const existingAnnotateJob = jobs.find(j => j.type === "annotate");
    
    let chaptersCreated = 0;
    
    if (existingAnnotateJob && existingAnnotateJob.status === "done") {
      onProgress("Annotation already processed", 80);
      const existingAnnotations = await storage.getAnnotationsByEpisode(episode.id);
      chaptersCreated = existingAnnotations.length;
    } else {
      const result = await handleAnnotateJob(job, (msg, pct) => {
        onProgress(msg, 30 + (pct * 0.5));
      });
      
      if (result && result.annotationsCreated !== undefined) {
        chaptersCreated = result.annotationsCreated;
      }
    }
    
    onProgress("Checking for comments phase", 85);
    
    const enableCommentsPhase = await shouldEnableCommentsPhase();
    let nextJobId: string | undefined;
    
    if (enableCommentsPhase && episode.videoUrl) {
      onProgress("Queuing comments fetch job", 90);
      
      const videoSource = await getYouTubeVideoSource(source.episodeId);
      if (videoSource) {
        // Skip if a comments_fetch job already exists (including failed ones)
        const existingCommentJobs = await storage.getJobsByEpisodeSource(videoSource.id);
        const hasCommentJob = existingCommentJobs.some(j => j.type === "episode_comments_fetch");
        if (!hasCommentJob) {
          const commentsJob = await storage.createJob({
            episodeSourceId: videoSource.id,
            type: "episode_comments_fetch",
            status: "pending",
          });
          nextJobId = commentsJob.id;
          console.log(`[EPISODE-ANNOTATE] Comments fetch job ${commentsJob.id} queued for episode ${episode.id}`);
        } else {
          console.log(`[EPISODE-ANNOTATE] Skipping comments fetch for episode ${episode.id} — job already exists`);
        }
      }
    }
    
    onProgress("Updating episode status", 95);
    
    await storage.updateEpisode(episode.id, {
      processingStatus: nextJobId ? "analyzing" : "complete",
    });
    
    onProgress("Annotation complete", 100);
    
    console.log(`[EPISODE-ANNOTATE] Episode ${episode.id} annotation complete, ${chaptersCreated} chapters created`);
    
    return {
      type: "episode_annotate",
      episodeId: episode.id,
      chaptersCreated,
      nextJob: nextJobId,
    };
  } catch (err: any) {
    await storage.updateEpisode(episode.id, {
      processingStatus: "error",
      lastError: err.message || "Annotation failed",
    });
    throw err;
  }
}

async function getYouTubeVideoSource(episodeId: string): Promise<EpisodeSource | undefined> {
  const sources = await storage.getEpisodeSourcesByEpisode(episodeId);
  return sources.find((s: EpisodeSource) => 
    s.kind === "video" && 
    (s.platform === "youtube" || (s.sourceUrl && s.sourceUrl.includes("youtube")))
  );
}

async function shouldEnableCommentsPhase(): Promise<boolean> {
  try {
    const flag = await storage.getFeatureFlag("ENABLE_COMMENTS_ANALYSIS");
    return flag?.value === "true";
  } catch {
    return false;
  }
}
