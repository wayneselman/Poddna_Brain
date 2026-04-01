import { AssemblyAI, Transcript, TranscriptUtterance } from "assemblyai";
import type { TranscriptSegment, TranscriptionProgress, TranscriptionResult, ProgressCallback } from "./transcription";

const client = new AssemblyAI({
  apiKey: process.env.ASSEMBLYAI_API_KEY || "",
});

export interface AssemblyTranscriptionOptions {
  speakerLabels?: boolean;
  knownSpeakers?: string[];
  podcastTitle?: string;
  speakersExpected?: number;
  // Audio Intelligence features
  autoChapters?: boolean;
  entityDetection?: boolean;
  topicDetection?: boolean;  // IAB categories
  keyPhrases?: boolean;      // auto_highlights
}

export interface AssemblyJobStatus {
  jobId: string;
  status: "queued" | "processing" | "completed" | "error";
  transcript?: Transcript;
  error?: string;
}

export async function submitTranscriptionJob(
  audioUrl: string,
  options: AssemblyTranscriptionOptions = {}
): Promise<{ jobId: string }> {
  console.log(`[ASSEMBLY] Submitting transcription job for: ${audioUrl}`);
  
  if (!process.env.ASSEMBLYAI_API_KEY) {
    throw new Error("ASSEMBLYAI_API_KEY is not configured");
  }

  const transcriptConfig: any = {
    audio_url: audioUrl,
    speaker_labels: options.speakerLabels !== false,
    language_detection: true,
  };

  // Add speakers_expected if provided (helps diarization accuracy)
  if (options.speakersExpected && options.speakersExpected > 1) {
    transcriptConfig.speakers_expected = options.speakersExpected;
    console.log(`[ASSEMBLY] Expecting ${options.speakersExpected} speakers`);
  }

  // Audio Intelligence features (add $0.08/hour each)
  if (options.autoChapters !== false) {
    transcriptConfig.auto_chapters = true;
    console.log(`[ASSEMBLY] Enabled auto_chapters`);
  }
  if (options.entityDetection !== false) {
    transcriptConfig.entity_detection = true;
    console.log(`[ASSEMBLY] Enabled entity_detection`);
  }
  if (options.topicDetection !== false) {
    transcriptConfig.iab_categories = true;
    console.log(`[ASSEMBLY] Enabled iab_categories (topic detection)`);
  }
  if (options.keyPhrases !== false) {
    transcriptConfig.auto_highlights = true;
    console.log(`[ASSEMBLY] Enabled auto_highlights (key phrases)`);
  }

  const transcript = await client.transcripts.submit(transcriptConfig);

  console.log(`[ASSEMBLY] Job submitted: ${transcript.id}`);
  return { jobId: transcript.id };
}

export async function checkJobStatus(jobId: string): Promise<AssemblyJobStatus> {
  const transcript = await client.transcripts.get(jobId);
  
  if (transcript.status === "error") {
    return {
      jobId,
      status: "error",
      error: transcript.error || "Unknown transcription error",
    };
  }
  
  if (transcript.status === "completed") {
    return {
      jobId,
      status: "completed",
      transcript,
    };
  }
  
  return {
    jobId,
    status: transcript.status === "queued" ? "queued" : "processing",
  };
}

// Fetch sentences with accurate timestamps from AssemblyAI
export async function fetchSentences(jobId: string): Promise<Array<{
  text: string;
  start: number;
  end: number;
  confidence: number;
}>> {
  // Use the SDK's built-in sentences endpoint
  const sentences = await client.transcripts.sentences(jobId);
  return sentences.sentences;
}

// Fetch paragraphs with accurate timestamps from AssemblyAI
export async function fetchParagraphs(jobId: string): Promise<Array<{
  text: string;
  start: number;
  end: number;
  confidence: number;
}>> {
  // Use the SDK's built-in paragraphs endpoint
  const paragraphs = await client.transcripts.paragraphs(jobId);
  return paragraphs.paragraphs;
}

export async function pollUntilComplete(
  jobId: string,
  onProgress?: ProgressCallback,
  pollIntervalMs: number = 5000,
  maxWaitMs: number = 30 * 60 * 1000
): Promise<Transcript> {
  const startTime = Date.now();
  let lastStatus = "";

  while (Date.now() - startTime < maxWaitMs) {
    const status = await checkJobStatus(jobId);
    
    if (status.status === "error") {
      throw new Error(status.error || "Transcription failed");
    }
    
    if (status.status === "completed" && status.transcript) {
      onProgress?.({
        stage: "complete",
        percentage: 100,
        message: "Transcription complete",
      });
      return status.transcript;
    }

    if (status.status !== lastStatus) {
      lastStatus = status.status;
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const percentage = Math.min(90, 10 + (elapsed / 60) * 20);
      
      onProgress?.({
        stage: "transcribing",
        percentage: Math.round(percentage),
        message: `AssemblyAI: ${status.status} (${elapsed}s elapsed)`,
      });
    }

    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(`Transcription timed out after ${maxWaitMs / 1000}s`);
}

// Split text into sentences for fallback segmentation
function splitIntoSentences(text: string): string[] {
  // Split on sentence-ending punctuation followed by space or end
  const sentences = text.split(/(?<=[.!?])\s+/);
  return sentences.filter(s => s.trim().length > 0);
}

// Create time-distributed segments from sentences when speaker diarization fails
function createSentenceBasedSegments(
  text: string,
  audioDuration: number
): TranscriptSegment[] {
  const sentences = splitIntoSentences(text);
  if (sentences.length === 0) return [];

  const segments: TranscriptSegment[] = [];
  const totalChars = text.length;

  // Guard against missing/zero audio duration - estimate from text length
  // Average speech rate is ~150 words/minute, ~5 chars/word = 750 chars/minute = 12.5 chars/second
  const DEFAULT_CHARS_PER_SECOND = 12.5;
  const effectiveDuration = audioDuration > 0 ? audioDuration : Math.max(60, totalChars / DEFAULT_CHARS_PER_SECOND);
  
  // Group sentences into ~30 second chunks for manageable segments
  const TARGET_SEGMENT_DURATION = 30; // seconds
  const avgCharsPerSecond = totalChars / effectiveDuration;
  const targetCharsPerSegment = Math.max(100, avgCharsPerSecond * TARGET_SEGMENT_DURATION);

  let currentSegmentText = "";
  let segmentStartTime = 0;
  let lastEndTime = 0;

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    currentSegmentText += (currentSegmentText ? " " : "") + sentence;
    
    const charsSoFar = currentSegmentText.length;
    const estimatedDuration = charsSoFar / avgCharsPerSecond;
    
    // Create segment if we've accumulated enough text or it's the last sentence
    if (charsSoFar >= targetCharsPerSegment || i === sentences.length - 1) {
      // Ensure monotonically increasing times (at least 1 second per segment)
      const endTime = Math.max(
        lastEndTime + 1,
        Math.min(
          Math.round(segmentStartTime + estimatedDuration),
          Math.round(effectiveDuration)
        )
      );
      
      segments.push({
        startTime: Math.round(segmentStartTime),
        endTime,
        text: currentSegmentText.trim(),
        speaker: "Speaker",
        type: "speech",
      });
      
      lastEndTime = endTime;
      segmentStartTime = endTime;
      currentSegmentText = "";
    }
  }

  console.log(`[ASSEMBLY] Created ${segments.length} sentence-based segments (speaker diarization fallback)`);
  return segments;
}

// Check if speaker diarization appears to have failed
function isDiarizationFailed(transcript: Transcript): boolean {
  const audioDuration = transcript.audio_duration || 0;
  const utterances = transcript.utterances || [];
  
  // No utterances at all
  if (utterances.length === 0) {
    return true;
  }
  
  // Single utterance that's very long (>2 min) indicates diarization failed
  if (utterances.length === 1 && utterances[0]) {
    const duration = utterances[0].end - utterances[0].start;
    if (duration > 120000) { // 2 minutes in ms
      return true;
    }
  }
  
  // Only 1 speaker for long audio with few utterances
  if (audioDuration > 300) { // More than 5 min
    const uniqueSpeakers = new Set(utterances.map(u => u.speaker));
    if (uniqueSpeakers.size === 1 && utterances.length < 10) {
      return true;
    }
  }
  
  return false;
}

// Convert AssemblyAI sentences to our segment format
function sentencesToSegments(sentences: Array<{text: string; start: number; end: number}>): TranscriptSegment[] {
  // Group sentences into ~30 second chunks
  const TARGET_DURATION_MS = 30000; // 30 seconds in milliseconds
  const segments: TranscriptSegment[] = [];
  
  let currentGroup: typeof sentences = [];
  let groupStartTime = 0;
  
  for (const sentence of sentences) {
    if (currentGroup.length === 0) {
      groupStartTime = sentence.start;
    }
    
    currentGroup.push(sentence);
    
    const groupDuration = sentence.end - groupStartTime;
    
    // Create segment if we've accumulated ~30 seconds or it's the last sentence
    if (groupDuration >= TARGET_DURATION_MS || sentence === sentences[sentences.length - 1]) {
      const text = currentGroup.map(s => s.text).join(" ");
      const startTime = Math.round(groupStartTime / 1000); // Convert ms to seconds
      const endTime = Math.round(sentence.end / 1000);
      
      segments.push({
        startTime,
        endTime,
        text: text.trim(),
        speaker: "Speaker",
        type: "speech",
      });
      
      currentGroup = [];
    }
  }
  
  console.log(`[ASSEMBLY] Created ${segments.length} segments from ${sentences.length} sentences (AssemblyAI sentences endpoint)`);
  return segments;
}

// Async version that can use AssemblyAI's sentences endpoint for accurate timestamps
export async function convertToSegmentsAsync(
  transcript: Transcript,
  jobId: string,
  knownSpeakers?: string[]
): Promise<TranscriptSegment[]> {
  // Check if diarization failed
  if (isDiarizationFailed(transcript)) {
    console.log(`[ASSEMBLY] Speaker diarization failed - fetching sentences from AssemblyAI API`);
    
    try {
      // Use AssemblyAI's sentences endpoint for accurate timestamps
      const sentences = await fetchSentences(jobId);
      if (sentences && sentences.length > 0) {
        return sentencesToSegments(sentences);
      }
    } catch (error) {
      console.error(`[ASSEMBLY] Failed to fetch sentences, using estimated fallback:`, error);
    }
    
    // Fall back to estimated segmentation if sentences endpoint fails
    if (transcript.text) {
      return createSentenceBasedSegments(transcript.text, transcript.audio_duration || 0);
    }
    
    return [];
  }
  
  // Normal diarization worked - use utterances
  return convertUtterancesToSegments(transcript.utterances!, knownSpeakers);
}

// Sync version for backward compatibility (uses estimated fallback when needed)
export function convertToSegments(
  transcript: Transcript,
  knownSpeakers?: string[]
): TranscriptSegment[] {
  // Check if diarization failed
  if (isDiarizationFailed(transcript)) {
    console.log(`[ASSEMBLY] Speaker diarization failed - using estimated sentence fallback`);
    
    if (transcript.text) {
      return createSentenceBasedSegments(transcript.text, transcript.audio_duration || 0);
    }
    
    return [];
  }
  
  // Normal diarization worked - use utterances
  return convertUtterancesToSegments(transcript.utterances!, knownSpeakers);
}

// Convert utterances to segments (shared logic)
function convertUtterancesToSegments(
  utterances: TranscriptUtterance[],
  knownSpeakers?: string[]
): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  const speakerMap = new Map<string, string>();
  
  if (knownSpeakers && knownSpeakers.length > 0) {
    const uniqueAssemblySpeakers = Array.from(new Set(utterances.map(u => u.speaker)));
    uniqueAssemblySpeakers.forEach((speaker, index) => {
      if (index < knownSpeakers.length) {
        speakerMap.set(speaker, knownSpeakers[index]);
      } else {
        speakerMap.set(speaker, `Speaker ${speaker}`);
      }
    });
  }

  for (const utterance of utterances) {
    const startTime = Math.round(utterance.start / 1000);
    const endTime = Math.round(utterance.end / 1000);
    
    let speaker = utterance.speaker;
    if (speakerMap.has(speaker)) {
      speaker = speakerMap.get(speaker)!;
    } else {
      speaker = `Speaker ${speaker}`;
    }

    segments.push({
      startTime,
      endTime,
      text: utterance.text,
      speaker,
      type: "speech",
    });
  }

  return segments;
}

export async function transcribeWithAssembly(
  audioUrl: string,
  onProgress?: ProgressCallback,
  options: AssemblyTranscriptionOptions = {}
): Promise<TranscriptionResult> {
  try {
    onProgress?.({
      stage: "downloading",
      percentage: 5,
      message: "Submitting to AssemblyAI...",
    });

    const { jobId } = await submitTranscriptionJob(audioUrl, options);
    
    onProgress?.({
      stage: "transcribing",
      percentage: 10,
      message: `AssemblyAI job started: ${jobId}`,
    });

    const transcript = await pollUntilComplete(jobId, onProgress);
    
    onProgress?.({
      stage: "processing",
      percentage: 95,
      message: "Converting transcript to segments...",
    });

    const segments = convertToSegments(transcript, options.knownSpeakers);

    console.log(`[ASSEMBLY] Transcription complete: ${segments.length} segments`);

    return {
      segments,
      provider: "assemblyai",
      success: true,
    };
  } catch (error) {
    console.error("[ASSEMBLY] Transcription error:", error);
    return {
      segments: [],
      provider: "assemblyai",
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function getTranscriptById(jobId: string): Promise<Transcript | null> {
  try {
    return await client.transcripts.get(jobId);
  } catch (error) {
    console.error(`[ASSEMBLY] Error fetching transcript ${jobId}:`, error);
    return null;
  }
}

// ============ AUDIO INTELLIGENCE EXTRACTION ============

export interface AssemblyChapter {
  startTime: number;  // seconds
  endTime: number;    // seconds
  headline: string;
  summary: string;
  gist: string;
}

export interface AssemblyEntity {
  text: string;
  entityType: string;
  start: number;  // milliseconds
  end: number;    // milliseconds
}

export interface AssemblyTopic {
  label: string;
  relevance: number;  // 0-1
}

export interface AssemblyKeyPhrase {
  text: string;
  rank: number;
  count: number;
  timestamps: Array<{ start: number; end: number }>;
}

export interface AudioIntelligenceResult {
  chapters: AssemblyChapter[];
  entities: AssemblyEntity[];
  topics: AssemblyTopic[];
  keyPhrases: AssemblyKeyPhrase[];
}

// Extract all Audio Intelligence data from completed transcript
export function extractAudioIntelligence(transcript: Transcript): AudioIntelligenceResult {
  const result: AudioIntelligenceResult = {
    chapters: [],
    entities: [],
    topics: [],
    keyPhrases: [],
  };

  // Extract chapters (auto_chapters)
  if (transcript.chapters && Array.isArray(transcript.chapters)) {
    result.chapters = transcript.chapters.map((ch: any) => ({
      startTime: Math.round(ch.start / 1000),  // Convert ms to seconds
      endTime: Math.round(ch.end / 1000),
      headline: ch.headline || "",
      summary: ch.summary || "",
      gist: ch.gist || "",
    }));
    console.log(`[ASSEMBLY] Extracted ${result.chapters.length} chapters`);
  }

  // Extract entities (entity_detection)
  if (transcript.entities && Array.isArray(transcript.entities)) {
    result.entities = transcript.entities.map((e: any) => ({
      text: e.text || "",
      entityType: e.entity_type || "unknown",
      start: e.start || 0,
      end: e.end || 0,
    }));
    console.log(`[ASSEMBLY] Extracted ${result.entities.length} entities`);
  }

  // Extract topics (iab_categories)
  const iabResult = (transcript as any).iab_categories_result;
  if (iabResult && iabResult.summary) {
    // summary is an object with topic labels as keys and relevance as values
    for (const [label, relevance] of Object.entries(iabResult.summary)) {
      result.topics.push({
        label,
        relevance: typeof relevance === 'number' ? relevance : 0,
      });
    }
    // Sort by relevance (highest first)
    result.topics.sort((a, b) => b.relevance - a.relevance);
    console.log(`[ASSEMBLY] Extracted ${result.topics.length} topics`);
  }

  // Extract key phrases (auto_highlights)
  const highlights = (transcript as any).auto_highlights_result;
  if (highlights && highlights.results && Array.isArray(highlights.results)) {
    result.keyPhrases = highlights.results.map((h: any) => ({
      text: h.text || "",
      rank: h.rank || 0,
      count: h.count || 1,
      timestamps: (h.timestamps || []).map((t: any) => ({
        start: t.start || 0,
        end: t.end || 0,
      })),
    }));
    // Sort by rank (highest first)
    result.keyPhrases.sort((a, b) => b.rank - a.rank);
    console.log(`[ASSEMBLY] Extracted ${result.keyPhrases.length} key phrases`);
  }

  return result;
}
