import { storage } from "../storage";
import { callGeminiJson } from "../ai/geminiClient";
import type { InsertEpisodeSemanticSegment, TranscriptSegment } from "@shared/schema";
import { z } from "zod";

const VALID_INTENTS = ["story", "claim", "opinion", "question", "explanation", "debate", "humor", "callout", "tangent", "unknown"] as const;
type ValidIntent = typeof VALID_INTENTS[number];

const SemanticAnalysisSchema = z.object({
  segments: z.array(z.object({
    segmentId: z.string(),
    startTime: z.number(),
    endTime: z.number(),
    topicCategory: z.string().nullable().optional(),
    subTopic: z.string().nullable().optional(),
    intent: z.string().nullable().optional(),
    importanceScore: z.number().min(0).max(1).nullable().optional(),
    noveltyScore: z.number().min(0).max(1).nullable().optional(),
    emotionIntensity: z.number().min(0).max(1).nullable().optional(),
    clipabilityScore: z.number().min(0).max(1).nullable().optional(),
  })),
});

function normalizeIntent(rawIntent: string | null | undefined): ValidIntent | null {
  if (!rawIntent) return null;
  const lower = rawIntent.toLowerCase().trim();
  if (VALID_INTENTS.includes(lower as ValidIntent)) {
    return lower as ValidIntent;
  }
  // Map common variations
  if (lower === "n/a" || lower === "none" || lower === "other") {
    return "unknown";
  }
  return "unknown";
}

type SemanticAnalysisResult = z.infer<typeof SemanticAnalysisSchema>;

function buildSemanticPrompt(
  episodeTitle: string,
  podcastTitle: string | undefined,
  segments: { id: string; startTime: number; endTime: number; text: string }[]
): string {
  const segmentTexts = segments
    .map((s, i) => `[${i}|${s.id}] (${s.startTime}s-${s.endTime}s): ${s.text}`)
    .join("\n\n");

  return `You are an expert podcast content analyst. Analyze the following transcript segments and classify each one semantically.

EPISODE CONTEXT:
- Episode: "${episodeTitle}"
${podcastTitle ? `- Podcast: "${podcastTitle}"` : ""}

FOR EACH SEGMENT, DETERMINE:

1. **topicCategory**: The broad topic area (e.g., "Habits", "Finance", "Health", "Relationships", "Technology", "Psychology", "Business", "Science", "Culture", "Personal Growth", etc.)

2. **subTopic**: A more specific sub-topic within that category (e.g., "Identity-based habits", "Compound interest", "Sleep optimization")

3. **intent**: The speaker's primary intent (choose EXACTLY one from this list):
   - "story" - Sharing a personal anecdote or narrative
   - "claim" - Making a factual claim or assertion
   - "opinion" - Expressing a personal view or belief
   - "question" - Asking or exploring a question
   - "explanation" - Teaching or explaining a concept
   - "debate" - Discussing different viewpoints
   - "humor" - Being funny or making jokes
   - "callout" - Calling out a specific thing/person/behavior
   - "tangent" - Off-topic or sidebar discussion
   - "unknown" - If none of the above fit
   IMPORTANT: Never use "N/A", "none", or any value outside this list.

4. **SCORES (0.0 to 1.0)**:
   - importanceScore: How central/important is this to the episode's main themes? (1.0 = core content, 0.0 = filler)
   - noveltyScore: How unique or surprising is the information? (1.0 = very novel, 0.0 = common knowledge)
   - emotionIntensity: How emotionally charged is the content? (1.0 = very emotional, 0.0 = neutral)
   - clipabilityScore: How suitable for a standalone clip? (1.0 = perfect clip material, 0.0 = requires context)

TRANSCRIPT SEGMENTS:
${segmentTexts}

Return a JSON object with a "segments" array. Each segment must include:
- segmentId: the segment ID from brackets (e.g., "abc123")
- startTime: start time in seconds
- endTime: end time in seconds
- topicCategory, subTopic, intent
- importanceScore, noveltyScore, emotionIntensity, clipabilityScore

Return ONLY valid JSON, no markdown or explanation.`;
}

const MAX_SEGMENTS_PER_BATCH = 10;
const MAX_TEXT_LENGTH_PER_BATCH = 4000;

function batchSegments(
  segments: TranscriptSegment[]
): TranscriptSegment[][] {
  const batches: TranscriptSegment[][] = [];
  let currentBatch: TranscriptSegment[] = [];
  let currentTextLength = 0;

  for (const seg of segments) {
    const textLength = seg.text.length;
    
    if (
      currentBatch.length >= MAX_SEGMENTS_PER_BATCH ||
      currentTextLength + textLength > MAX_TEXT_LENGTH_PER_BATCH
    ) {
      if (currentBatch.length > 0) {
        batches.push(currentBatch);
      }
      currentBatch = [seg];
      currentTextLength = textLength;
    } else {
      currentBatch.push(seg);
      currentTextLength += textLength;
    }
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}

export class SemanticService {
  async analyzeEpisodeSemantics(
    episodeId: string,
    onProgress?: (message: string, percentage: number) => void
  ): Promise<{ segmentsAnalyzed: number; segmentsCreated: number }> {
    const episode = await storage.getEpisode(episodeId);
    if (!episode) {
      throw new Error(`Episode ${episodeId} not found`);
    }

    const podcast = await storage.getPodcast(episode.podcastId);
    const segments = await storage.getSegmentsByEpisode(episodeId);

    if (!segments || segments.length === 0) {
      console.log(`[SEMANTIC] No transcript segments found for episode ${episodeId}`);
      return { segmentsAnalyzed: 0, segmentsCreated: 0 };
    }

    onProgress?.("Preparing transcript segments", 5);

    await storage.deleteSemanticSegmentsByEpisode(episodeId);

    const batches = batchSegments(segments);
    console.log(`[SEMANTIC] Processing ${segments.length} segments in ${batches.length} batches`);

    const allResults: InsertEpisodeSemanticSegment[] = [];

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      const progressPercent = 10 + Math.round((batchIndex / batches.length) * 80);
      onProgress?.(`Analyzing batch ${batchIndex + 1}/${batches.length}`, progressPercent);

      const prompt = buildSemanticPrompt(
        episode.title,
        podcast?.title,
        batch.map(s => ({
          id: s.id,
          startTime: s.startTime,
          endTime: s.endTime,
          text: s.text,
        }))
      );

      try {
        const result = await callGeminiJson<SemanticAnalysisResult>(
          "gemini-2.5-flash",
          prompt,
          SemanticAnalysisSchema,
          { temperature: 0.3, maxOutputTokens: 8192 }
        );

        for (const seg of result.segments) {
          allResults.push({
            episodeId,
            segmentId: null, // Don't link to episodeSegments - we use timestamps instead
            startTime: seg.startTime,
            endTime: seg.endTime,
            topicCategory: seg.topicCategory ?? null,
            subTopic: seg.subTopic ?? null,
            intent: normalizeIntent(seg.intent),
            importanceScore: seg.importanceScore ?? null,
            noveltyScore: seg.noveltyScore ?? null,
            emotionIntensity: seg.emotionIntensity ?? null,
            clipabilityScore: seg.clipabilityScore ?? null,
          });
        }

        console.log(`[SEMANTIC] Batch ${batchIndex + 1}: analyzed ${result.segments.length} segments`);
      } catch (error) {
        console.error(`[SEMANTIC] Error processing batch ${batchIndex + 1}:`, error);
        throw error;
      }
    }

    onProgress?.("Saving semantic segments", 95);

    if (allResults.length > 0) {
      await storage.insertSemanticSegments(allResults);
    }

    onProgress?.("Semantic analysis complete", 100);
    console.log(`[SEMANTIC] Completed: ${allResults.length} semantic segments for episode ${episodeId}`);

    return {
      segmentsAnalyzed: segments.length,
      segmentsCreated: allResults.length,
    };
  }
}

export const semanticService = new SemanticService();
