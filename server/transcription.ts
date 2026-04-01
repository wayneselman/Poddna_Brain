import { GoogleGenAI, Type } from "@google/genai";
import { AssemblyAI, TranscriptUtterance } from "assemblyai";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import pLimit from "p-limit";
import pRetry from "p-retry";

const execPromise = promisify(exec);

export interface TranscriptSegment {
  startTime: number;
  endTime: number;
  text: string;
  speaker: string;
  type: "speech" | "music" | "media";
}

interface ChunkResult {
  buffer: Buffer;
  startTime: number;
  duration: number;
}

export interface TranscriptionResult {
  segments: TranscriptSegment[];
  provider: "gemini" | "assemblyai";
  success: boolean;
  error?: string;
}

export interface TranscriptionProgress {
  stage: "downloading" | "chunking" | "transcribing" | "processing" | "complete" | "error";
  currentChunk?: number;
  totalChunks?: number;
  percentage: number;
  message: string;
}

export type ProgressCallback = (progress: TranscriptionProgress) => void;

export interface TranscriptionOptions {
  knownSpeakers?: string[];
  podcastTitle?: string;
}

interface TranscriptionProvider {
  transcribe(audioPath: string, onProgress?: ProgressCallback, options?: TranscriptionOptions): Promise<TranscriptionResult>;
  getName(): string;
}

function isRateLimitError(error: any): boolean {
  const errorMsg = error?.message || String(error);
  return (
    errorMsg.includes("429") ||
    errorMsg.includes("RATELIMIT_EXCEEDED") ||
    errorMsg.toLowerCase().includes("quota") ||
    errorMsg.toLowerCase().includes("rate limit")
  );
}

function repairTruncatedJSON(jsonText: string): any[] {
  let text = jsonText.trim();
  
  if (text.startsWith("```json")) {
    text = text.replace(/```json\n?/, "").replace(/\n?```$/, "");
  } else if (text.startsWith("```")) {
    text = text.replace(/```\n?/, "").replace(/\n?```$/, "");
  }
  
  text = text.trim();
  
  try {
    return JSON.parse(text);
  } catch (e) {
  }
  
  if (!text.startsWith("[")) {
    const arrayStart = text.indexOf("[");
    if (arrayStart > -1) {
      text = text.substring(arrayStart);
    } else {
      return [];
    }
  }
  
  let lastValidIndex = -1;
  let braceDepth = 0;
  let inString = false;
  let escapeNext = false;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    
    if (char === "\\") {
      escapeNext = true;
      continue;
    }
    
    if (char === '"') {
      inString = !inString;
      continue;
    }
    
    if (inString) continue;
    
    if (char === "{") {
      braceDepth++;
    } else if (char === "}") {
      braceDepth--;
      if (braceDepth === 0) {
        lastValidIndex = i;
      }
    }
  }
  
  if (lastValidIndex > 0) {
    const truncatedText = text.substring(0, lastValidIndex + 1) + "]";
    try {
      const result = JSON.parse(truncatedText);
      console.log(`[JSON_REPAIR] Successfully repaired truncated JSON, recovered ${result.length} segments`);
      return result;
    } catch (e) {
    }
  }
  
  const segments: any[] = [];
  const objectPattern = /\{\s*"relativeStart"\s*:\s*(\d+(?:\.\d+)?)\s*,\s*"relativeEnd"\s*:\s*(\d+(?:\.\d+)?)\s*,\s*"speaker"\s*:\s*"([^"]*)"\s*,\s*"text"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
  
  let match;
  while ((match = objectPattern.exec(text)) !== null) {
    segments.push({
      relativeStart: parseFloat(match[1]),
      relativeEnd: parseFloat(match[2]),
      speaker: match[3],
      text: match[4].replace(/\\n/g, "\n").replace(/\\"/g, '"'),
      type: "speech"
    });
  }
  
  if (segments.length > 0) {
    console.log(`[JSON_REPAIR] Extracted ${segments.length} segments via regex fallback`);
    return segments;
  }
  
  const altPattern = /\{\s*"(?:relative)?[Ss]tart"\s*:\s*(\d+(?:\.\d+)?)[^}]*"text"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
  while ((match = altPattern.exec(text)) !== null) {
    segments.push({
      relativeStart: parseFloat(match[1]),
      relativeEnd: parseFloat(match[1]) + 30,
      speaker: "Unknown",
      text: match[2].replace(/\\n/g, "\n").replace(/\\"/g, '"'),
      type: "speech"
    });
  }
  
  if (segments.length > 0) {
    console.log(`[JSON_REPAIR] Extracted ${segments.length} segments via alternative regex`);
  }
  
  return segments;
}

class GeminiTranscriptionProvider implements TranscriptionProvider {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({
      apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY!,
      httpOptions: {
        apiVersion: "",
        baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL!,
      },
    });
  }

  getName(): string {
    return "gemini";
  }

  async transcribe(audioPath: string, onProgress?: ProgressCallback, options?: TranscriptionOptions): Promise<TranscriptionResult> {
    try {
      console.log("[TRANSCRIPTION] Starting Gemini transcription for:", audioPath);
      if (options?.knownSpeakers?.length) {
        console.log("[TRANSCRIPTION] Known speakers provided:", options.knownSpeakers.join(", "));
      }
      
      onProgress?.({
        stage: "chunking",
        percentage: 5,
        message: "Preparing audio for transcription..."
      });
      
      const audioBuffer = fs.readFileSync(audioPath);
      const chunkInfos = await this.chunkAudio(audioBuffer, audioPath);
      
      console.log(`[TRANSCRIPTION] Split audio into ${chunkInfos.length} chunks`);
      
      onProgress?.({
        stage: "transcribing",
        currentChunk: 0,
        totalChunks: chunkInfos.length,
        percentage: 10,
        message: `Starting transcription of ${chunkInfos.length} audio chunks...`
      });
      
      const limit = pLimit(4);
      let completedChunks = 0;
      
      // Build known speakers context for the prompt
      const knownSpeakersContext = options?.knownSpeakers?.length 
        ? `\n\nIMPORTANT: This podcast typically features these speakers: ${options.knownSpeakers.join(", ")}. Use these exact names when you identify these speakers by their voices or when they are addressed by name. If you hear someone being called by one of these names, use that name for their speaker label.`
        : "";
      
      const podcastContext = options?.podcastTitle
        ? `\n\nThis is from the podcast "${options.podcastTitle}".`
        : "";
      
      const chunkPromises = chunkInfos.map((chunkInfo, i) =>
        limit(() =>
          pRetry(
            async () => {
              console.log(`[TRANSCRIPTION] Processing chunk ${i + 1}/${chunkInfos.length} (starts at ${chunkInfo.startTime}s)`);
              
              const prompt = `You are transcribing a podcast. Analyze this audio chunk (part ${i + 1} of ${chunkInfos.length}).${podcastContext}${knownSpeakersContext}

For each distinct speech segment, identify:
1. The speaker (use the known speaker names if provided and you can identify them, otherwise use descriptive names like "Host", "Guest 1", "Guest 2", or actual names if mentioned in conversation)
2. What they said (verbatim transcription)
3. Approximate timing within this chunk

Return a JSON array of segments. Each segment should have:
- "speaker": string (speaker name/identifier - prefer known speaker names when applicable)
- "text": string (what was said)
- "relativeStart": number (seconds from start of this chunk)
- "relativeEnd": number (seconds from start of this chunk)
- "type": "speech" | "music" | "media"

For non-speech audio (music, sound effects, clips), use type "music" or "media" with descriptive text like "[Intro music]".

Be precise with speaker identification - if the same person keeps talking, keep them as one segment until another speaker starts.

Return ONLY valid JSON, no markdown or explanation.`;

              const response = await this.ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: [{
                  role: "user",
                  parts: [
                    { text: prompt },
                    { inlineData: { mimeType: "audio/mp3", data: chunkInfo.buffer.toString("base64") } }
                  ]
                }],
                config: {
                  maxOutputTokens: 8192,
                }
              });

              const result = { text: response.text || "[]", chunkInfo };
              
              completedChunks++;
              const percentage = 10 + Math.round((completedChunks / chunkInfos.length) * 80);
              onProgress?.({
                stage: "transcribing",
                currentChunk: completedChunks,
                totalChunks: chunkInfos.length,
                percentage,
                message: `Transcribed ${completedChunks} of ${chunkInfos.length} chunks...`
              });
              
              return result;
            },
            {
              retries: 5,
              minTimeout: 5000,
              maxTimeout: 60000,
              factor: 2,
              onFailedAttempt: (error: any) => {
                console.log(`[TRANSCRIPTION] Chunk ${i + 1} attempt failed:`, error.retriesLeft, "retries left");
              }
            }
          )
        )
      );

      const results = await Promise.all(chunkPromises);
      
      onProgress?.({
        stage: "processing",
        percentage: 95,
        message: "Processing transcription results..."
      });
      
      const allSegments: TranscriptSegment[] = [];

      for (let i = 0; i < results.length; i++) {
        const { text: rawText, chunkInfo } = results[i];
        const chunkStartTime = chunkInfo.startTime;
        
        const chunkSegments = repairTruncatedJSON(rawText);
        
        if (chunkSegments.length === 0) {
          console.log(`[TRANSCRIPTION] Chunk ${i + 1} yielded no segments after repair attempt`);
          continue;
        }
        
        console.log(`[TRANSCRIPTION] Chunk ${i + 1} parsed successfully: ${chunkSegments.length} segments`);
        
        for (const seg of chunkSegments) {
          let segType: "speech" | "music" | "media" = "speech";
          if (seg.type === "music") segType = "music";
          else if (seg.type === "media" || seg.type === "clip") segType = "media";
          else if (seg.type === "speech") segType = "speech";
          
          allSegments.push({
            startTime: Math.round(chunkStartTime + (seg.relativeStart || 0)),
            endTime: Math.round(chunkStartTime + (seg.relativeEnd || seg.relativeStart + 30)),
            text: seg.text || "",
            speaker: seg.speaker || "Unknown",
            type: segType
          });
        }
      }

      const mergedSegments = this.mergeConsecutiveSpeakerSegments(allSegments);
      
      // Normalize timestamps to start at 0 (fixes issues with audio files that have embedded start time offsets)
      const normalizedSegments = this.normalizeSegmentTimestamps(mergedSegments);
      
      console.log(`[TRANSCRIPTION] Completed with ${normalizedSegments.length} segments`);
      
      onProgress?.({
        stage: "complete",
        percentage: 100,
        message: `Transcription complete! ${normalizedSegments.length} segments created.`
      });
      
      return {
        segments: normalizedSegments,
        provider: "gemini",
        success: true
      };
      
    } catch (error: any) {
      console.error("[TRANSCRIPTION ERROR]", error);
      onProgress?.({
        stage: "error",
        percentage: 0,
        message: error.message || "Transcription failed"
      });
      return {
        segments: [],
        provider: "gemini",
        success: false,
        error: error.message
      };
    }
  }

  private mergeConsecutiveSpeakerSegments(segments: TranscriptSegment[]): TranscriptSegment[] {
    if (segments.length === 0) return [];
    
    const merged: TranscriptSegment[] = [];
    let current = { ...segments[0] };
    
    for (let i = 1; i < segments.length; i++) {
      const next = segments[i];
      
      if (next.speaker === current.speaker && next.type === current.type) {
        current.endTime = next.endTime;
        current.text = current.text + " " + next.text;
      } else {
        merged.push(current);
        current = { ...next };
      }
    }
    
    merged.push(current);
    return merged;
  }

  /**
   * Normalize segment timestamps to ensure they start at 0 and don't exceed a reasonable maximum.
   * This fixes issues where source audio has embedded start time offsets.
   */
  private normalizeSegmentTimestamps(segments: TranscriptSegment[], maxDuration?: number): TranscriptSegment[] {
    if (segments.length === 0) return [];
    
    // Find the minimum start time across all segments
    const minStartTime = Math.min(...segments.map(s => s.startTime));
    
    // If segments already start near 0 (within 60 seconds), no normalization needed
    if (minStartTime < 60) {
      console.log(`[TRANSCRIPTION] Timestamps already normalized (min start: ${minStartTime}s)`);
      return segments;
    }
    
    console.log(`[TRANSCRIPTION] Normalizing timestamps - subtracting offset of ${minStartTime}s`);
    
    // Subtract the minimum to rebase all segments to start at 0
    const normalized = segments.map(seg => ({
      ...seg,
      startTime: Math.max(0, seg.startTime - minStartTime),
      endTime: Math.max(0, seg.endTime - minStartTime)
    }));
    
    // If we know the max duration, clamp end times
    if (maxDuration && maxDuration > 0) {
      return normalized.map(seg => ({
        ...seg,
        endTime: Math.min(seg.endTime, maxDuration)
      }));
    }
    
    return normalized;
  }

  private async chunkAudio(buffer: Buffer, originalPath: string): Promise<ChunkResult[]> {
    const CHUNK_SIZE_BYTES = 7 * 1024 * 1024;

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "audio-chunk-"));
    const ext = path.extname(originalPath) || ".mp3";
    const inputPath = path.join(tempDir, `input${ext}`);

    try {
      fs.writeFileSync(inputPath, buffer);
      
      const { stdout } = await execPromise(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${inputPath}"`
      );
      const totalDuration = parseFloat(stdout.trim());
      
      if (buffer.length <= CHUNK_SIZE_BYTES) {
        return [{
          buffer: buffer,
          startTime: 0,
          duration: totalDuration
        }];
      }
      
      const numChunks = Math.ceil(buffer.length / CHUNK_SIZE_BYTES);
      const segmentDuration = Math.ceil(totalDuration / numChunks);

      console.log(`[TRANSCRIPTION] Audio duration: ${totalDuration}s, splitting into ${numChunks} chunks of ~${segmentDuration}s each`);

      const chunks: ChunkResult[] = [];
      for (let i = 0; i < numChunks; i++) {
        const chunkStart = i * segmentDuration;
        const outputPath = path.join(tempDir, `chunk_${i}.mp3`);
        await execPromise(
          `ffmpeg -i "${inputPath}" -ss ${chunkStart} -t ${segmentDuration} -acodec libmp3lame -ar 16000 -ac 1 -b:a 64k -y "${outputPath}" 2>&1`
        );
        chunks.push({
          buffer: fs.readFileSync(outputPath),
          startTime: chunkStart,
          duration: segmentDuration
        });
        fs.unlinkSync(outputPath);
      }

      return chunks;
    } finally {
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      fs.rmdirSync(tempDir, { recursive: true });
    }
  }
}

export async function downloadYouTubeAudio(videoId: string): Promise<string> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "yt-audio-"));
  const outputPath = path.join(tempDir, "audio.mp3");

  console.log(`[TRANSCRIPTION] Downloading YouTube audio for: ${videoId}`);

  try {
    await execPromise(
      `yt-dlp -x --audio-format mp3 --audio-quality 5 -o "${outputPath}" "https://www.youtube.com/watch?v=${videoId}"`,
      { timeout: 300000 }
    );

    if (!fs.existsSync(outputPath)) {
      throw new Error("Audio file was not created");
    }

    console.log(`[TRANSCRIPTION] Downloaded audio to: ${outputPath}`);
    return outputPath;
  } catch (error: any) {
    fs.rmdirSync(tempDir, { recursive: true });
    throw new Error(`Failed to download YouTube audio: ${error.message}`);
  }
}

export function cleanupAudioFile(audioPath: string): void {
  try {
    if (fs.existsSync(audioPath)) {
      fs.unlinkSync(audioPath);
      const dir = path.dirname(audioPath);
      if (fs.existsSync(dir)) {
        fs.rmdirSync(dir, { recursive: true });
      }
    }
  } catch (error) {
    console.log("[TRANSCRIPTION] Cleanup warning:", error);
  }
}

const geminiProvider = new GeminiTranscriptionProvider();

export async function transcribeAudio(audioPath: string, onProgress?: ProgressCallback, options?: TranscriptionOptions): Promise<TranscriptionResult> {
  return geminiProvider.transcribe(audioPath, onProgress, options);
}

export async function transcribeYouTubeVideo(videoId: string, onProgress?: ProgressCallback, options?: TranscriptionOptions): Promise<TranscriptionResult> {
  let audioPath: string | null = null;
  
  try {
    onProgress?.({
      stage: "downloading",
      percentage: 0,
      message: "Downloading audio from YouTube..."
    });
    audioPath = await downloadYouTubeAudio(videoId);
    const result = await transcribeAudio(audioPath, onProgress, options);
    return result;
  } finally {
    if (audioPath) {
      cleanupAudioFile(audioPath);
    }
  }
}

export async function downloadAudioFromUrl(audioUrl: string, onProgress?: ProgressCallback): Promise<string> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "audio-dl-"));
  const outputPath = path.join(tempDir, "audio.mp3");

  console.log(`[TRANSCRIPTION] Downloading audio from URL: ${audioUrl}`);
  
  onProgress?.({
    stage: "downloading",
    percentage: 2,
    message: "Downloading audio file..."
  });

  try {
    const response = await fetch(audioUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch audio: ${response.status} ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    fs.writeFileSync(outputPath, Buffer.from(arrayBuffer));

    if (!fs.existsSync(outputPath)) {
      throw new Error("Audio file was not created");
    }

    const stats = fs.statSync(outputPath);
    console.log(`[TRANSCRIPTION] Downloaded audio to: ${outputPath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
    return outputPath;
  } catch (error: any) {
    fs.rmdirSync(tempDir, { recursive: true });
    throw new Error(`Failed to download audio: ${error.message}`);
  }
}

export async function transcribeFromUrl(audioUrl: string, onProgress?: ProgressCallback, options?: TranscriptionOptions): Promise<TranscriptionResult> {
  let audioPath: string | null = null;
  
  try {
    audioPath = await downloadAudioFromUrl(audioUrl, onProgress);
    const result = await transcribeAudio(audioPath, onProgress, options);
    return result;
  } finally {
    if (audioPath) {
      cleanupAudioFile(audioPath);
    }
  }
}

// ============ EXTERNAL TRANSCRIPT IMPORT ============

export interface ExternalTranscriptResult {
  segments: TranscriptSegment[];
  source: string;
  success: boolean;
  error?: string;
}

function parseTimestampToSeconds(timestamp: string): number {
  const parts = timestamp.split(':').map(p => parseFloat(p));
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return parseFloat(timestamp) || 0;
}

function parseOmnyFmTranscript(text: string, maxDuration?: number): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  const lines = text.split('\n').filter(line => line.trim());
  
  let currentTimestamp: number | null = null;
  let currentSpeaker: string = "Unknown";
  let currentText: string = "";
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    const timestampMatch = line.match(/^(\d{1,2}:\d{2}:\d{2}|\d{1,2}:\d{2})$/);
    if (timestampMatch) {
      if (currentTimestamp !== null && currentText.trim()) {
        const nextTimestamp = parseTimestampToSeconds(timestampMatch[1]);
        segments.push({
          startTime: currentTimestamp,
          endTime: nextTimestamp,
          text: currentText.trim(),
          speaker: currentSpeaker,
          type: "speech"
        });
      }
      currentTimestamp = parseTimestampToSeconds(timestampMatch[1]);
      currentText = "";
      currentSpeaker = "Unknown";
      continue;
    }
    
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0 && colonIndex < 30 && currentTimestamp !== null) {
      const potentialSpeaker = line.substring(0, colonIndex).trim();
      const potentialText = line.substring(colonIndex + 1).trim();
      
      if (/^(Speaker\s*\d+|[A-Za-z][A-Za-z\s]{0,20})$/.test(potentialSpeaker)) {
        currentSpeaker = potentialSpeaker;
        if (currentText.trim()) {
          currentText += " " + potentialText;
        } else {
          currentText = potentialText;
        }
        continue;
      }
    }
    
    if (currentTimestamp !== null) {
      if (currentText.trim()) {
        currentText += " " + line;
      } else {
        currentText = line;
      }
    }
  }
  
  if (currentTimestamp !== null && currentText.trim()) {
    let endTime = currentTimestamp + 30;
    if (maxDuration && endTime > maxDuration) {
      endTime = maxDuration;
    }
    if (segments.length > 0) {
      const lastSegment = segments[segments.length - 1];
      const avgDuration = (lastSegment.endTime - segments[0].startTime) / segments.length;
      endTime = Math.min(currentTimestamp + Math.max(avgDuration, 10), maxDuration || currentTimestamp + 30);
    }
    segments.push({
      startTime: currentTimestamp,
      endTime: Math.round(endTime),
      text: currentText.trim(),
      speaker: currentSpeaker,
      type: "speech"
    });
  }
  
  return segments;
}

function parseSrtTranscript(text: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  const blocks = text.split(/\n\n+/);
  
  for (const block of blocks) {
    const lines = block.split('\n').filter(l => l.trim());
    if (lines.length < 2) continue;
    
    const timeMatch = lines.find(l => l.includes('-->'));
    if (!timeMatch) continue;
    
    const [startStr, endStr] = timeMatch.split('-->').map(s => s.trim());
    const startTime = parseTimestampToSeconds(startStr.replace(',', '.'));
    const endTime = parseTimestampToSeconds(endStr.replace(',', '.'));
    
    const textLines = lines.filter(l => !l.includes('-->') && !/^\d+$/.test(l.trim()));
    const text = textLines.join(' ').trim();
    
    if (text) {
      segments.push({
        startTime: Math.round(startTime),
        endTime: Math.round(endTime),
        text,
        speaker: "Unknown",
        type: "speech"
      });
    }
  }
  
  return segments;
}

function parseVttTranscript(text: string): TranscriptSegment[] {
  let content = text.replace(/^WEBVTT\s*\n/, '').replace(/^NOTE.*\n/gm, '');
  return parseSrtTranscript(content);
}

function parseJsonTranscript(text: string): TranscriptSegment[] {
  try {
    const data = JSON.parse(text);
    const segments: TranscriptSegment[] = [];
    
    const items = data.segments || data.utterances || data.results || data.transcript || data;
    
    if (Array.isArray(items)) {
      for (const item of items) {
        let startTime = item.start || item.startTime || item.start_time || 0;
        let endTime = item.end || item.endTime || item.end_time || startTime + 30;
        const segmentText = item.text || item.transcript || item.content || "";
        const speaker = item.speaker || item.speaker_label || item.speakerId || "Unknown";
        
        startTime = typeof startTime === 'number' ? startTime : parseFloat(startTime);
        endTime = typeof endTime === 'number' ? endTime : parseFloat(endTime);
        
        if (startTime > 100000) {
          startTime = startTime / 1000;
        }
        if (endTime > 100000) {
          endTime = endTime / 1000;
        }
        
        if (segmentText.trim()) {
          segments.push({
            startTime: Math.round(startTime),
            endTime: Math.round(endTime),
            text: segmentText.trim(),
            speaker: String(speaker),
            type: "speech"
          });
        }
      }
    }
    
    return segments;
  } catch (e) {
    console.error("[JSON_PARSE] Failed to parse JSON transcript:", e);
    return [];
  }
}

export interface ImportTranscriptOptions {
  transcriptType?: string;
  maxDuration?: number;
  onProgress?: ProgressCallback;
}

export async function importExternalTranscript(
  transcriptUrl: string,
  optionsOrType?: string | ImportTranscriptOptions,
  onProgress?: ProgressCallback
): Promise<ExternalTranscriptResult> {
  const options: ImportTranscriptOptions = typeof optionsOrType === 'string' 
    ? { transcriptType: optionsOrType, onProgress } 
    : (optionsOrType || {});
  
  const transcriptType = options.transcriptType;
  const maxDuration = options.maxDuration;
  const progressCallback = options.onProgress || onProgress;
  
  console.log(`[TRANSCRIPT_IMPORT] Fetching transcript from: ${transcriptUrl}`);
  console.log(`[TRANSCRIPT_IMPORT] Transcript type hint: ${transcriptType || 'auto-detect'}, maxDuration: ${maxDuration || 'unknown'}`);
  
  progressCallback?.({
    stage: "downloading",
    percentage: 10,
    message: "Fetching external transcript..."
  });
  
  try {
    const response = await fetch(transcriptUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch transcript: ${response.status} ${response.statusText}`);
    }
    
    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();
    
    console.log(`[TRANSCRIPT_IMPORT] Content-Type: ${contentType}, Length: ${text.length} chars`);
    
    progressCallback?.({
      stage: "processing",
      percentage: 50,
      message: "Parsing transcript format..."
    });
    
    let segments: TranscriptSegment[] = [];
    let source = "external";
    
    if (contentType.includes('application/json') || text.trim().startsWith('{') || text.trim().startsWith('[')) {
      segments = parseJsonTranscript(text);
      source = "json";
    } else if (text.includes('WEBVTT')) {
      segments = parseVttTranscript(text);
      source = "vtt";
    } else if (text.includes('-->')) {
      segments = parseSrtTranscript(text);
      source = "srt";
    } else if (text.match(/^\d{1,2}:\d{2}(:\d{2})?\s*$/m)) {
      segments = parseOmnyFmTranscript(text, maxDuration);
      source = "omny";
    } else {
      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length > 0) {
        segments = [{
          startTime: 0,
          endTime: maxDuration || 0,
          text: lines.join(' '),
          speaker: "Unknown",
          type: "speech"
        }];
        source = "plain-text";
      }
    }
    
    if (segments.length === 0) {
      return {
        segments: [],
        source: "error",
        success: false,
        error: "No transcript segments could be parsed from the response"
      };
    }
    
    console.log(`[TRANSCRIPT_IMPORT] Parsed ${segments.length} segments from ${source} format`);
    
    progressCallback?.({
      stage: "complete",
      percentage: 100,
      message: `Imported ${segments.length} segments from ${source} transcript`
    });
    
    return {
      segments,
      source,
      success: true
    };
    
  } catch (error: any) {
    console.error("[TRANSCRIPT_IMPORT] Error:", error);
    progressCallback?.({
      stage: "error",
      percentage: 0,
      message: error.message || "Failed to import transcript"
    });
    return {
      segments: [],
      source: "error",
      success: false,
      error: error.message
    };
  }
}

// ============ CHAPTER GENERATION ============

export interface GeneratedChapter {
  startTime: number;
  endTime: number;
  label: string;
  summary: string;
  snippetText: string;
  segmentType: "topic" | "intro" | "outro" | "ad" | "music";
}

export interface ChapterGenerationResult {
  chapters: GeneratedChapter[];
  success: boolean;
  error?: string;
}

export async function generateChaptersFromTranscript(
  transcriptSegments: TranscriptSegment[],
  episodeTitle: string,
  podcastTitle?: string
): Promise<ChapterGenerationResult> {
  if (!transcriptSegments.length) {
    return { chapters: [], success: false, error: "No transcript segments provided" };
  }

  const ai = new GoogleGenAI({
    apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY!,
    httpOptions: {
      apiVersion: "",
      baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL!,
    },
  });

  console.log(`[CHAPTERS] Generating chapters for "${episodeTitle}" with ${transcriptSegments.length} segments`);

  const totalDuration = Math.max(...transcriptSegments.map(s => s.endTime));
  
  const transcriptText = transcriptSegments
    .map(seg => `[${formatTime(seg.startTime)}] ${seg.speaker}: ${seg.text}`)
    .join("\n");

  const maxChars = 200000;
  const truncatedTranscript = transcriptText.length > maxChars 
    ? transcriptText.slice(0, maxChars) + "\n\n[TRANSCRIPT TRUNCATED FOR LENGTH]"
    : transcriptText;

  const prompt = `You are analyzing a podcast transcript to create chapter markers (like YouTube chapters or podcast chapters). 

Episode: "${episodeTitle}"${podcastTitle ? `\nPodcast: "${podcastTitle}"` : ""}
Total Duration: ${formatTime(totalDuration)}

Analyze the following transcript and identify 5-15 distinct topic segments or chapters. For each chapter:
1. Identify when a significant topic change occurs
2. Create a concise, descriptive label (2-6 words)
3. Write a brief summary of what's discussed (1-2 sentences, max 200 chars)
4. Extract a representative snippet from the transcript (~200-250 chars)
5. Categorize the segment type

Return a JSON array of chapters. Each chapter should have:
- "startTime": number (seconds from start)
- "endTime": number (seconds, when this topic ends)
- "label": string (chapter title, 2-6 words, engaging and descriptive)
- "summary": string (brief description, max 200 chars)
- "snippetText": string (actual quote from transcript, 200-250 chars)
- "segmentType": "intro" | "topic" | "outro" | "ad" | "music"

Guidelines:
- First chapter usually starts at 0 or within first minute
- Make chapters at least 2-3 minutes apart (avoid too many tiny segments)
- Intro/outro are typically first and last chapters
- Identify ad reads or sponsor segments if present
- Music segments for intros/outros with music
- Topic is the most common type for main content

TRANSCRIPT:
${truncatedTranscript}

Return ONLY valid JSON array, no markdown or explanation.`;

  try {
    const response = await pRetry(
      async () => {
        const result = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [{
            role: "user",
            parts: [{ text: prompt }]
          }],
          config: {
            maxOutputTokens: 8192,
          }
        });

        const text = result.text;
        if (!text) {
          throw new Error("Empty response from Gemini");
        }
        return text;
      },
      {
        retries: 3,
        minTimeout: 2000,
        maxTimeout: 10000,
        onFailedAttempt: (error: any) => {
          console.log(`[CHAPTERS] Attempt failed, ${error.retriesLeft} retries left:`, error.message);
        }
      }
    );

    let jsonText = response.trim();
    if (jsonText.startsWith("```json")) {
      jsonText = jsonText.replace(/```json\n?/, "").replace(/\n?```$/, "");
    } else if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/```\n?/, "").replace(/\n?```$/, "");
    }

    const rawChapters = JSON.parse(jsonText);
    
    if (!Array.isArray(rawChapters)) {
      throw new Error("Invalid response format: expected array of chapters");
    }

    const validatedChapters: GeneratedChapter[] = [];
    
    for (let i = 0; i < rawChapters.length; i++) {
      const ch = rawChapters[i];
      
      const rawStart = Number(ch.startTime);
      const rawEnd = Number(ch.endTime);
      
      if (isNaN(rawStart) || rawStart < 0 || rawStart > totalDuration) {
        console.log(`[CHAPTERS] Skipping chapter ${i}: invalid startTime ${ch.startTime}`);
        continue;
      }
      
      const startTime = Math.round(rawStart);
      
      let endTime: number;
      if (isNaN(rawEnd) || rawEnd <= startTime) {
        const nextStart = rawChapters[i + 1]?.startTime;
        if (typeof nextStart === "number" && !isNaN(nextStart) && nextStart > startTime) {
          endTime = Math.round(nextStart);
        } else {
          endTime = totalDuration;
        }
      } else {
        endTime = Math.min(totalDuration, Math.round(rawEnd));
      }
      
      if (endTime <= startTime) {
        endTime = Math.min(startTime + 30, totalDuration);
      }
      
      const label = String(ch.label || `Chapter ${i + 1}`).trim().slice(0, 100);
      const summary = String(ch.summary || "").trim().slice(0, 250);
      
      let snippetText = String(ch.snippetText || "").trim();
      if (!snippetText && summary) {
        snippetText = summary;
      }
      if (!snippetText) {
        snippetText = `${label} - starting at ${formatTime(startTime)}`;
      }
      snippetText = snippetText.slice(0, 300);
      
      const segmentType = ["intro", "topic", "outro", "ad", "music"].includes(ch.segmentType) 
        ? ch.segmentType as "intro" | "topic" | "outro" | "ad" | "music"
        : "topic";
      
      if (label && startTime >= 0 && endTime > startTime && endTime <= totalDuration) {
        validatedChapters.push({
          startTime,
          endTime,
          label,
          summary,
          snippetText,
          segmentType
        });
      } else {
        console.log(`[CHAPTERS] Skipping invalid chapter ${i}: label="${label}", start=${startTime}, end=${endTime}, total=${totalDuration}`);
      }
    }

    validatedChapters.sort((a, b) => a.startTime - b.startTime);
    
    let hasOverlap = false;
    for (let i = 1; i < validatedChapters.length; i++) {
      if (validatedChapters[i].startTime < validatedChapters[i - 1].endTime) {
        validatedChapters[i - 1].endTime = validatedChapters[i].startTime;
        if (validatedChapters[i - 1].endTime <= validatedChapters[i - 1].startTime) {
          hasOverlap = true;
        }
      }
    }
    
    const finalChapters = validatedChapters.filter(ch => ch.endTime > ch.startTime);
    
    if (finalChapters.length === 0) {
      throw new Error("No valid chapters could be generated - all had invalid timestamps");
    }
    
    if (hasOverlap) {
      console.log(`[CHAPTERS] Warning: Some overlapping chapters were adjusted for "${episodeTitle}"`);
    }

    console.log(`[CHAPTERS] Generated ${finalChapters.length} validated chapters for "${episodeTitle}"`);
    
    return { chapters: finalChapters, success: true };
  } catch (error: any) {
    console.error("[CHAPTERS] Error generating chapters:", error);
    return { 
      chapters: [], 
      success: false, 
      error: error.message || "Failed to generate chapters" 
    };
  }
}

function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
