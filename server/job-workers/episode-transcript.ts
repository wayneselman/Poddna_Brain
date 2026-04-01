import { storage } from "../storage";
import type { Job, Episode, EpisodeSource } from "@shared/schema";
import { runYouTubeTranscriptJob } from "./youtube-transcript";
import { importExternalTranscript } from "../transcription";
import { shouldGenerateTranscriptForEpisode, logTranscriptGuardDecision, isAutoFallbackEnabled } from "../transcript-guard";

export async function handleEpisodeTranscriptJob(
  job: Job,
  onProgress: (message: string, percentage: number) => void
): Promise<{ type: string; episodeId: string; source?: string; nextJob?: string }> {
  onProgress("Starting transcript job", 0);
  
  if (!job.episodeSourceId) {
    throw new Error(`Job ${job.id} has no episode source ID`);
  }
  
  const source = await storage.getEpisodeSource(job.episodeSourceId);
  if (!source) {
    throw new Error(`Episode source not found: ${job.episodeSourceId}`);
  }
  
  const episode = await storage.getEpisode(source.episodeId);
  if (!episode) {
    throw new Error(`Episode not found: ${source.episodeId}`);
  }
  
  // Use centralized transcript guard to check for existing transcript
  onProgress("Checking for existing transcript", 10);
  
  const guardResult = await shouldGenerateTranscriptForEpisode(episode);
  logTranscriptGuardDecision("EPISODE-TRANSCRIPT-JOB", episode.id, guardResult);
  
  if (!guardResult.shouldGenerate) {
    onProgress("Transcript already exists, skipping fetch", 90);
    
    // Queue the annotate job and return early
    const annotateJob = await storage.createJob({
      episodeSourceId: source.id,
      type: "episode_annotate",
      status: "pending",
    });
    
    return {
      type: "episode_transcript",
      episodeId: episode.id,
      source: guardResult.existingSource || "existing",
      nextJob: annotateJob.id,
    };
  }
  
  // Only set to pending if we actually need to fetch a transcript
  onProgress("Setting transcript status to pending", 15);
  
  await storage.updateEpisode(episode.id, {
    transcriptStatus: "pending",
    processingStatus: "analyzing",
  });
  
  let transcriptSource = "none";
  
  try {
    onProgress("Fetching transcript", 20);
    
    // Re-check segments in case they were added during the check above (race condition protection)
    const segmentsNow = await storage.getSegmentsByEpisode(episode.id);
    
    if (segmentsNow.length > 0) {
      onProgress("Transcript segments found, skipping fetch", 80);
      transcriptSource = episode.transcriptSource || "existing";
    } else {
      onProgress("Fetching transcript", 30);
      
      // Priority 1: Try YouTube transcript (FREE, instant)
      const videoSource = await getVideoSource(source.episodeId);
      let youtubeSuccess = false;
      
      if (videoSource && videoSource.sourceUrl) {
        onProgress("Attempting YouTube transcript (free)", 35);
        
        try {
          const jobs = await storage.getJobsByEpisodeSource(videoSource.id);
          const youtubeJob = jobs.find(j => j.type === "youtube_transcript");
          
          if (youtubeJob && youtubeJob.status === "done") {
            transcriptSource = "youtube";
            youtubeSuccess = true;
            onProgress("YouTube transcript already processed", 70);
          } else {
            await runYouTubeTranscriptJob(job, videoSource);
            transcriptSource = "youtube";
            youtubeSuccess = true;
            onProgress("YouTube transcript fetched successfully", 70);
          }
          
          // GUARD RAIL: Immediately mark episode as ready after YouTube success
          if (youtubeSuccess) {
            await storage.updateEpisode(episode.id, {
              transcriptStatus: "ready",
              transcriptSource: "youtube",
              processingStatus: "analyzing",
            });
            console.log(`[EPISODE-TRANSCRIPT] YouTube transcript immediately marked ready for episode ${episode.id}`);
          }
        } catch (ytError: any) {
          console.log(`[EPISODE-TRANSCRIPT] YouTube transcript failed: ${ytError.message}`);
          onProgress("YouTube failed, trying host transcript", 40);
        }
      }
      
      // GUARD RAIL: Re-fetch episode to check if another job completed the transcript
      const episodeAfterYoutube = await storage.getEpisode(episode.id);
      if (episodeAfterYoutube?.transcriptStatus === "ready") {
        onProgress("Transcript already ready (parallel job completed)", 80);
        console.log(`[EPISODE-TRANSCRIPT] Episode ${episode.id} now has ready transcript, skipping remaining sources`);
        transcriptSource = episodeAfterYoutube.transcriptSource || transcriptSource || "existing";
      } else {
        // Priority 2: Try host-provided transcript from RSS (FREE, fast)
        if (!youtubeSuccess && episode.transcriptUrl) {
          onProgress("Attempting host-provided transcript (free)", 45);
          
          try {
            const hostResult = await tryHostTranscript(episode, source, onProgress);
            if (hostResult) {
              transcriptSource = hostResult;
              // GUARD RAIL: Immediately mark episode as ready after host transcript success
              await storage.updateEpisode(episode.id, {
                transcriptStatus: "ready",
                transcriptSource: "host",
                processingStatus: "analyzing",
              });
              console.log(`[EPISODE-TRANSCRIPT] Host transcript immediately marked ready for episode ${episode.id}`);
            }
          } catch (hostError: any) {
            console.log(`[EPISODE-TRANSCRIPT] Host transcript failed: ${hostError.message}`);
            onProgress("Host transcript failed, trying AssemblyAI", 50);
          }
        }
        
        // GUARD RAIL: Re-fetch episode again before expensive AssemblyAI fallback
        const episodeBeforeAssembly = await storage.getEpisode(episode.id);
        if (episodeBeforeAssembly?.transcriptStatus === "ready") {
          onProgress("Transcript now ready, skipping AssemblyAI", 80);
          console.log(`[EPISODE-TRANSCRIPT] Episode ${episode.id} now has ready transcript, skipping AssemblyAI`);
          transcriptSource = episodeBeforeAssembly.transcriptSource || transcriptSource || "existing";
        } else {
          // Priority 3: AssemblyAI fallback - ONLY if auto-fallback is enabled
          if (!youtubeSuccess && transcriptSource === "none") {
            if (episode.mediaUrl) {
              // Check if auto-fallback is enabled (default: disabled for cost control)
              if (isAutoFallbackEnabled()) {
                onProgress("Using AssemblyAI fallback for audio (auto-fallback enabled)", 55);
                transcriptSource = await tryAssemblyAI(episode, source, onProgress);
              } else {
                // No auto-fallback: set fallback_pending and stop - admin must manually request
                console.log(`[EPISODE-TRANSCRIPT] Episode ${episode.id}: No free transcript available, auto-fallback disabled - setting fallback_pending`);
                onProgress("Transcript unavailable - paid transcription required (admin action)", 80);
                
                await storage.updateEpisode(episode.id, {
                  transcriptStatus: "none",
                  resolutionStatus: "fallback_pending",
                  processingStatus: "ready",
                });
                
                return {
                  type: "episode_transcript",
                  episodeId: episode.id,
                  source: "fallback_pending",
                };
              }
            } else {
              throw new Error("No media URL available for transcription");
            }
          }
        }
      }
    }
    
    onProgress("Updating episode transcript status", 90);
    
    await storage.updateEpisode(episode.id, {
      transcriptStatus: "ready",
      transcriptSource: transcriptSource as any,
      processingStatus: "analyzing",
    });
    
    onProgress("Queuing annotate job", 95);
    
    const annotateJob = await storage.createJob({
      episodeSourceId: source.id,
      type: "episode_annotate",
      status: "pending",
    });
    
    onProgress("Transcript job complete", 100);
    
    console.log(`[EPISODE-TRANSCRIPT] Episode ${episode.id} transcript ready (source: ${transcriptSource}), annotate job ${annotateJob.id} queued`);
    
    return {
      type: "episode_transcript",
      episodeId: episode.id,
      source: transcriptSource,
      nextJob: annotateJob.id,
    };
  } catch (err: any) {
    await storage.updateEpisode(episode.id, {
      transcriptStatus: "error",
      processingStatus: "error",
      lastError: err.message || "Transcript fetch failed",
    });
    throw err;
  }
}

async function getVideoSource(episodeId: string): Promise<EpisodeSource | undefined> {
  const sources = await storage.getEpisodeSourcesByEpisode(episodeId);
  return sources.find((s: EpisodeSource) => s.kind === "video");
}

async function tryAssemblyAI(
  episode: Episode,
  source: EpisodeSource,
  onProgress: (message: string, percentage: number) => void
): Promise<string> {
  onProgress("AssemblyAI transcription would start here", 60);
  
  const jobs = await storage.getJobsByEpisodeSource(source.id);
  const existingTranscribeJob = jobs.find(j => j.type === "transcribe");
  
  if (existingTranscribeJob && existingTranscribeJob.status === "done") {
    return "assembly";
  }
  
  const transcribeJob = await storage.createJob({
    episodeSourceId: source.id,
    type: "transcribe",
    status: "pending",
  });
  
  console.log(`[EPISODE-TRANSCRIPT] AssemblyAI transcribe job ${transcribeJob.id} queued for episode ${episode.id}`);
  
  return "assembly";
}

async function tryHostTranscript(
  episode: Episode,
  source: EpisodeSource,
  onProgress: (message: string, percentage: number) => void
): Promise<string | null> {
  if (!episode.transcriptUrl) {
    return null;
  }
  
  onProgress("Fetching host-provided transcript", 50);
  console.log(`[EPISODE-TRANSCRIPT] Trying host transcript from: ${episode.transcriptUrl}`);
  
  try {
    const result = await importExternalTranscript(
      episode.transcriptUrl,
      {
        transcriptType: episode.transcriptType || undefined,
        maxDuration: episode.duration || undefined,
      }
    );
    
    if (!result.success || result.segments.length === 0) {
      console.log(`[EPISODE-TRANSCRIPT] Host transcript returned no segments`);
      return null;
    }
    
    onProgress("Saving host transcript segments", 60);
    
    // Delete any existing segments first
    await storage.deleteAllSegmentsForEpisode(episode.id);
    
    // Deduplicate segments with same start time by adding small offsets
    const usedStartTimes = new Set<number>();
    const deduplicatedSegments = result.segments.map(segment => {
      let startTime = segment.startTime;
      while (usedStartTimes.has(startTime)) {
        startTime += 0.001;
      }
      usedStartTimes.add(startTime);
      return { ...segment, startTime };
    });
    
    // Save the segments to the database
    for (const segment of deduplicatedSegments) {
      await storage.createSegment({
        type: segment.type || "speech",
        episodeId: episode.id,
        startTime: segment.startTime,
        endTime: segment.endTime,
        text: segment.text,
        speaker: segment.speaker || "Unknown",
      });
    }
    
    console.log(`[EPISODE-TRANSCRIPT] Saved ${result.segments.length} host transcript segments for episode ${episode.id} (format: ${result.source})`);
    onProgress(`Host transcript saved (${result.segments.length} segments)`, 70);
    
    return "host";
  } catch (error: any) {
    console.error(`[EPISODE-TRANSCRIPT] Host transcript error:`, error.message);
    return null;
  }
}
