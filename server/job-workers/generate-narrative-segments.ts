import { storage } from "../storage";
import { callGeminiJson, GeminiError } from "../ai/geminiClient";
import { z } from "zod";
import type { Job, InsertEpisodeSegment, TranscriptSegment } from "@shared/schema";

export interface NarrativeGenerationResult {
  segmentsGenerated: number;
  episodeId: string;
}

const EvidenceSchema = z.object({
  type: z.enum(["quote", "claim"]),
  text: z.string().min(5).transform(s => s.slice(0, 300).trim()),
  timestamp: z.string(),
});

const NarrativeSegmentSchema = z.object({
  label: z.enum([
    "Setup",
    "Context",
    "Deep Dive",
    "Framework",
    "Core Insight",
    "Implications",
    "Takeaway",
  ]),
  startTime: z.number().int().nonnegative(),
  endTime: z.number().int().nonnegative(),
  title: z.string().min(3).transform(s => s.slice(0, 80).trim()),
  summary: z.string().min(10).transform(s => s.slice(0, 500).trim()),
  evidence: z.array(EvidenceSchema).min(1).transform(arr => arr.slice(0, 3)),
});

const NarrativeResponseSchema = z.object({
  segments: z.array(NarrativeSegmentSchema).min(3).transform(arr => arr.slice(0, 6)),
});

function sanitizeGeminiResponse(raw: unknown): { segments: unknown[] } {
  if (Array.isArray(raw)) {
    console.log(`[GENERATE-NARRATIVE] Wrapping bare array response into {segments: [...]}`);
    return { segments: raw };
  }
  if (raw && typeof raw === 'object' && 'segments' in raw) {
    return raw as { segments: unknown[] };
  }
  throw new Error('Invalid response structure: expected object with segments array');
}

type NarrativeSegment = z.infer<typeof NarrativeSegmentSchema>;
type Evidence = z.infer<typeof EvidenceSchema>;

interface TranscriptWindow {
  startTime: number;
  endTime: number;
  text: string;
}

interface ClaimForPrompt {
  startTime: number;
  endTime: number | null;
  confidence: number;
  claimType: string;
  claimText: string;
}

interface KeyMomentForPrompt {
  startTime: number;
  endTime: number;
  title: string;
  sourceStatement: string;
}

function calculateSegmentCount(durationMinutes: number): number {
  if (durationMinutes < 75) return 4;
  if (durationMinutes <= 100) return 5;
  return 6;
}

export async function handleGenerateNarrativeSegmentsJob(
  job: Job,
  onProgress?: (message: string, percentage: number) => void
): Promise<NarrativeGenerationResult> {
  console.log(`[GENERATE-NARRATIVE] Starting narrative generation job ${job.id}`);

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

  if (episode.sourceType === "zoom") {
    console.log(`[GENERATE-NARRATIVE] Skipping Zoom episode ${episode.id} (use analyze_zoom_call job instead)`);
    return { segmentsGenerated: 0, episodeId: source.episodeId };
  }

  const podcast = episode.podcastId ? await storage.getPodcast(episode.podcastId) : null;

  onProgress?.("Loading transcript segments...", 10);

  const transcriptSegments = await storage.getSegmentsByEpisode(source.episodeId);
  if (transcriptSegments.length === 0) {
    console.log(`[GENERATE-NARRATIVE] No transcript segments found for episode ${source.episodeId}`);
    return { segmentsGenerated: 0, episodeId: source.episodeId };
  }

  const durationSeconds = (episode as any).durationSeconds || Math.max(...transcriptSegments.map(s => s.endTime));
  const durationMinutes = Math.round(durationSeconds / 60);
  const segmentCount = calculateSegmentCount(durationMinutes);
  console.log(`[GENERATE-NARRATIVE] Episode duration: ${durationMinutes} minutes, target segments: ${segmentCount}`);

  onProgress?.("Loading claims...", 20);

  const claims = await storage.getClaimsByEpisodeId(source.episodeId);
  console.log(`[GENERATE-NARRATIVE] Found ${claims.length} claims`);

  onProgress?.("Loading key moments...", 25);

  const keyMoments = await storage.getViralMomentsByEpisode(source.episodeId);
  const keyMomentsFiltered = keyMoments.filter((m: any) => m.momentKind === 'key');
  console.log(`[GENERATE-NARRATIVE] Found ${keyMomentsFiltered.length} key moments`);

  onProgress?.("Selecting transcript windows...", 30);

  const transcriptWindows = selectTranscriptWindows(transcriptSegments, claims, durationSeconds);
  console.log(`[GENERATE-NARRATIVE] Selected ${transcriptWindows.length} transcript windows`);

  const claimsForPrompt = selectClaimsForPrompt(claims, 40);
  console.log(`[GENERATE-NARRATIVE] Selected ${claimsForPrompt.length} claims for prompt`);

  const keyMomentsForPrompt: KeyMomentForPrompt[] = keyMomentsFiltered.slice(0, 10).map((m: any) => ({
    startTime: m.startTime,
    endTime: m.endTime,
    title: m.suggestedTitle || '',
    sourceStatement: m.pullQuote || '',
  }));

  onProgress?.("Generating narrative map with AI...", 50);

  const prompt = buildNarrativePromptV2({
    episodeTitle: episode.title,
    podcastTitle: podcast?.title || "Unknown Podcast",
    durationSeconds,
    durationMinutes,
    segmentCount,
    transcriptWindows,
    claims: claimsForPrompt,
    keyMoments: keyMomentsForPrompt,
  });

  let response: z.infer<typeof NarrativeResponseSchema>;
  
  try {
    response = await callGeminiJson(
      "gemini-2.5-flash",
      prompt,
      NarrativeResponseSchema,
      { maxOutputTokens: 6000, temperature: 0.2 }
    );
  } catch (error: any) {
    console.log(`[GENERATE-NARRATIVE] First attempt failed, retrying with grounding reminder...`);
    const retryPrompt = prompt + "\n\nCRITICAL: Each segment MUST have at least one evidence item with a verbatim quote (10+ words) from the transcript. If you cannot ground a segment, merge it with an adjacent segment.";
    response = await callGeminiJson(
      "gemini-2.5-flash",
      retryPrompt,
      NarrativeResponseSchema,
      { maxOutputTokens: 6000, temperature: 0.15 }
    );
  }

  onProgress?.("Validating narrative segments...", 70);

  const validationResult = validateNarrativeSegmentsV2(response.segments, durationSeconds);
  
  if (!validationResult.valid) {
    console.log(`[GENERATE-NARRATIVE] Validation failed: ${validationResult.errors.join(', ')}`);
    throw new GeminiError(`Narrative validation failed: ${validationResult.errors.join(', ')}`, true, "VALIDATION_ERROR");
  }

  const validatedSegments = validationResult.segments;
  console.log(`[GENERATE-NARRATIVE] Validated ${validatedSegments.length} segments`);

  onProgress?.("Saving narrative segments to database...", 85);

  await deleteExistingNarrativeSegments(source.episodeId);

  const segmentInserts: InsertEpisodeSegment[] = validatedSegments.map((seg, idx) => ({
    episodeId: source.episodeId,
    startTime: seg.startTime,
    endTime: seg.endTime,
    label: seg.label,
    title: seg.title,
    summary: seg.summary,
    segmentType: "narrative",
    displayOrder: idx,
    isAiGenerated: true,
    topics: [],
    evidence: seg.evidence,
  }));

  if (segmentInserts.length > 0) {
    await storage.createEpisodeSegments(segmentInserts);
  }

  onProgress?.("Narrative generation complete", 100);
  console.log(`[GENERATE-NARRATIVE] Successfully generated ${segmentInserts.length} narrative segments for episode ${source.episodeId}`);

  return { segmentsGenerated: segmentInserts.length, episodeId: source.episodeId };
}

function selectTranscriptWindows(
  segments: TranscriptSegment[],
  claims: any[],
  durationSeconds: number
): TranscriptWindow[] {
  const windows: TranscriptWindow[] = [];
  const WINDOW_DURATION = 120;

  const firstWindow = extractWindowAt(segments, 0, WINDOW_DURATION);
  if (firstWindow) windows.push(firstWindow);

  const lastWindowStart = Math.max(0, durationSeconds - 180);
  const lastWindow = extractWindowAt(segments, lastWindowStart, 180);
  if (lastWindow) windows.push(lastWindow);

  const NUM_BUCKETS = 10;
  const bucketDuration = durationSeconds / NUM_BUCKETS;

  for (let i = 0; i < NUM_BUCKETS; i++) {
    const bucketCenter = (i + 0.5) * bucketDuration;
    const windowStart = Math.max(0, bucketCenter - WINDOW_DURATION / 2);
    
    if (windowStart > 180 && windowStart < lastWindowStart - WINDOW_DURATION) {
      const window = extractWindowAt(segments, windowStart, WINDOW_DURATION);
      if (window) windows.push(window);
    }
  }

  if (claims.length > 0) {
    const claimsByBucket: Map<number, any[]> = new Map();
    
    for (const claim of claims) {
      const bucketIdx = Math.floor(claim.startTime / bucketDuration);
      if (!claimsByBucket.has(bucketIdx)) {
        claimsByBucket.set(bucketIdx, []);
      }
      claimsByBucket.get(bucketIdx)!.push(claim);
    }

    const sortedBuckets = Array.from(claimsByBucket.entries())
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 4);

    for (const [bucketIdx, bucketClaims] of sortedBuckets) {
      const avgTime = bucketClaims.reduce((sum: number, c: any) => sum + c.startTime, 0) / bucketClaims.length;
      const windowStart = Math.max(0, avgTime - WINDOW_DURATION / 2);
      
      const alreadyCovered = windows.some(w => 
        Math.abs(w.startTime - windowStart) < WINDOW_DURATION / 2
      );
      
      if (!alreadyCovered) {
        const window = extractWindowAt(segments, windowStart, WINDOW_DURATION);
        if (window) windows.push(window);
      }
    }
  }

  return windows.sort((a, b) => a.startTime - b.startTime);
}

function extractWindowAt(
  segments: TranscriptSegment[],
  startTime: number,
  duration: number
): TranscriptWindow | null {
  const endTime = startTime + duration;
  
  const relevantSegments = segments.filter(
    s => s.startTime < endTime && s.endTime > startTime
  );

  if (relevantSegments.length === 0) return null;

  const text = relevantSegments
    .map(s => s.text)
    .join(" ")
    .slice(0, 2500);

  return {
    startTime: Math.floor(startTime),
    endTime: Math.floor(endTime),
    text,
  };
}

function selectClaimsForPrompt(claims: any[], maxClaims: number): ClaimForPrompt[] {
  const sorted = [...claims].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));

  const selected: ClaimForPrompt[] = [];
  const timeSpacing = 30;

  for (const claim of sorted) {
    if (selected.length >= maxClaims) break;

    const tooClose = selected.some(
      s => Math.abs(s.startTime - claim.startTime) < timeSpacing
    );

    if (!tooClose || selected.length < maxClaims / 2) {
      selected.push({
        startTime: claim.startTime,
        endTime: claim.endTime,
        confidence: claim.confidence ?? 0.5,
        claimType: claim.claimType || "claim",
        claimText: claim.claimText,
      });
    }
  }

  return selected.sort((a, b) => a.startTime - b.startTime);
}

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function buildNarrativePromptV2(params: {
  episodeTitle: string;
  podcastTitle: string;
  durationSeconds: number;
  durationMinutes: number;
  segmentCount: number;
  transcriptWindows: TranscriptWindow[];
  claims: ClaimForPrompt[];
  keyMoments: KeyMomentForPrompt[];
}): string {
  const systemMessage = `You are analyzing a long-form podcast episode to produce a Narrative Map — a structured breakdown of how the episode unfolds over time.

This is not a summary.
This is not an opinionated rewrite.
This is a grounded narrative scaffold that helps readers understand how the conversation progresses and why each phase matters.

EPISODE CONTEXT
Episode title: ${params.episodeTitle}
Podcast: ${params.podcastTitle}
Duration: ${params.durationMinutes} minutes

OBJECTIVE
Generate a Narrative Map consisting of ${params.segmentCount} segments that:
- Follow the chronological flow of the conversation
- Capture distinct phases (setup → exploration → insight → implications)
- Are grounded in what was actually said
- Reference real claims or quotes (no invention, no abstraction)

SEGMENT RULES (CRITICAL)
Each segment MUST:
- Cover a non-overlapping time range
- Be 5–25 minutes long (flexible, but no micro-segments)
- Represent a clear shift in topic, depth, or intent
- Be written in neutral, descriptive language
- Avoid buzzwords, hype, or moralizing tone
- Be understandable to someone who has not listened to the episode

GROUNDING REQUIREMENTS (NON-NEGOTIABLE)
For each segment, include 1–2 grounding anchors, chosen from:
- A verbatim quote (10+ words) from the transcript
- OR a specific claim reference (by timestamp or paraphrase tied to a claim)

If you cannot ground a segment in real dialogue, do not invent one — merge with an adjacent segment instead.

SEGMENT LABELING
Use one of the following labels per segment:
- Setup
- Context
- Deep Dive
- Framework
- Core Insight
- Implications
- Takeaway

(Do not reuse the same label more than twice.)

OUTPUT FORMAT (STRICT JSON ONLY)
Return ONLY valid JSON matching this schema:
{
  "segments": [
    {
      "label": "Setup | Context | Deep Dive | Framework | Core Insight | Implications | Takeaway",
      "startTime": <integer seconds>,
      "endTime": <integer seconds>,
      "title": "<5–9 word neutral chapter-style title>",
      "summary": "<2–3 sentences explaining what is discussed and why this phase matters>",
      "evidence": [
        {
          "type": "quote | claim",
          "text": "<verbatim quote OR grounded claim paraphrase>",
          "timestamp": "<mm:ss>"
        }
      ]
    }
  ]
}

STYLE CONSTRAINTS (VERY IMPORTANT)
❌ No "reveals why", "highlights how", "shows that" filler
❌ No motivational language
❌ No forward-looking speculation
❌ No repetition of titles inside summaries
✅ Treat this like chapter notes for serious readers
✅ Prefer clarity over cleverness

FAILURE CONDITIONS (DO NOT DO THESE)
If you:
- Invent facts
- Repeat the same idea across segments
- Produce generic summaries that could apply to any episode
- Fail to include grounding evidence
→ the output is invalid.`;

  const transcriptWindowsText = params.transcriptWindows
    .map(w => `[${formatTimestamp(w.startTime)} - ${formatTimestamp(w.endTime)}]\n${w.text}`)
    .join("\n\n");

  const claimsText = params.claims.length > 0 
    ? params.claims
        .map(c => `[${formatTimestamp(c.startTime)}] ${c.claimText}`)
        .join("\n")
    : "(No claims extracted)";

  const keyMomentsText = params.keyMoments.length > 0
    ? params.keyMoments
        .map(m => `[${formatTimestamp(m.startTime)}] "${m.sourceStatement}" → ${m.title}`)
        .join("\n")
    : "(No key moments available)";

  const userMessage = `TRANSCRIPT WINDOWS (chronological excerpts):
${transcriptWindowsText}

KEY CLAIMS (with timestamps):
${claimsText}

KEY MOMENTS (with source quotes):
${keyMomentsText}

TASK
Generate exactly ${params.segmentCount} narrative segments following all rules above.
Total episode duration: ${params.durationSeconds} seconds.

OUTPUT JSON ONLY - no markdown, no explanation.`;

  return `${systemMessage}\n\n${userMessage}`;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  segments: NarrativeSegment[];
}

function validateNarrativeSegmentsV2(
  segments: NarrativeSegment[],
  durationSeconds: number
): ValidationResult {
  const errors: string[] = [];
  
  if (segments.length < 4 || segments.length > 6) {
    errors.push(`Invalid segment count: ${segments.length} (expected 4-6)`);
  }

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    
    if (!seg.evidence || seg.evidence.length === 0) {
      errors.push(`Segment ${i + 1} ("${seg.title}") has no evidence`);
    } else {
      for (const ev of seg.evidence) {
        if (ev.text.length < 10) {
          errors.push(`Segment ${i + 1} has evidence too short: "${ev.text.slice(0, 20)}..."`);
        }
      }
    }
  }

  const titles = segments.map(s => s.title.toLowerCase().trim());
  const uniqueTitles = new Set(titles);
  if (uniqueTitles.size !== titles.length) {
    errors.push("Duplicate titles detected");
  }

  for (let i = 1; i < segments.length; i++) {
    if (segments[i].startTime < segments[i - 1].endTime - 5) {
      errors.push(`Overlapping time ranges between segment ${i} and ${i + 1}`);
    }
  }

  const validated: NarrativeSegment[] = segments.map(seg => ({
    ...seg,
    startTime: Math.max(0, Math.min(seg.startTime, durationSeconds)),
    endTime: Math.max(0, Math.min(seg.endTime, durationSeconds)),
  }));

  for (let i = 0; i < validated.length; i++) {
    if (validated[i].endTime <= validated[i].startTime) {
      validated[i].endTime = Math.min(
        validated[i].startTime + 300,
        durationSeconds
      );
    }
  }

  if (validated.length > 0 && validated[0].startTime > 60) {
    validated[0].startTime = 0;
  }

  validated.sort((a, b) => a.startTime - b.startTime);

  for (let i = 1; i < validated.length; i++) {
    if (validated[i].startTime < validated[i - 1].endTime) {
      validated[i].startTime = validated[i - 1].endTime;
      if (validated[i].startTime >= validated[i].endTime) {
        validated[i].endTime = validated[i].startTime + 60;
      }
    }
  }

  if (validated.length > 0) {
    const lastSeg = validated[validated.length - 1];
    if (durationSeconds - lastSeg.endTime > 120) {
      lastSeg.endTime = durationSeconds;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    segments: validated,
  };
}

async function deleteExistingNarrativeSegments(episodeId: string): Promise<void> {
  const existingSegments = await storage.getEpisodeSegmentsByEpisode(episodeId);
  const narrativeSegments = existingSegments.filter(s => s.segmentType === "narrative");
  
  for (const seg of narrativeSegments) {
    await storage.deleteEpisodeSegment(seg.id);
  }
  
  console.log(`[GENERATE-NARRATIVE] Deleted ${narrativeSegments.length} existing narrative segments`);
}
