import { storage } from "../storage";
import { annotationGenerator } from "../annotation-generator";
import { GeminiError } from "../ai/geminiClient";
import type { Job, Episode, TranscriptSegment } from "@shared/schema";

export interface AnnotateJobResult {
  annotationsCreated: number;
  episodeId: string;
}

interface AnnotateJobPayload {
  userId?: string;
  maxAnnotations?: number;
  podcastContext?: string;
}

export async function handleAnnotateJob(
  job: Job,
  onProgress: (message: string, percentage: number) => void
): Promise<AnnotateJobResult> {
  onProgress("Starting annotation generation", 0);

  let source, episode, segments;
  
  try {
    source = await storage.getEpisodeSource(job.episodeSourceId);
  } catch (err: any) {
    throw new GeminiError(`Storage error fetching episode source: ${err.message}`, true, "STORAGE_ERROR");
  }
  
  if (!source) {
    throw new GeminiError(`Episode source not found: ${job.episodeSourceId}`, false, "NOT_FOUND");
  }

  try {
    episode = await storage.getEpisode(source.episodeId);
  } catch (err: any) {
    throw new GeminiError(`Storage error fetching episode: ${err.message}`, true, "STORAGE_ERROR");
  }
  
  if (!episode) {
    throw new GeminiError(`Episode not found: ${source.episodeId}`, false, "NOT_FOUND");
  }

  onProgress("Fetching transcript segments", 10);
  
  try {
    segments = await storage.getSegmentsByEpisode(source.episodeId);
  } catch (err: any) {
    throw new GeminiError(`Storage error fetching segments: ${err.message}`, true, "STORAGE_ERROR");
  }
  
  if (!segments || segments.length === 0) {
    throw new GeminiError(
      `No transcript segments found for episode ${source.episodeId}. Transcription must complete first.`,
      false,
      "NO_SEGMENTS"
    );
  }

  let payload: AnnotateJobPayload;
  try {
    payload = job.result ? 
      (typeof job.result === 'string' ? JSON.parse(job.result) : job.result) : 
      {};
  } catch (err: any) {
    throw new GeminiError(`Invalid job payload JSON: ${err.message}`, false, "INVALID_PAYLOAD");
  }
  
  const { 
    userId, 
    maxAnnotations = 5, 
    podcastContext 
  } = payload;

  // Use system user for automated ingestion when no userId provided
  const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001';
  const effectiveUserId = userId ?? SYSTEM_USER_ID;

  let user;
  try {
    user = await storage.getUser(effectiveUserId);
  } catch (err: any) {
    throw new GeminiError(`Storage error fetching user: ${err.message}`, true, "STORAGE_ERROR");
  }
  
  if (!user) {
    // If system user doesn't exist, log warning but don't fail for automated jobs
    if (!userId) {
      console.warn(`[ANNOTATE-JOB] System user ${SYSTEM_USER_ID} not found - annotations will be skipped`);
      return { annotationsCreated: 0, episodeId: episode.id };
    }
    throw new GeminiError(`User not found: ${effectiveUserId}`, false, "USER_NOT_FOUND");
  }

  onProgress("Generating AI annotations", 20);
  console.log(`[ANNOTATE-JOB] Generating ${maxAnnotations} annotations for episode ${episode.id}`);

  const generatedAnnotations = await annotationGenerator.generateAnnotations(
    segments,
    episode,
    { maxAnnotations, podcastContext }
  );

  onProgress(`Saving ${generatedAnnotations.length} annotations`, 60);

  let createdCount = 0;
  const errors: string[] = [];

  for (const ann of generatedAnnotations) {
    try {
      const segment = segments.find(s => s.id === ann.segmentId);
      const timestamp = segment ? Math.floor(segment.startTime) : undefined;

      await storage.createAnnotation({
        episodeId: episode.id,
        segmentId: ann.segmentId,
        userId: effectiveUserId,
        text: ann.text,
        startOffset: ann.startOffset,
        endOffset: ann.endOffset,
        content: `[${ann.category}] ${ann.content}`,
        timestamp,
        isAiGenerated: true,
        status: "approved",
      });
      createdCount++;
    } catch (err: any) {
      console.error(`[ANNOTATE-JOB] Failed to save annotation:`, err.message);
      errors.push(err.message);
    }
  }

  if (createdCount === 0 && generatedAnnotations.length > 0) {
    throw new GeminiError(
      `Failed to save any annotations (storage errors are transient). Errors: ${errors.join("; ")}`,
      true,
      "SAVE_FAILED"
    );
  }

  onProgress("Annotation generation complete", 100);
  console.log(`[ANNOTATE-JOB] Created ${createdCount}/${generatedAnnotations.length} annotations for episode ${episode.id}`);

  return {
    annotationsCreated: createdCount,
    episodeId: episode.id,
  };
}
