import { storage } from "../storage";
import Anthropic from "@anthropic-ai/sdk";
import type { Job, InsertViralMoment, EpisodeClaim } from "@shared/schema";
import { z } from "zod";
import { getEmbeddingForText, cosineSimilarity } from "../ai/embeddings";

export interface KeyMomentGenerationResult {
  momentsGenerated: number;
  episodeId: string;
}

const KeyMomentSchema = z.object({
  startTime: z.number().int().min(0),
  endTime: z.number().int().min(0),
  sourceStatement: z.string().min(10).transform(s => s.slice(0, 500)),
  title: z.string().min(1).max(120),
  whyThisMatters: z.string().min(10).transform(s => s.slice(0, 400)),
  momentType: z.enum(["insight", "tactical", "story", "example", "contradiction"]).default("insight"),
  topics: z.array(z.string()).default([]).transform(arr => arr.slice(0, 5)),
});

const KeyMomentsResponseSchema = z.object({
  moments: z.array(KeyMomentSchema).min(1).max(10),
});

class ClaudeError extends Error {
  constructor(
    message: string,
    public readonly transient: boolean,
    public readonly code?: string | number,
  ) {
    super(message);
    this.name = "ClaudeError";
  }
}

const anthropic = new Anthropic({
  apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY!,
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL!,
});

function buildTranscriptExcerpts(transcriptText: string, maxChars: number): string {
  const totalLength = transcriptText.length;
  
  if (totalLength <= maxChars) {
    return transcriptText;
  }
  
  const excerptSize = Math.floor(maxChars / 3);
  const beginning = transcriptText.slice(0, excerptSize);
  const middleStart = Math.floor(totalLength / 2) - Math.floor(excerptSize / 2);
  const middle = transcriptText.slice(middleStart, middleStart + excerptSize);
  const ending = transcriptText.slice(-excerptSize);
  
  return `[BEGINNING OF EPISODE]\n${beginning}\n\n[MIDDLE OF EPISODE - around ${Math.floor(middleStart / 1000)}k chars in]\n${middle}\n\n[END OF EPISODE]\n${ending}`;
}

function buildKeyMomentsPrompt(
  transcriptText: string,
  claims: { claimText: string; startTime: number; confidence: number }[],
  episodeTitle: string,
  podcastTitle: string,
  visibility: "featured" | "supporting"
): string {
  const targetCount = visibility === "featured" ? "6–8" : "3–5";
  
  const claimsSummary = claims
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 20)
    .map(c => `[${Math.floor(c.startTime / 60)}:${(c.startTime % 60).toString().padStart(2, '0')}] ${c.claimText}`)
    .join("\n");

  return `You are extracting KEY MOMENTS from a podcast episode.

A Key Moment must be grounded in a specific spoken statement from the transcript.
You are not summarizing.
You are identifying statements that caused insight.

HARD RULES (NON-NEGOTIABLE)

- Generate ${targetCount} moments
- Every moment MUST reference a real statement from the transcript
- Do NOT invent insights without a quoted statement
- Do NOT restate the insight as a quote
- Do NOT paraphrase abstractly
- "Why this matters" must add meaning beyond the quote
- Each moment must be 30–120 seconds
- Moments must not overlap by more than 10 seconds

If you cannot find a strong source statement, do not create a moment.
Quality > quantity.

FIELD INSTRUCTIONS

sourceStatement
- 1–2 sentences verbatim or lightly cleaned from transcript
- Must reflect what was actually said
- Can remove filler words but preserve meaning
- Must NOT contain interpretation

✅ Good sourceStatement:
"Every couple of months, the models unlock something they literally couldn't do before."

❌ Bad sourceStatement:
"AI progress is accelerating rapidly."

title
- 3–8 words
- Neutral, descriptive
- Names the idea, not the conclusion
- BANNED WORDS: framework, strategy, model, approach, shift, paradigm, methodology, optimization, dynamics, ecosystem, synergy, leverage

✅ Good title: "Rapid capability unlock cycles"
❌ Bad title: "Why AI changes everything"

whyThisMatters
- Answer: Why does this statement change how someone should think or act?
- Must NOT repeat the quote
- Must introduce implication
- 1–2 sentences max

✅ Good whyThisMatters:
"This reframes roadmap planning as reactive rather than predictive when building on fast-evolving models."

❌ Bad whyThisMatters:
"Shows that AI is changing quickly."

EPISODE CONTEXT:
Title: "${episodeTitle}"
Podcast: "${podcastTitle}"

TRANSCRIPT (excerpts):
${buildTranscriptExcerpts(transcriptText, 25000)}

KEY CLAIMS (top 20):
${claimsSummary}

OUTPUT FORMAT

Respond with ONLY valid JSON:

{
  "moments": [
    {
      "startTime": 0,
      "endTime": 0,
      "sourceStatement": "",
      "title": "",
      "whyThisMatters": "",
      "momentType": "insight | tactical | story | example | contradiction",
      "topics": ["topic1", "topic2"]
    }
  ]
}

momentType options:
- insight: A counterintuitive observation that reframes thinking
- tactical: Specific, actionable advice you can apply immediately
- story: A narrative that teaches a transferable lesson
- example: A concrete case that illustrates a broader principle
- contradiction: Challenges conventional wisdom or common beliefs

FINAL SELF-CHECK (MANDATORY)

Before responding, verify each moment:
1. Is the sourceStatement an actual quote from the transcript, not an interpretation?
2. Does the title name the idea without concluding it?
3. Does whyThisMatters add implication beyond what the quote says?
4. Would a listener bookmark this to replay and reference?

If any check fails, fix it or remove the moment.`;
}

interface MomentWithEmbedding {
  moment: z.infer<typeof KeyMomentSchema>;
  embedding: number[];
  combinedText: string;
}

async function deduplicateMoments(
  moments: z.infer<typeof KeyMomentSchema>[],
  similarityThreshold: number = 0.85
): Promise<z.infer<typeof KeyMomentSchema>[]> {
  if (moments.length <= 1) return moments;

  console.log(`[KEY-MOMENTS] Deduplicating ${moments.length} moments with threshold ${similarityThreshold}`);

  const momentsWithEmbeddings: MomentWithEmbedding[] = [];
  
  for (const moment of moments) {
    const combinedText = `${moment.title}. ${moment.whyThisMatters}`;
    try {
      const embedding = await getEmbeddingForText(combinedText);
      momentsWithEmbeddings.push({ moment, embedding, combinedText });
    } catch (err) {
      console.error(`[KEY-MOMENTS] Failed to embed moment "${moment.title}":`, err);
      momentsWithEmbeddings.push({ moment, embedding: [], combinedText });
    }
  }

  const validMoments = momentsWithEmbeddings.filter(m => m.embedding.length > 0);
  const invalidMoments = momentsWithEmbeddings.filter(m => m.embedding.length === 0);

  const keptIndices = new Set<number>();
  const droppedIndices = new Set<number>();

  for (let i = 0; i < validMoments.length; i++) {
    if (droppedIndices.has(i)) continue;
    
    keptIndices.add(i);
    
    for (let j = i + 1; j < validMoments.length; j++) {
      if (droppedIndices.has(j)) continue;
      
      const similarity = cosineSimilarity(validMoments[i].embedding, validMoments[j].embedding);
      
      if (similarity > similarityThreshold) {
        console.log(`[KEY-MOMENTS] Dropping duplicate (similarity ${similarity.toFixed(3)}): "${validMoments[j].moment.title}" (similar to "${validMoments[i].moment.title}")`);
        droppedIndices.add(j);
      }
    }
  }

  const result = [
    ...Array.from(keptIndices).map(i => validMoments[i].moment),
    ...invalidMoments.map(m => m.moment),
  ];

  console.log(`[KEY-MOMENTS] Kept ${result.length} moments after deduplication (dropped ${droppedIndices.size})`);
  
  return result;
}

export async function handleGenerateKeyMomentsJob(
  job: Job,
  onProgress?: (message: string, percentage: number) => void
): Promise<KeyMomentGenerationResult> {
  console.log(`[KEY-MOMENTS] Starting key moments generation job ${job.id}`);

  if (!job.episodeSourceId) {
    throw new ClaudeError(`Job ${job.id} has no episodeSourceId`, false, "INVALID_INPUT");
  }

  const source = await storage.getEpisodeSource(job.episodeSourceId);
  if (!source) {
    throw new ClaudeError(`Episode source not found: ${job.episodeSourceId}`, false, "NOT_FOUND");
  }

  const episode = await storage.getEpisode(source.episodeId);
  if (!episode) {
    throw new ClaudeError(`Episode not found for source: ${job.episodeSourceId}`, false, "NOT_FOUND");
  }

  if (episode.sourceType === "zoom") {
    console.log(`[KEY-MOMENTS] Skipping Zoom episode ${episode.id} (use analyze_zoom_call job instead)`);
    return { momentsGenerated: 0, episodeId: episode.id };
  }

  const podcast = episode.podcastId ? await storage.getPodcast(episode.podcastId) : null;

  onProgress?.("Checking eligibility...", 5);

  if (episode.transcriptStatus !== "ready") {
    console.log(`[KEY-MOMENTS] Episode ${episode.id} transcript not ready, skipping`);
    return { momentsGenerated: 0, episodeId: episode.id };
  }

  const visibility = (episode as any).visibility || "backlog";
  if (visibility === "backlog") {
    console.log(`[KEY-MOMENTS] Episode ${episode.id} is backlog tier, skipping`);
    return { momentsGenerated: 0, episodeId: episode.id };
  }

  const existingMoments = await storage.getViralMomentsByEpisode(episode.id);
  if (existingMoments.length > 0) {
    console.log(`[KEY-MOMENTS] Episode ${episode.id} already has ${existingMoments.length} moments, skipping`);
    return { momentsGenerated: existingMoments.length, episodeId: episode.id };
  }

  const claims = await storage.getClaimsByEpisodeId(episode.id);
  if (claims.length < 10) {
    console.log(`[KEY-MOMENTS] Episode ${episode.id} has only ${claims.length} claims (need ≥10), skipping`);
    return { momentsGenerated: 0, episodeId: episode.id };
  }

  onProgress?.("Loading transcript segments...", 15);

  const segments = await storage.getSegmentsByEpisode(episode.id);
  if (segments.length === 0) {
    console.log(`[KEY-MOMENTS] No transcript segments found for episode ${episode.id}`);
    return { momentsGenerated: 0, episodeId: episode.id };
  }

  const sortedSegments = segments.sort((a, b) => a.startTime - b.startTime);
  const transcriptText = sortedSegments.map(s => s.text).join(" ");

  onProgress?.("Analyzing transcript with Claude...", 30);

  const prompt = buildKeyMomentsPrompt(
    transcriptText,
    claims.map((c: EpisodeClaim) => ({
      claimText: c.claimText,
      startTime: c.startTime,
      confidence: c.confidence,
    })),
    episode.title || "Untitled Episode",
    podcast?.title || "Unknown Podcast",
    visibility as "featured" | "supporting"
  );

  let response: string;
  try {
    console.log(`[KEY-MOMENTS] Calling Claude claude-sonnet-4-5 with prompt length: ${prompt.length} chars`);
    
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 8192,
      temperature: 0.2,
      messages: [
        { role: "user", content: prompt }
      ],
    });

    const textBlock = message.content.find(block => block.type === "text");
    response = textBlock?.type === "text" ? textBlock.text : "";
    
    console.log(`[KEY-MOMENTS] Claude response length: ${response.length} chars`);
  } catch (error: any) {
    console.error(`[KEY-MOMENTS] Claude API failed:`, error);
    const isTransient = error.status === 429 || error.status >= 500;
    throw new ClaudeError(error.message || "Claude API call failed", isTransient, error.status);
  }

  onProgress?.("Parsing AI response...", 70);

  let parsed: z.infer<typeof KeyMomentsResponseSchema>;
  try {
    let cleanedResponse = response
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    
    const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error(`[KEY-MOMENTS] No JSON found in response: ${response.substring(0, 500)}`);
      throw new ClaudeError("No JSON found in response", true, "INVALID_RESPONSE");
    }
    
    let jsonStr = jsonMatch[0]
      .replace(/,\s*]/g, "]")
      .replace(/,\s*}/g, "}")
      .replace(/[\x00-\x1f]/g, " ")
      .replace(/\n/g, " ")
      .replace(/\r/g, "")
      .replace(/\t/g, " ");
    
    parsed = KeyMomentsResponseSchema.parse(JSON.parse(jsonStr));
  } catch (error) {
    console.error(`[KEY-MOMENTS] Failed to parse AI response:`, error);
    console.error(`[KEY-MOMENTS] Raw response (first 1000 chars): ${response.substring(0, 1000)}`);
    throw new ClaudeError(`Invalid AI response format: ${error}`, true, "INVALID_RESPONSE");
  }

  const totalDuration = episode.duration || Math.max(...segments.map(s => s.endTime));
  
  let validMoments = parsed.moments.filter(m => {
    const duration = m.endTime - m.startTime;
    return (
      m.startTime >= 0 && 
      m.endTime <= totalDuration + 60 &&
      m.endTime > m.startTime &&
      duration >= 30 &&
      duration <= 120
    );
  });

  onProgress?.("Removing duplicates...", 80);

  validMoments = await deduplicateMoments(validMoments, 0.85);

  onProgress?.("Saving key moments...", 90);

  const momentInserts: InsertViralMoment[] = validMoments.map((m, idx) => ({
    episodeId: episode.id,
    momentKind: "key",
    startTime: m.startTime,
    endTime: m.endTime,
    text: m.whyThisMatters,
    viralityScore: null,
    hookReason: m.whyThisMatters,
    suggestedTitle: m.title,
    pullQuote: m.sourceStatement,
    contentType: m.momentType,
    topics: m.topics,
    displayOrder: idx,
    clipStatus: null,
  }));

  if (momentInserts.length > 0) {
    await storage.createViralMoments(momentInserts);
  }

  onProgress?.("Complete!", 100);

  console.log(`[KEY-MOMENTS] Generated ${momentInserts.length} key moments for episode ${episode.id}`);

  return { momentsGenerated: momentInserts.length, episodeId: episode.id };
}
