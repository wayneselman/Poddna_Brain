import { storage } from "./storage";
import type { Episode, EpisodeSource, ResolutionStatus } from "@shared/schema";

export function isAutoFallbackEnabled(): boolean {
  const flag = process.env.ALLOW_ASSEMBLY_AUTOFALLBACK;
  return flag === "true" || flag === "1";
}

export interface TranscriptGuardResult {
  shouldGenerate: boolean;
  reason: string;
  existingSource?: string | null;
  segmentCount?: number;
}

export async function shouldGenerateTranscript(episodeId: string): Promise<TranscriptGuardResult> {
  const episode = await storage.getEpisode(episodeId);
  
  if (!episode) {
    return {
      shouldGenerate: false,
      reason: "Episode not found",
    };
  }
  
  return shouldGenerateTranscriptForEpisode(episode);
}

export async function shouldGenerateTranscriptForEpisode(episode: Episode): Promise<TranscriptGuardResult> {
  if (episode.transcriptStatus === "ready") {
    const segments = await storage.getSegmentsByEpisode(episode.id);
    
    if (segments.length > 0) {
      return {
        shouldGenerate: false,
        reason: `Transcript already ready with ${segments.length} segments`,
        existingSource: episode.transcriptSource,
        segmentCount: segments.length,
      };
    }
    
    console.log(`[TRANSCRIPT-GUARD] Episode ${episode.id} has transcriptStatus=ready but no segments - allowing generation`);
  }
  
  if (episode.transcriptStatus === "pending") {
    const sources = await storage.getEpisodeSourcesByEpisode(episode.id);
    
    for (const source of sources) {
      const jobs = await storage.getJobsByEpisodeSource(source.id);
      const hasActiveJob = jobs.some(j => 
        (j.type === "transcribe" || j.type === "youtube_transcript" || j.type === "episode_transcript") &&
        (j.status === "pending" || j.status === "running")
      );
      
      if (hasActiveJob) {
        return {
          shouldGenerate: false,
          reason: "Transcript job already pending or running",
        };
      }
    }
  }
  
  return {
    shouldGenerate: true,
    reason: "No existing transcript, generation allowed",
  };
}

export async function canEnqueueTranscriptJob(
  episodeId: string,
  jobType: "transcribe" | "youtube_transcript" | "episode_transcript"
): Promise<TranscriptGuardResult> {
  const baseResult = await shouldGenerateTranscript(episodeId);
  
  if (!baseResult.shouldGenerate) {
    return baseResult;
  }
  
  const episode = await storage.getEpisode(episodeId);
  if (!episode) {
    return {
      shouldGenerate: false,
      reason: "Episode not found",
    };
  }
  
  const sources = await storage.getEpisodeSourcesByEpisode(episodeId);
  
  for (const source of sources) {
    const jobs = await storage.getJobsByEpisodeSource(source.id);
    const hasDuplicateJob = jobs.some(j => 
      j.type === jobType && (j.status === "pending" || j.status === "running")
    );
    
    if (hasDuplicateJob) {
      return {
        shouldGenerate: false,
        reason: `${jobType} job already pending or running for this episode`,
      };
    }
  }
  
  return {
    shouldGenerate: true,
    reason: `${jobType} job can be enqueued`,
  };
}

export function logTranscriptGuardDecision(
  context: string,
  episodeId: string,
  result: TranscriptGuardResult
): void {
  if (result.shouldGenerate) {
    console.log(`[TRANSCRIPT-GUARD:${context}] Episode ${episodeId}: ALLOWED - ${result.reason}`);
  } else {
    console.log(`[TRANSCRIPT-GUARD:${context}] Episode ${episodeId}: BLOCKED - ${result.reason}${result.existingSource ? ` (source: ${result.existingSource})` : ""}`);
  }
}

export type TranscriptAuthority = 
  | "existing_segments"     // transcriptStatus=ready with segments
  | "youtube_source"        // Accepted YouTube source available
  | "assemblyai_fallback"   // resolutionStatus=fallback, use AssemblyAI
  | "awaiting_resolution"   // Still in resolution process
  | "no_transcript";        // No transcript source available

export interface TranscriptAuthorityResult {
  authority: TranscriptAuthority;
  reason: string;
  source?: EpisodeSource;
  segmentCount?: number;
  transcriptSource?: string | null;
}

export async function getBestTranscriptForEpisode(episodeId: string): Promise<TranscriptAuthorityResult> {
  const episode = await storage.getEpisode(episodeId);
  
  if (!episode) {
    return {
      authority: "no_transcript",
      reason: "Episode not found",
    };
  }
  
  return getBestTranscriptForEpisodeData(episode);
}

export async function getBestTranscriptForEpisodeData(episode: Episode): Promise<TranscriptAuthorityResult> {
  if (episode.transcriptStatus === "ready") {
    const segments = await storage.getSegmentsByEpisode(episode.id);
    
    if (segments.length === 0) {
      console.log(`[TRANSCRIPT-AUTHORITY] Episode ${episode.id} has transcriptStatus=ready but 0 segments - still honoring ready status`);
    }
    
    return {
      authority: "existing_segments",
      reason: segments.length > 0 
        ? `Transcript ready with ${segments.length} segments` 
        : "Transcript marked ready (segments pending load)",
      segmentCount: segments.length,
      transcriptSource: episode.transcriptSource,
    };
  }
  
  const sources = await storage.getEpisodeSourcesByEpisode(episode.id);
  const youtubeSource = sources.find(s => s.platform === "youtube" && s.kind === "video");
  
  if (youtubeSource) {
    return {
      authority: "youtube_source",
      reason: "YouTube source available for transcription",
      source: youtubeSource,
    };
  }
  
  const resolutionStatus = episode.resolutionStatus as ResolutionStatus;
  
  if (resolutionStatus === "fallback_requested" || resolutionStatus === "fallback") {
    const audioSource = sources.find(s => s.kind === "audio");
    
    return {
      authority: "assemblyai_fallback",
      reason: "Admin requested paid transcription - AssemblyAI authorized",
      source: audioSource,
    };
  }
  
  if (resolutionStatus === "awaiting_review") {
    return {
      authority: "awaiting_resolution",
      reason: "Episode awaiting admin review for video source resolution",
    };
  }
  
  if (resolutionStatus === "unresolved") {
    return {
      authority: "awaiting_resolution",
      reason: "Episode resolution in progress",
    };
  }
  
  if (resolutionStatus === "fallback_pending") {
    return {
      authority: "awaiting_resolution",
      reason: "Transcript not available - paid transcription required (admin action needed)",
    };
  }
  
  const autoFallbackEnabled = isAutoFallbackEnabled();
  const audioSource = sources.find(s => s.kind === "audio");
  
  if (audioSource && autoFallbackEnabled) {
    console.log(`[TRANSCRIPT-AUTHORITY] Episode ${episode.id}: Auto-fallback enabled, authorizing AssemblyAI`);
    return {
      authority: "assemblyai_fallback",
      reason: "No video source, auto-fallback to AssemblyAI enabled",
      source: audioSource,
    };
  }
  
  if (audioSource) {
    console.log(`[TRANSCRIPT-AUTHORITY] Episode ${episode.id}: No YouTube source, auto-fallback disabled - marking fallback_pending`);
    return {
      authority: "awaiting_resolution",
      reason: "No video source available - paid transcription required (awaiting admin action)",
    };
  }
  
  return {
    authority: "no_transcript",
    reason: "No suitable transcript source found",
  };
}

export function shouldUseYouTubeTranscript(result: TranscriptAuthorityResult): boolean {
  return result.authority === "youtube_source";
}

export function shouldUseAssemblyAI(result: TranscriptAuthorityResult): boolean {
  return result.authority === "assemblyai_fallback";
}

export function canProceedWithTranscription(result: TranscriptAuthorityResult): boolean {
  return result.authority === "youtube_source" || result.authority === "assemblyai_fallback";
}
