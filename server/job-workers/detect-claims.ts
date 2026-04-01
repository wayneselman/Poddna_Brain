import { storage } from "../storage";
import { callGeminiJson, GeminiError } from "../ai/geminiClient";
import { AiClaimsResponseSchema, type AiClaim } from "../ai/schemas";
import type { Job, InsertEpisodeClaim, TranscriptSegment } from "@shared/schema";

export interface ClaimsDetectionJobResult {
  claims: Array<{
    startTime: number;
    endTime: number | null;
    claimText: string;
    claimType: string;
    confidence: number;
  }>;
  totalDetected: number;
}

const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 20;

function buildPrompt(segments: TranscriptSegment[], chunkOffset: number): string {
  const segmentTexts = segments.map((s, i) => 
    `[${chunkOffset + i}] ${s.text}`
  ).join("\n");

  return `You are a claims extraction API.
Input: a transcript chunk of a podcast.
Output: JSON ONLY, matching this TypeScript shape:

type Claim = {
  segmentIndex: number;
  claimText: string;
  claimType: "financial" | "medical" | "sensitive" | "other";
  confidence: number;
};

type ClaimOutput = {
  claims: Claim[];
};

A "claim" is a statement that asserts something that could be true or false.

Claim types:
- financial: money, investments, markets, prices, revenue, costs, economic predictions
- medical: health claims, medical advice, treatment claims, drug/supplement claims
- sensitive: legal matters, political accusations, personal allegations, conspiracy theories
- other: verifiable factual claims that don't fit above categories

Rules:
- segmentIndex: the segment index from brackets where the claim appears
- claimText: the exact claim text (or a very close paraphrase)
- claimType: one of the four types above
- confidence: 0.0 to 1.0 based on how clearly stated the claim is
- Only extract SPECIFIC, VERIFIABLE claims (not opinions or general statements)
- Skip: personal opinions, subjective preferences, obvious jokes, hypotheticals

JSON ONLY. No explanations. No markdown.

Transcript chunk:
${segmentTexts}`;
}

export async function handleDetectClaimsJob(
  job: Job,
  onProgress?: (message: string, percentage: number) => void
): Promise<ClaimsDetectionJobResult> {
  console.log(`[DETECT-CLAIMS] Starting claims detection job ${job.id}`);

  if (!job.episodeSourceId) {
    throw new GeminiError("Job missing episodeSourceId", false, "INVALID_JOB");
  }

  let source;
  try {
    source = await storage.getEpisodeSource(job.episodeSourceId);
  } catch (err: any) {
    throw new GeminiError(`Storage error fetching episode source: ${err.message}`, true, "STORAGE_ERROR");
  }

  if (!source) {
    throw new GeminiError(`Episode source not found: ${job.episodeSourceId}`, false, "NOT_FOUND");
  }

  let episode;
  try {
    episode = await storage.getEpisode(source.episodeId);
  } catch (err: any) {
    throw new GeminiError(`Storage error fetching episode: ${err.message}`, true, "STORAGE_ERROR");
  }

  if (!episode) {
    throw new GeminiError(`Episode not found for source: ${job.episodeSourceId}`, false, "NOT_FOUND");
  }

  if (episode.sourceType === "zoom") {
    console.log(`[DETECT-CLAIMS] Skipping Zoom episode ${episode.id} (use analyze_zoom_call job instead)`);
    return { claims: [], totalDetected: 0 };
  }

  onProgress?.("Loading transcript segments...", 10);

  let segments: TranscriptSegment[];
  try {
    segments = await storage.getSegmentsByEpisode(source.episodeId);
  } catch (err: any) {
    throw new GeminiError(`Storage error fetching segments: ${err.message}`, true, "STORAGE_ERROR");
  }

  if (segments.length === 0) {
    console.log(`[DETECT-CLAIMS] No transcript segments found for episode ${source.episodeId}`);
    await storage.replaceClaimsForEpisode(source.episodeId, []);
    return { claims: [], totalDetected: 0 };
  }

  console.log(`[DETECT-CLAIMS] Processing ${segments.length} segments in chunks of ${CHUNK_SIZE}`);
  onProgress?.(`Analyzing ${segments.length} transcript segments...`, 20);

  const allClaims: AiClaim[] = [];
  const totalChunks = Math.ceil(segments.length / (CHUNK_SIZE - CHUNK_OVERLAP));

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const startIdx = chunkIndex * (CHUNK_SIZE - CHUNK_OVERLAP);
    const endIdx = Math.min(startIdx + CHUNK_SIZE, segments.length);
    const chunkSegments = segments.slice(startIdx, endIdx);

    const progress = 20 + Math.floor((chunkIndex / totalChunks) * 60);
    onProgress?.(`Processing chunk ${chunkIndex + 1}/${totalChunks}...`, progress);

    console.log(`[DETECT-CLAIMS] Processing chunk ${chunkIndex + 1}/${totalChunks} (segments ${startIdx}-${endIdx - 1})`);

    try {
      const prompt = buildPrompt(chunkSegments, startIdx);
      const response = await callGeminiJson(
        "gemini-2.5-flash",
        prompt,
        AiClaimsResponseSchema,
        { temperature: 0.3, maxOutputTokens: 8192 }
      );

      if (response.claims && response.claims.length > 0) {
        for (const claim of response.claims) {
          const actualIndex = claim.segmentIndex;
          if (actualIndex >= 0 && actualIndex < segments.length) {
            allClaims.push({
              segmentIndex: claim.segmentIndex,
              claimText: claim.claimText,
              claimType: claim.claimType as "financial" | "medical" | "sensitive" | "other",
              confidence: claim.confidence ?? 0.8,
            });
          } else {
            console.warn(`[DETECT-CLAIMS] Skipping claim with out-of-bounds segmentIndex: ${actualIndex}`);
          }
        }
        console.log(`[DETECT-CLAIMS] Chunk ${chunkIndex + 1}: found ${response.claims.length} claims`);
      }
    } catch (err: any) {
      if (err instanceof GeminiError) {
        throw err;
      }
      console.error(`[DETECT-CLAIMS] Error processing chunk ${chunkIndex + 1}:`, err.message);
      throw new GeminiError(`AI processing error: ${err.message}`, true, "AI_ERROR");
    }
  }

  onProgress?.("Deduplicating and mapping claims to timestamps...", 85);

  const seenClaims = new Set<string>();
  const uniqueClaims: InsertEpisodeClaim[] = [];

  for (const claim of allClaims) {
    const segment = segments[claim.segmentIndex];
    if (!segment) continue;

    const claimKey = `${claim.claimText.toLowerCase().trim()}`;
    if (seenClaims.has(claimKey)) continue;
    seenClaims.add(claimKey);

    uniqueClaims.push({
      episodeId: source.episodeId,
      startTime: Math.floor(segment.startTime),
      endTime: segment.endTime ? Math.ceil(segment.endTime) : null,
      claimText: claim.claimText,
      claimType: claim.claimType,
      confidence: Math.round(claim.confidence * 100),
    });
  }

  uniqueClaims.sort((a, b) => a.startTime - b.startTime);

  onProgress?.("Saving claims...", 95);

  try {
    await storage.replaceClaimsForEpisode(source.episodeId, uniqueClaims);
  } catch (err: any) {
    throw new GeminiError(`Storage error saving claims: ${err.message}`, true, "STORAGE_ERROR");
  }

  console.log(`[DETECT-CLAIMS] Completed: found ${uniqueClaims.length} claims for episode ${source.episodeId}`);
  onProgress?.("Claims detection complete", 100);

  return {
    claims: uniqueClaims.map(c => ({
      startTime: c.startTime,
      endTime: c.endTime ?? null,
      claimText: c.claimText,
      claimType: c.claimType,
      confidence: c.confidence,
    })),
    totalDetected: uniqueClaims.length,
  };
}
