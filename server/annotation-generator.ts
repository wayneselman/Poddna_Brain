import { callGeminiJson, GeminiError } from "./ai/geminiClient";
import { AiAnnotationsResponseSchema, type AiAnnotationItem } from "./ai/schemas";
import type { TranscriptSegment, Annotation, Episode } from "@shared/schema";

interface GeneratedAnnotation {
  segmentId: string;
  text: string;
  startOffset: number;
  endOffset: number;
  content: string;
  category: string;
}

interface AnnotationGeneratorConfig {
  maxAnnotations: number;
  podcastContext?: string;
}

const GENERIC_ANNOTATION_PROMPT = `You are a podcast annotation API.
Input: a podcast transcript with indexed segments.
Output: JSON ONLY, matching this TypeScript shape:

type Annotation = {
  segmentIndex: number;
  quote: string;
  content: string;
  category: string;
};

type AnnotationOutput = Annotation[];

Field definitions:
- segmentIndex: 0-based index of the segment containing the moment
- quote: exact verbatim text from transcript to highlight
- content: 2-3 sentence insight explaining why this moment matters
- category: one of [Key Insight, Quotable Moment, Emotional Peak, Story Highlight, Debate/Discussion, Expert Knowledge, Cultural Reference, Actionable Advice, Surprising Fact, Humor]

Category definitions:
- Key Insight: important takeaways, wisdom, lessons, revelations
- Quotable Moment: memorable, shareable phrases or soundbites
- Emotional Peak: genuine emotion - vulnerability, passion, humor, joy
- Story Highlight: compelling anecdotes or personal stories
- Debate/Discussion: back-and-forth, disagreements, different perspectives
- Expert Knowledge: technical explanations, insider information
- Cultural Reference: current events, pop culture, societal issues
- Actionable Advice: practical tips, strategies, recommendations
- Surprising Fact: unexpected information, statistics, revelations
- Humor: jokes, witty observations, playful banter

Style guide:
- Be conversational, not academic
- Think "Genius lyrics" energy - insider knowledge
- Keep annotations concise but insightful

JSON ONLY. No explanations. No markdown.`;

export class AnnotationGenerator {
  async generateAnnotations(
    segments: TranscriptSegment[],
    episode: Episode,
    config: AnnotationGeneratorConfig = { maxAnnotations: 5 }
  ): Promise<GeneratedAnnotation[]> {
    const { maxAnnotations, podcastContext } = config;

    const transcriptText = segments
      .map((seg, i) => `[${i}] ${seg.speaker || "Speaker"}: ${seg.text}`)
      .join("\n\n");

    const contextInfo = podcastContext
      ? `\nPODCAST/SHOW CONTEXT: ${podcastContext}\nUse this context to tailor your annotations appropriately. Do NOT reference other podcasts or shows.\n`
      : "";

    const prompt = `${GENERIC_ANNOTATION_PROMPT}
${contextInfo}
EPISODE TITLE: "${episode.title}"

IMPORTANT: Your annotations must be relevant to THIS specific episode and podcast. Do not reference hosts, shows, or content from other podcasts.

TRANSCRIPT:
${transcriptText}

Generate exactly ${maxAnnotations} high-quality annotations for the most interesting moments. Focus on variety - try to cover different categories. Return ONLY a valid JSON array, no markdown formatting or explanation.

Example format:
[
  {
    "segmentIndex": 3,
    "quote": "exact quote from transcript",
    "content": "Your insightful annotation here",
    "category": "Key Insight"
  }
]`;

    try {
      const rawAnnotations = await callGeminiJson(
        "gemini-2.5-flash",
        prompt,
        AiAnnotationsResponseSchema,
        { temperature: 0.2, maxOutputTokens: 8192 }  // Low temp for reliable JSON
      );

      const validAnnotations: GeneratedAnnotation[] = [];

      for (const ann of rawAnnotations) {
        const segmentIndex = ann.segmentIndex;
        if (segmentIndex < 0 || segmentIndex >= segments.length) {
          console.warn(`[ANNOTATION_GEN] Invalid segment index: ${segmentIndex}`);
          continue;
        }

        const segment = segments[segmentIndex];
        const quote = ann.quote?.trim();
        
        if (!quote || !segment.text.includes(quote)) {
          const firstWords = ann.quote?.split(" ").slice(0, 5).join(" ");
          if (firstWords && segment.text.includes(firstWords)) {
            const startOffset = segment.text.indexOf(firstWords);
            const endOffset = Math.min(startOffset + 100, segment.text.length);
            const adjustedQuote = segment.text.slice(startOffset, endOffset);
            
            validAnnotations.push({
              segmentId: segment.id,
              text: adjustedQuote,
              startOffset,
              endOffset,
              content: ann.content || "Interesting moment",
              category: ann.category || "Key Insight",
            });
          }
          continue;
        }

        const startOffset = segment.text.indexOf(quote);
        const endOffset = startOffset + quote.length;

        validAnnotations.push({
          segmentId: segment.id,
          text: quote,
          startOffset,
          endOffset,
          content: ann.content || "Interesting moment",
          category: ann.category || "Key Insight",
        });
      }

      console.log(`[ANNOTATION_GEN] Generated ${validAnnotations.length} valid annotations from ${rawAnnotations.length} AI suggestions`);

      return validAnnotations.slice(0, maxAnnotations);
    } catch (error) {
      console.error("[ANNOTATION_GEN] Error generating annotations:", error);
      
      // Re-throw GeminiErrors so job runner can classify them
      if (error instanceof GeminiError) {
        throw error;
      }
      
      throw error;
    }
  }
}

export const annotationGenerator = new AnnotationGenerator();
