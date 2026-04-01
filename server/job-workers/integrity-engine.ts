import { storage } from "../storage";
import { GeminiError } from "../ai/geminiClient";
import type { Job } from "@shared/schema";
import { computeIntegrityScore } from "../semantic/integrityScoring";

const INTEGRITY_SCORE_VERSION = 1;

export interface IntegrityEngineJobResult {
  score: number;
  band: "low" | "medium" | "high";
  statementCount: number;
  classificationCount: number;
}

export async function handleIntegrityEngineJob(
  job: Job,
  onProgress?: (message: string, percentage: number) => void
): Promise<IntegrityEngineJobResult> {
  console.log(`[INTEGRITY-ENGINE] Starting job ${job.id}`);

  let source;
  try {
    source = await storage.getEpisodeSource(job.episodeSourceId);
  } catch (err: any) {
    throw new GeminiError(`Storage error fetching episode source: ${err.message}`, true, "STORAGE_ERROR");
  }

  if (!source) {
    throw new GeminiError(`Episode source not found: ${job.episodeSourceId}`, false, "NOT_FOUND");
  }

  const episodeId = source.episodeId;
  onProgress?.("Fetching episode data...", 10);

  let episode;
  try {
    episode = await storage.getEpisode(episodeId);
  } catch (err: any) {
    throw new GeminiError(`Storage error fetching episode: ${err.message}`, true, "STORAGE_ERROR");
  }

  if (!episode) {
    throw new GeminiError(`Episode not found: ${episodeId}`, false, "NOT_FOUND");
  }

  const durationSeconds = episode.duration || 0;
  if (durationSeconds <= 0) {
    console.log(`[INTEGRITY-ENGINE] Episode has no duration, using statement count estimate`);
  }

  onProgress?.("Fetching statements...", 30);

  let statements;
  try {
    statements = await storage.getStatementsByEpisode(episodeId);
  } catch (err: any) {
    throw new GeminiError(`Storage error fetching statements: ${err.message}`, true, "STORAGE_ERROR");
  }

  if (statements.length === 0) {
    console.log(`[INTEGRITY-ENGINE] No statements found for episode ${episodeId}`);
    const result = {
      score: 0,
      band: "low" as const,
      metrics: { claimDensity: 0, avgCertainty: 0, skepticalRatio: 0, avgSentiment: 0, emotionVariety: 0, coverage: 0 },
      components: { claimDensityScore: 0, certaintyScore: 0, skepticScore: 0, sentimentScore: 0, emotionScore: 0, coverageScore: 0 },
      summary: "No statements available for integrity analysis.",
    };

    try {
      await storage.upsertIntegrityScore({
        episodeId,
        version: INTEGRITY_SCORE_VERSION,
        score: result.score,
        band: result.band,
        components: { metrics: result.metrics, components: result.components },
        summary: result.summary,
      });
    } catch (err: any) {
      throw new GeminiError(`Storage error saving integrity score: ${err.message}`, true, "STORAGE_ERROR");
    }

    return { score: 0, band: "low", statementCount: 0, classificationCount: 0 };
  }

  onProgress?.("Fetching classifications...", 50);

  let classifications;
  try {
    classifications = await storage.getClassificationsByEpisode(episodeId);
  } catch (err: any) {
    throw new GeminiError(`Storage error fetching classifications: ${err.message}`, true, "STORAGE_ERROR");
  }

  console.log(`[INTEGRITY-ENGINE] Found ${statements.length} statements, ${classifications.length} classifications`);

  onProgress?.("Computing integrity score...", 70);

  const estimatedDuration = durationSeconds > 0 ? durationSeconds : (statements.length * 3);
  const result = computeIntegrityScore(statements, classifications, estimatedDuration);

  console.log(`[INTEGRITY-ENGINE] Computed score: ${result.score} (${result.band})`);

  onProgress?.("Saving integrity score...", 90);

  try {
    await storage.upsertIntegrityScore({
      episodeId,
      version: INTEGRITY_SCORE_VERSION,
      score: result.score,
      band: result.band,
      components: { metrics: result.metrics, components: result.components },
      summary: result.summary,
    });
  } catch (err: any) {
    throw new GeminiError(`Storage error saving integrity score: ${err.message}`, true, "STORAGE_ERROR");
  }

  console.log(`[INTEGRITY-ENGINE] Completed for episode ${episodeId}`);
  onProgress?.("Integrity score calculation complete", 100);

  return {
    score: result.score,
    band: result.band,
    statementCount: statements.length,
    classificationCount: classifications.length,
  };
}
