import { storage } from "../storage";
import { GeminiError } from "../ai/geminiClient";
import { extractAndStoreAffiliateEntitiesForEpisode } from "../services/affiliate-entity-extraction";
import type { Job } from "@shared/schema";

export interface AffiliateEntityExtractionResult {
  entitiesCreated: number;
  mentionsLinked: number;
  episodeId: string;
}

export async function handleExtractAffiliateEntitiesJob(
  job: Job,
  onProgress?: (message: string, percentage: number) => void
): Promise<AffiliateEntityExtractionResult> {
  console.log(`[EXTRACT-AFFILIATE-ENTITIES] Starting job ${job.id}`);

  if (!job.episodeSourceId) {
    throw new GeminiError(`Job ${job.id} has no episodeSourceId`, false, "INVALID_INPUT");
  }

  const source = await storage.getEpisodeSource(job.episodeSourceId);
  if (!source) {
    throw new GeminiError(`Episode source not found: ${job.episodeSourceId}`, false, "NOT_FOUND");
  }

  const episode = await storage.getEpisode(source.episodeId);
  if (!episode) {
    throw new GeminiError(`Episode not found for source: ${job.episodeSourceId}`, false, "NOT_FOUND");
  }

  onProgress?.("Loading transcript segments...", 10);

  const segments = await storage.getSegmentsByEpisode(source.episodeId);
  if (segments.length === 0) {
    console.log(`[EXTRACT-AFFILIATE-ENTITIES] No transcript segments found for episode ${source.episodeId}`);
    return { entitiesCreated: 0, mentionsLinked: 0, episodeId: source.episodeId };
  }

  console.log(`[EXTRACT-AFFILIATE-ENTITIES] Episode has ${segments.length} segments`);

  onProgress?.("Extracting affiliate entities with AI...", 30);

  const result = await extractAndStoreAffiliateEntitiesForEpisode(source.episodeId);

  if (!result.success) {
    throw new GeminiError(
      `Failed to extract entities: ${result.error}`,
      false,
      "EXTRACTION_FAILED"
    );
  }

  onProgress?.("Entity extraction complete", 100);

  console.log(`[EXTRACT-AFFILIATE-ENTITIES] Created ${result.created} entities, linked ${result.linked} mentions`);

  return {
    entitiesCreated: result.created,
    mentionsLinked: result.linked,
    episodeId: source.episodeId,
  };
}
