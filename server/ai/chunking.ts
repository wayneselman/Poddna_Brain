import type { TranscriptSegment } from "@shared/schema";

export interface TextChunk {
  text: string;
  startIndex: number;
  endIndex: number;
  startTimeMs: number;
  endTimeMs: number;
  segments: TranscriptSegment[];
}

export interface ChunkingOptions {
  maxChunkDurationMs?: number;
  maxChunkCharacters?: number;
  overlapSegments?: number;
}

const DEFAULT_MAX_DURATION_MS = 60000;
const DEFAULT_MAX_CHARS = 4000;
const DEFAULT_OVERLAP = 2;

export function chunkTranscriptSegments(
  segments: TranscriptSegment[],
  options: ChunkingOptions = {}
): TextChunk[] {
  const {
    maxChunkDurationMs = DEFAULT_MAX_DURATION_MS,
    maxChunkCharacters = DEFAULT_MAX_CHARS,
    overlapSegments = DEFAULT_OVERLAP,
  } = options;

  if (segments.length === 0) return [];

  const sortedSegments = [...segments].sort((a, b) => a.startTime - b.startTime);
  const chunks: TextChunk[] = [];
  
  let chunkStart = 0;

  while (chunkStart < sortedSegments.length) {
    let chunkEnd = chunkStart;
    let totalChars = 0;
    const startTimeMs = sortedSegments[chunkStart].startTime;

    while (chunkEnd < sortedSegments.length) {
      const segment = sortedSegments[chunkEnd];
      const durationMs = segment.startTime - startTimeMs + (segment.endTime - segment.startTime);
      const segmentChars = segment.text.length;

      if (chunkEnd > chunkStart) {
        if (durationMs > maxChunkDurationMs) break;
        if (totalChars + segmentChars > maxChunkCharacters) break;
      }

      totalChars += segmentChars + 1;
      chunkEnd++;
    }

    if (chunkEnd === chunkStart) {
      chunkEnd = chunkStart + 1;
    }

    const chunkSegments = sortedSegments.slice(chunkStart, chunkEnd);
    const chunkText = chunkSegments.map(s => s.text).join(" ");

    chunks.push({
      text: chunkText,
      startIndex: chunkStart,
      endIndex: chunkEnd - 1,
      startTimeMs: chunkSegments[0].startTime,
      endTimeMs: chunkSegments[chunkSegments.length - 1].endTime,
      segments: chunkSegments,
    });

    chunkStart = Math.max(chunkStart + 1, chunkEnd - overlapSegments);
  }

  return chunks;
}

export function splitTextIntoSentences(text: string): string[] {
  const sentenceEnders = /(?<=[.!?])\s+(?=[A-Z])/g;
  return text.split(sentenceEnders).filter(s => s.trim().length > 0);
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  
  const truncated = text.slice(0, maxLength - 3);
  const lastSpace = truncated.lastIndexOf(" ");
  
  if (lastSpace > maxLength * 0.7) {
    return truncated.slice(0, lastSpace) + "...";
  }
  
  return truncated + "...";
}

export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

export function safeJsonParse<T>(text: string, fallback: T): T {
  if (!text) return fallback;
  
  let cleaned = text.trim();
  
  // Step 1: Handle markdown code fences
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.replace(/```json\s*/i, "").replace(/```\s*$/, "");
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/```\s*/, "").replace(/```\s*$/, "");
  }
  
  // Step 2: Try direct parse
  try {
    return JSON.parse(cleaned);
  } catch (_) {
    // Continue to fallback extraction
  }
  
  // Step 3: Try to extract first JSON-like block (object or array)
  const match = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (match) {
    try {
      return JSON.parse(match[1]);
    } catch (_) {
      // Fall through to fallback
    }
  }
  
  console.error("[SAFE_JSON_PARSE] Could not parse JSON from text");
  return fallback;
}

// Overload for nullable return (used by repair flow)
export function safeJsonParseNullable<T>(text: string): T | null {
  if (!text) return null;
  
  let cleaned = text.trim();
  
  // Step 1: Handle markdown code fences
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.replace(/```json\s*/i, "").replace(/```\s*$/, "");
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/```\s*/, "").replace(/```\s*$/, "");
  }
  
  // Step 2: Try direct parse
  try {
    return JSON.parse(cleaned) as T;
  } catch (_) {
    // Continue to fallback extraction
  }
  
  // Step 3: Try to extract JSON block - prefer objects over arrays
  // First try to match an object (more likely to be the full response)
  const objectMatch = cleaned.match(/(\{[\s\S]*\})/);
  if (objectMatch) {
    try {
      return JSON.parse(objectMatch[1]) as T;
    } catch (_) {
      // Continue to try array
    }
  }
  
  // Then try to match an array
  const arrayMatch = cleaned.match(/(\[[\s\S]*\])/);
  if (arrayMatch) {
    try {
      return JSON.parse(arrayMatch[1]) as T;
    } catch (_) {
      // Fall through to null
    }
  }
  
  console.error("[SAFE_JSON_PARSE] Could not parse JSON from text");
  return null;
}

export function formatSegmentsForPrompt(
  segments: TranscriptSegment[],
  includeTimestamps: boolean = true
): string {
  return segments.map((s, i) => {
    if (includeTimestamps) {
      const timeStr = formatTimeMs(s.startTime);
      const speaker = s.speaker ? `[${s.speaker}]` : "";
      return `[${i}] ${timeStr} ${speaker} ${s.text}`;
    }
    return `[${i}] ${s.text}`;
  }).join("\n");
}

export function formatTimeMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}
