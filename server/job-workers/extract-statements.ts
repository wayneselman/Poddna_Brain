import { storage } from "../storage";
import { callGeminiJson, GeminiError } from "../ai/geminiClient";
import { AiStatementsResponseSchema, type AiStatement } from "../ai/schemas";
import { getEmbeddingForText } from "../ai/embeddings";
import type { Job, InsertStatement, TranscriptSegment } from "@shared/schema";

export interface ExtractStatementsJobResult {
  statements: Array<{
    startTime: number;
    endTime: number;
    text: string;
    speaker: string | null;
    confidence: number;
    hasEmbedding: boolean;
  }>;
  totalExtracted: number;
}

const CHUNK_SIZE = 100;
const CHUNK_OVERLAP = 10;

interface Checkpoint {
  episodeId: string;
  lastCompletedChunk: number;
  freshStart: boolean;
}

function buildPrompt(segments: TranscriptSegment[], chunkOffset: number): string {
  const segmentTexts = segments.map((s, i) => {
    const speaker = s.speaker ? `[${s.speaker}]` : "";
    return `[${chunkOffset + i}] ${speaker} ${s.text}`;
  }).join("\n");

  return `You are a statement extraction API.
Input: a transcript chunk of a podcast.
Output: JSON ONLY, matching this TypeScript shape:

type Statement = {
  segmentIndex: number;
  text: string;
  speaker: string | null;
  confidence: number;
};

type StatementOutput = {
  statements: Statement[];
};

A "statement" is a key fact, claim, or assertion from the transcript.

Rules:
- segmentIndex: the segment index from brackets
- text: the statement text, max 20 words, ONE idea only
- speaker: name of the speaker if known, otherwise null
- confidence: 0.0 to 1.0
- Extract 1-3 key statements per segment (only the most important)
- Use third person (e.g., "The speaker believes...")
- Skip greetings, filler, and small talk
- Keep specific facts, numbers, and names

JSON ONLY. No explanations. No markdown.

Transcript chunk:
${segmentTexts}`;
}

export async function handleExtractStatementsJob(
  job: Job,
  onProgress?: (message: string, percentage: number) => void
): Promise<ExtractStatementsJobResult> {
  console.log(`[EXTRACT-STATEMENTS] Starting job ${job.id}`);

  if (!job.episodeSourceId) {
    throw new GeminiError(`Job ${job.id} has no episodeSourceId`, false, "INVALID_CONFIG");
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

  onProgress?.("Loading transcript segments...", 10);

  let segments: TranscriptSegment[];
  try {
    segments = await storage.getSegmentsByEpisode(source.episodeId);
  } catch (err: any) {
    throw new GeminiError(`Storage error fetching segments: ${err.message}`, true, "STORAGE_ERROR");
  }

  if (segments.length === 0) {
    console.log(`[EXTRACT-STATEMENTS] No transcript segments found for episode ${source.episodeId}`);
    await storage.clearStatementsForEpisode(source.episodeId);
    return { statements: [], totalExtracted: 0 };
  }

  // --- Checkpoint / resume logic ---
  const checkpoint = (job.result as Checkpoint | null) ?? null;
  const isSameEpisode = checkpoint?.episodeId === source.episodeId;
  const resumeFromChunk = isSameEpisode && typeof checkpoint?.lastCompletedChunk === "number"
    ? checkpoint.lastCompletedChunk + 1
    : 0;

  if (resumeFromChunk === 0) {
    // Fresh start: clear any previous statements for this episode
    console.log(`[EXTRACT-STATEMENTS] Fresh start — clearing existing statements for episode ${source.episodeId}`);
    await storage.clearStatementsForEpisode(source.episodeId);
    // Write initial checkpoint so next restart knows the episodeId
    await storage.updateJob(job.id, {
      result: { episodeId: source.episodeId, lastCompletedChunk: -1, freshStart: true } as any,
    });
  } else {
    console.log(`[EXTRACT-STATEMENTS] Resuming from chunk ${resumeFromChunk} (last completed: ${checkpoint!.lastCompletedChunk})`);
  }

  console.log(`[EXTRACT-STATEMENTS] Processing ${segments.length} segments in chunks of ${CHUNK_SIZE}`);
  onProgress?.(`Extracting statements from ${segments.length} segments...`, 15);

  const totalChunks = Math.ceil(segments.length / (CHUNK_SIZE - CHUNK_OVERLAP));
  let totalSavedThisRun = 0;

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    // Skip already-completed chunks when resuming
    if (chunkIndex < resumeFromChunk) {
      continue;
    }

    const startIdx = chunkIndex * (CHUNK_SIZE - CHUNK_OVERLAP);
    const endIdx = Math.min(startIdx + CHUNK_SIZE, segments.length);
    const chunkSegments = segments.slice(startIdx, endIdx);

    const progress = 15 + Math.floor((chunkIndex / totalChunks) * 75);
    onProgress?.(`Processing chunk ${chunkIndex + 1}/${totalChunks}...`, progress);

    console.log(`[EXTRACT-STATEMENTS] Processing chunk ${chunkIndex + 1}/${totalChunks} (segments ${startIdx}-${endIdx - 1})`);

    let chunkStatements: (AiStatement & { actualSegment: TranscriptSegment })[] = [];

    try {
      const prompt = buildPrompt(chunkSegments, startIdx);
      const response = await callGeminiJson(
        "gemini-2.5-flash",
        prompt,
        AiStatementsResponseSchema,
        { temperature: 0.3, maxOutputTokens: 8192 }
      );

      if (response.statements && response.statements.length > 0) {
        for (const stmt of response.statements) {
          const actualIndex = stmt.segmentIndex;
          if (actualIndex >= 0 && actualIndex < segments.length) {
            chunkStatements.push({
              ...stmt,
              confidence: stmt.confidence ?? 0.8,
              actualSegment: segments[actualIndex],
            });
          } else {
            console.warn(`[EXTRACT-STATEMENTS] Skipping statement with out-of-bounds segmentIndex: ${actualIndex}`);
          }
        }
        console.log(`[EXTRACT-STATEMENTS] Chunk ${chunkIndex + 1}: found ${response.statements.length} statements`);
      }
    } catch (err: any) {
      if (err instanceof GeminiError) {
        throw err;
      }
      console.error(`[EXTRACT-STATEMENTS] Error processing chunk ${chunkIndex + 1}:`, err.message);
      throw new GeminiError(`AI processing error: ${err.message}`, true, "AI_ERROR");
    }

    // Generate embeddings for this chunk's statements immediately
    const insertStatements: InsertStatement[] = [];
    for (const stmt of chunkStatements) {
      const segment = stmt.actualSegment;
      let embedding: number[] | null = null;
      try {
        embedding = await getEmbeddingForText(stmt.text);
      } catch (err: any) {
        console.warn(`[EXTRACT-STATEMENTS] Failed to embed statement:`, err.message);
      }
      const segmentEnd = segment.endTime ?? (segment.startTime + 5);
      insertStatements.push({
        episodeId: source.episodeId,
        segmentId: segment.id,
        startTime: Math.floor(segment.startTime),
        endTime: Math.ceil(segmentEnd),
        speaker: stmt.speaker ?? segment.speaker ?? null,
        text: stmt.text,
        confidence: stmt.confidence,
        embedding: embedding,
      });
    }

    // Save this chunk's statements immediately (progressive save)
    if (insertStatements.length > 0) {
      try {
        await storage.appendStatements(insertStatements);
        totalSavedThisRun += insertStatements.length;
      } catch (err: any) {
        throw new GeminiError(`Storage error saving chunk ${chunkIndex + 1}: ${err.message}`, true, "STORAGE_ERROR");
      }
    }

    // Write checkpoint after each chunk — survives any restart
    await storage.updateJob(job.id, {
      result: { episodeId: source.episodeId, lastCompletedChunk: chunkIndex, freshStart: false } as any,
    });
  }

  // Deduplicate overlapping statements (from CHUNK_OVERLAP) that were saved progressively
  onProgress?.("Deduplicating statements...", 92);
  const dupCount = await storage.deduplicateStatements(source.episodeId);
  if (dupCount > 0) {
    console.log(`[EXTRACT-STATEMENTS] Removed ${dupCount} duplicate statements`);
  }

  // Ensure all vectors are populated
  await storage.populateEmbeddingVectors(source.episodeId);

  const finalStatements = await storage.getStatementsByEpisode(source.episodeId);

  console.log(`[EXTRACT-STATEMENTS] Completed: ${finalStatements.length} unique statements for episode ${source.episodeId} (saved ${totalSavedThisRun} this run)`);
  onProgress?.("Statement extraction complete", 100);

  return {
    statements: finalStatements.map(s => ({
      startTime: s.startTime,
      endTime: s.endTime,
      text: s.text,
      speaker: s.speaker ?? null,
      confidence: s.confidence ?? 1.0,
      hasEmbedding: s.embedding !== null,
    })),
    totalExtracted: finalStatements.length,
  };
}
