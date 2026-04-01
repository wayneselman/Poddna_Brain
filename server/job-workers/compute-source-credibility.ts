import { storage } from "../storage";
import type { Job, ClaimOutcome } from "@shared/schema";

export interface ComputeSourceCredibilityJobResult {
  showId: string;
  hitRate: number;
  weightedHitRate: number;
  sampleSize: number;
  credibilityBand: string;
}

const RECENCY_WEIGHT = 1.5;
const BAND_HIGH_THRESHOLD = 0.65;
const BAND_MEDIUM_THRESHOLD = 0.45;
const MIN_SAMPLE_FOR_BAND = 5;

function computeCredibilityBand(hitRate: number, sampleSize: number): string {
  if (sampleSize < MIN_SAMPLE_FOR_BAND) return "insufficient_data";
  if (hitRate > BAND_HIGH_THRESHOLD) return "high";
  if (hitRate > BAND_MEDIUM_THRESHOLD) return "medium";
  return "low";
}

function computeWeightedHitRate(outcomes: ClaimOutcome[]): number {
  const scoreable = outcomes.filter(o => o.result === "hit" || o.result === "miss");
  if (scoreable.length === 0) return 0;

  const now = Date.now();
  const cutoffRecent = now - 90 * 24 * 60 * 60 * 1000;

  let weightedHits = 0;
  let totalWeight = 0;

  for (const outcome of scoreable) {
    const scoredAt = outcome.scoredAt instanceof Date
      ? outcome.scoredAt.getTime()
      : new Date(outcome.scoredAt).getTime();
    const weight = scoredAt >= cutoffRecent ? RECENCY_WEIGHT : 1.0;
    totalWeight += weight;
    if (outcome.result === "hit") weightedHits += weight;
  }

  return totalWeight > 0 ? weightedHits / totalWeight : 0;
}

export async function handleComputeSourceCredibilityJob(
  job: Job,
  onProgress?: (message: string, percentage: number) => void
): Promise<ComputeSourceCredibilityJobResult> {
  console.log(`[COMPUTE-SOURCE-CREDIBILITY] Starting job ${job.id}`);

  const showId = job.episodeSourceId ?? (job.result as any)?.showId;
  if (!showId) {
    throw new Error("Job requires showId — pass it via episodeSourceId or result.showId");
  }

  onProgress?.("Fetching claim outcomes for show...", 20);

  const outcomes = await storage.getClaimOutcomesByShow(showId);

  const scoreable = outcomes.filter(o => o.result === "hit" || o.result === "miss");
  const sampleSize = scoreable.length;

  const hitRate = sampleSize > 0
    ? scoreable.filter(o => o.result === "hit").length / sampleSize
    : 0;

  const weightedHitRate = computeWeightedHitRate(outcomes);
  const credibilityBand = computeCredibilityBand(hitRate, sampleSize);

  onProgress?.("Writing credibility score...", 80);

  await storage.upsertSourceCredibility({
    showId,
    hostEntity: null,
    hitRate,
    weightedHitRate,
    sampleSize,
    credibilityBand,
  });

  console.log(`[COMPUTE-SOURCE-CREDIBILITY] Show ${showId}: hitRate=${(hitRate * 100).toFixed(1)}% weighted=${(weightedHitRate * 100).toFixed(1)}% n=${sampleSize} band=${credibilityBand}`);
  onProgress?.("Credibility computed", 100);

  return { showId, hitRate, weightedHitRate, sampleSize, credibilityBand };
}
