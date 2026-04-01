import { storage } from "../storage";
import { callGeminiJson, GeminiError } from "../ai/geminiClient";
import { z } from "zod";
import type { Job, InsertEpisodeHighlight, TranscriptSegment } from "@shared/schema";

export interface HighlightExtractionResult {
  highlightsGenerated: number;
  episodeId: string;
}

const AiHighlightSchema = z.object({
  title: z.string().min(1).max(200),
  quoteText: z.string().min(10).max(2000),
  description: z.string().max(500).optional(),
  highlightType: z.enum(["insight", "quote", "quotable", "story", "humor", "controversial", "actionable"]),
  startSeconds: z.number().int().nonnegative(),
  endSeconds: z.number().int().nonnegative(),
  confidence: z.number().min(0).max(1).default(0.8),
});

const AiHighlightsResponseSchema = z.object({
  highlights: z.array(AiHighlightSchema),
});

const MIN_HIGHLIGHTS = 5;
const MAX_HIGHLIGHTS = 15;
const CHUNK_SIZE = 500;

export async function handleExtractHighlightsJob(
  job: Job,
  onProgress?: (message: string, percentage: number) => void
): Promise<HighlightExtractionResult> {
  console.log(`[EXTRACT-HIGHLIGHTS] Starting highlight extraction job ${job.id}`);

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

  const podcast = episode.podcastId ? await storage.getPodcast(episode.podcastId) : null;

  onProgress?.("Loading transcript segments...", 10);

  const segments = await storage.getSegmentsByEpisode(source.episodeId);
  if (segments.length === 0) {
    console.log(`[EXTRACT-HIGHLIGHTS] No transcript segments found for episode ${source.episodeId}`);
    return { highlightsGenerated: 0, episodeId: source.episodeId };
  }

  const totalDuration = Math.max(...segments.map(s => s.endTime));
  console.log(`[EXTRACT-HIGHLIGHTS] Episode has ${segments.length} segments, ~${Math.round(totalDuration / 60)} minutes`);

  onProgress?.("Extracting highlights with AI...", 30);

  const allHighlights: z.infer<typeof AiHighlightSchema>[] = [];
  const totalChunks = Math.ceil(segments.length / CHUNK_SIZE);

  for (let i = 0; i < segments.length; i += CHUNK_SIZE) {
    const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;
    const chunkSegments = segments.slice(i, i + CHUNK_SIZE);
    
    console.log(`[EXTRACT-HIGHLIGHTS] Processing chunk ${chunkNum}/${totalChunks}`);
    onProgress?.(`Processing chunk ${chunkNum}/${totalChunks}...`, 30 + (chunkNum / totalChunks) * 40);

    const prompt = buildHighlightPrompt(chunkSegments, {
      title: episode.title,
      showName: podcast?.title || "Unknown Podcast",
      description: episode.description || "",
      chunkNum,
      totalChunks,
    });

    try {
      const response = await callGeminiJson(
        "gemini-2.5-flash",
        prompt,
        AiHighlightsResponseSchema,
        { maxOutputTokens: 8192, temperature: 0.4 }
      );

      console.log(`[EXTRACT-HIGHLIGHTS] Chunk ${chunkNum}: found ${response.highlights.length} highlights`);
      const highlightsWithDefaults = response.highlights.map(h => ({
        ...h,
        confidence: h.confidence ?? 0.8,
      }));
      allHighlights.push(...highlightsWithDefaults);
    } catch (error) {
      console.error(`[EXTRACT-HIGHLIGHTS] Chunk ${chunkNum} failed:`, error);
      if (error instanceof GeminiError && !error.transient) {
        throw error;
      }
    }
  }

  onProgress?.("Filtering and ranking highlights...", 75);

  let highlights = deduplicateAndRankHighlights(allHighlights, totalDuration);
  highlights = highlights.slice(0, MAX_HIGHLIGHTS);

  console.log(`[EXTRACT-HIGHLIGHTS] After filtering: ${highlights.length} highlights`);

  if (highlights.length < MIN_HIGHLIGHTS) {
    console.warn(`[EXTRACT-HIGHLIGHTS] Warning: Only ${highlights.length} highlights (expected ${MIN_HIGHLIGHTS}-${MAX_HIGHLIGHTS})`);
  }

  onProgress?.("Saving highlights to database...", 85);

  await storage.deleteEpisodeHighlightsByEpisode(source.episodeId);

  const highlightInserts: InsertEpisodeHighlight[] = highlights.map((h, idx) => ({
    episodeId: source.episodeId,
    startTime: h.startSeconds,
    endTime: h.endSeconds,
    title: h.title.slice(0, 60),
    quoteText: h.quoteText.length > 500 ? h.quoteText.slice(0, 497) + "..." : h.quoteText,
    description: h.description ? h.description.slice(0, 250) : undefined,
    highlightType: h.highlightType,
    confidence: h.confidence ?? 0.8,
    displayOrder: idx,
  }));

  if (highlightInserts.length > 0) {
    await storage.createEpisodeHighlights(highlightInserts);
  }

  onProgress?.("Highlight extraction complete", 100);
  console.log(`[EXTRACT-HIGHLIGHTS] Successfully generated ${highlightInserts.length} highlights for episode ${source.episodeId}`);

  return { highlightsGenerated: highlightInserts.length, episodeId: source.episodeId };
}

interface EpisodeContext {
  title: string;
  showName: string;
  description: string;
  chunkNum: number;
  totalChunks: number;
}

function buildHighlightPrompt(segments: TranscriptSegment[], context: EpisodeContext): string {
  const segmentsPayload = segments.map((s, i) => ({
    idx: i,
    start: s.startTime,
    end: s.endTime,
    speaker: s.speaker || "Unknown",
    text: s.text.substring(0, 500),
  }));

  return `You are a podcast highlight extractor. Identify the most shareable, quotable, or viral-worthy moments from this transcript chunk.

Episode: "${context.title}"
Show: "${context.showName}"
Chunk: ${context.chunkNum} of ${context.totalChunks}

Find moments that are:
- **Quotable**: Memorable one-liners or phrases people would share
- **Insightful**: Key takeaways or "aha" moments
- **Story**: Compelling narratives or personal anecdotes
- **Humor**: Funny moments worth clipping
- **Controversial**: Bold or surprising statements that spark discussion
- **Actionable**: Clear advice or tips listeners can apply

For each highlight, provide:
- title: Catchy 3-6 word title (STRICTLY max 60 chars)
- quoteText: The exact quote or key phrase (STRICTLY 10-500 chars, keep concise)
- description: Brief context (optional, STRICTLY max 250 chars)
- highlightType: One of: insight, quote, quotable, story, humor, controversial, actionable
- startSeconds: Start time in seconds
- endSeconds: End time in seconds
- confidence: 0-1 confidence score

IMPORTANT: All string fields MUST respect the character limits above. Truncate if needed.

Return 2-5 highlights per chunk. Only include truly standout moments.

Transcript segments:
${JSON.stringify(segmentsPayload)}

Return JSON: { "highlights": [...] }`;
}

function deduplicateAndRankHighlights(
  highlights: z.infer<typeof AiHighlightSchema>[],
  totalDuration: number
): z.infer<typeof AiHighlightSchema>[] {
  const seen = new Set<string>();
  const unique: z.infer<typeof AiHighlightSchema>[] = [];

  for (const h of highlights) {
    if (h.startSeconds > totalDuration || h.endSeconds > totalDuration) continue;
    if (h.endSeconds <= h.startSeconds) continue;

    const key = h.quoteText.substring(0, 50).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const overlapping = unique.some(
      existing =>
        (h.startSeconds >= existing.startSeconds && h.startSeconds <= existing.endSeconds) ||
        (existing.startSeconds >= h.startSeconds && existing.startSeconds <= h.endSeconds)
    );
    if (overlapping) continue;

    unique.push(h);
  }

  return unique.sort((a, b) => b.confidence - a.confidence);
}
