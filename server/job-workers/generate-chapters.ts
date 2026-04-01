import { storage } from "../storage";
import { callGeminiJson, GeminiError } from "../ai/geminiClient";
import { z } from "zod";
import type { Job, InsertEpisodeChapter, TranscriptSegment } from "@shared/schema";

export interface ChapterGenerationResult {
  chaptersGenerated: number;
  episodeId: string;
}

const AiChapterSchema = z.object({
  title: z.string().min(1).max(500),
  summary: z.string().min(1).max(2000),
  startSeconds: z.number().int().nonnegative(),
  endSeconds: z.number().int().nonnegative().optional(),
  confidence: z.number().min(0).max(1).default(0.85),
});

const AiChaptersResponseSchema = z.object({
  chapters: z.array(AiChapterSchema),
});

const MIN_CHAPTER_SPACING_SECONDS = 240;
const MIN_CHAPTERS = 8;
const MAX_CHAPTERS = 15;

export async function handleGenerateChaptersJob(
  job: Job,
  onProgress?: (message: string, percentage: number) => void
): Promise<ChapterGenerationResult> {
  console.log(`[GENERATE-CHAPTERS] Starting chapter generation job ${job.id}`);

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
    console.log(`[GENERATE-CHAPTERS] No transcript segments found for episode ${source.episodeId}`);
    return { chaptersGenerated: 0, episodeId: source.episodeId };
  }

  const totalDuration = Math.max(...segments.map(s => s.endTime));
  console.log(`[GENERATE-CHAPTERS] Episode has ${segments.length} segments, ~${Math.round(totalDuration / 60)} minutes`);

  onProgress?.("Clustering segments into windows...", 20);

  const windows = groupIntoChapterWindows(segments);
  console.log(`[GENERATE-CHAPTERS] Created ${windows.length} windows for analysis`);

  onProgress?.("Generating chapter titles with AI...", 40);

  const prompt = buildChapterPrompt(windows, {
    title: episode.title,
    showName: podcast?.title || "Unknown Podcast",
    description: episode.description || "",
    totalDurationMinutes: Math.round(totalDuration / 60),
  });

  const response = await callGeminiJson(
    "gemini-2.5-flash",
    prompt,
    AiChaptersResponseSchema,
    { maxOutputTokens: 4096, temperature: 0.3 }
  );

  let chapters = response.chapters;
  console.log(`[GENERATE-CHAPTERS] AI returned ${chapters.length} chapters`);

  onProgress?.("Validating and filtering chapters...", 70);

  chapters = validateAndFilterChapters(chapters, totalDuration);
  console.log(`[GENERATE-CHAPTERS] After filtering: ${chapters.length} chapters`);

  const minDurationForFullChapters = MIN_CHAPTERS * MIN_CHAPTER_SPACING_SECONDS;
  if (chapters.length < MIN_CHAPTERS) {
    if (totalDuration < minDurationForFullChapters) {
      console.log(`[GENERATE-CHAPTERS] Episode is short (${Math.round(totalDuration / 60)}min), ${chapters.length} chapters is acceptable`);
    } else {
      console.warn(`[GENERATE-CHAPTERS] Warning: Only ${chapters.length} chapters after filtering (expected ${MIN_CHAPTERS}-${MAX_CHAPTERS})`);
    }
  }

  onProgress?.("Saving chapters to database...", 85);

  await storage.deleteEpisodeChaptersByEpisode(source.episodeId);

  const chapterInserts: InsertEpisodeChapter[] = chapters.map((ch, idx) => ({
    episodeId: source.episodeId,
    startTime: ch.startSeconds,
    endTime: ch.endSeconds ?? ch.startSeconds + 300,
    title: ch.title.slice(0, 60),
    summary: ch.summary.length > 200 ? ch.summary.slice(0, 197) + "..." : ch.summary,
    confidence: ch.confidence ?? 0.85,
    displayOrder: idx,
  }));

  if (chapterInserts.length > 0) {
    await storage.createEpisodeChapters(chapterInserts);
  }

  onProgress?.("Chapter generation complete", 100);
  console.log(`[GENERATE-CHAPTERS] Successfully generated ${chapterInserts.length} chapters for episode ${source.episodeId}`);

  return { chaptersGenerated: chapterInserts.length, episodeId: source.episodeId };
}

interface ChapterWindow {
  startTime: number;
  endTime: number;
  text: string;
  speakers: string[];
}

function groupIntoChapterWindows(segments: TranscriptSegment[]): ChapterWindow[] {
  if (segments.length === 0) return [];

  const WINDOW_SECONDS = 300;
  const windows: ChapterWindow[] = [];
  let currentWindow: TranscriptSegment[] = [];
  let windowStart = segments[0].startTime;

  for (const segment of segments) {
    if (segment.startTime - windowStart >= WINDOW_SECONDS && currentWindow.length > 0) {
      windows.push(createWindow(currentWindow));
      currentWindow = [segment];
      windowStart = segment.startTime;
    } else {
      currentWindow.push(segment);
    }
  }

  if (currentWindow.length > 0) {
    windows.push(createWindow(currentWindow));
  }

  return windows;
}

function createWindow(segments: TranscriptSegment[]): ChapterWindow {
  const combinedText = segments.map(s => s.text).join(" ");
  const speakerSet = new Set(segments.filter(s => s.speaker).map(s => s.speaker as string));

  return {
    startTime: segments[0].startTime,
    endTime: segments[segments.length - 1].endTime,
    text: combinedText.substring(0, 2500),
    speakers: Array.from(speakerSet),
  };
}

interface EpisodeContext {
  title: string;
  showName: string;
  description: string;
  totalDurationMinutes: number;
}

function buildChapterPrompt(windows: ChapterWindow[], context: EpisodeContext): string {
  const windowsPayload = windows.map((w, i) => ({
    window_id: i,
    start_seconds: Math.round(w.startTime),
    end_seconds: Math.round(w.endTime),
    speakers: w.speakers,
    text_excerpt: w.text,
  }));

  return `You are the PodDNA Chapter Generator.

TASK: Create ${MIN_CHAPTERS}-${MAX_CHAPTERS} navigation chapters for this podcast episode.

CHAPTER TITLE RULES (CRITICAL):
- 3-9 words per title
- Focus on the TOPIC being discussed, not who is speaking
- No timestamps, speaker names, or filler words
- No clickbait, emojis, or ALL CAPS
- Avoid generic titles like "Discussion", "Conversation", "Talk"
- Each title should be unique and descriptive

CHAPTER FILTERING RULES:
- SKIP intro greetings, housekeeping, ads, sponsor segments, outros
- Only create chapters for substantive content
- Chapters must be at least 4 minutes apart

SUMMARY RULES:
- 1-2 sentences describing what's discussed
- Focus on key points or insights mentioned
- No speaker names in summary

EPISODE CONTEXT:
Show: "${context.showName}"
Episode: "${context.title}"
Description: "${context.description}"
Duration: ~${context.totalDurationMinutes} minutes

TRANSCRIPT WINDOWS:
${JSON.stringify(windowsPayload, null, 2)}

OUTPUT: Return ONLY valid JSON (no markdown, no extra text):
{
  "chapters": [
    {
      "title": "Topic Title Here",
      "summary": "Brief description of what is discussed in this section.",
      "startSeconds": 0,
      "endSeconds": 300,
      "confidence": 0.9
    }
  ]
}`;
}

function validateAndFilterChapters(
  chapters: Array<{ title: string; summary: string; startSeconds: number; endSeconds?: number; confidence?: number }>,
  totalDuration: number
): Array<{ title: string; summary: string; startSeconds: number; endSeconds?: number; confidence?: number }> {
  let filtered = chapters.filter(ch => {
    if (ch.startSeconds < 0 || ch.startSeconds > totalDuration) return false;
    const end = ch.endSeconds ?? ch.startSeconds + 300;
    if (end < ch.startSeconds) return false;
    if (!ch.title || ch.title.length < 3) return false;
    
    const lowerTitle = ch.title.toLowerCase();
    const skipPatterns = [
      /^intro$/i,
      /^outro$/i,
      /^ad\s+break/i,
      /^sponsor/i,
      /^housekeeping/i,
      /^opening/i,
      /^closing/i,
      /^wrap[\s-]?up/i,
    ];
    
    for (const pattern of skipPatterns) {
      if (pattern.test(lowerTitle)) return false;
    }
    
    return true;
  });

  filtered.sort((a, b) => a.startSeconds - b.startSeconds);

  const spaced: typeof filtered = [];
  let lastEndTime = -MIN_CHAPTER_SPACING_SECONDS;

  for (const ch of filtered) {
    if (ch.startSeconds - lastEndTime >= MIN_CHAPTER_SPACING_SECONDS) {
      spaced.push(ch);
      lastEndTime = ch.startSeconds;
    }
  }

  if (spaced.length > MAX_CHAPTERS) {
    spaced.splice(MAX_CHAPTERS);
  }

  return spaced;
}
