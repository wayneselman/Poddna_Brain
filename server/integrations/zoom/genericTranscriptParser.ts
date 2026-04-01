import type { ZoomUtterance } from "@shared/schema";
import mammoth from "mammoth";

export interface GenericParseResult {
  title: string | null;
  summary: string | null;
  utterances: ZoomUtterance[];
  format: string;
}

function parseTimestamp(timeStr: string): number {
  const parts = timeStr.trim().split(":");
  if (parts.length === 2) {
    const [min, sec] = parts.map(Number);
    return (min * 60 + sec) * 1000;
  } else if (parts.length === 3) {
    const [hr, min, sec] = parts.map(Number);
    return (hr * 3600 + min * 60 + sec) * 1000;
  }
  return 0;
}

export function parsePlainText(content: string, filename?: string): GenericParseResult {
  const lines = content.split("\n").filter(line => line.trim());
  const utterances: ZoomUtterance[] = [];
  
  let currentTime = 0;
  const avgUtteranceDuration = 5000;
  
  for (const line of lines) {
    const speakerMatch = line.match(/^([A-Za-z\s]+?):\s*(.+)$/);
    
    if (speakerMatch) {
      const [, speaker, text] = speakerMatch;
      utterances.push({
        speaker: speaker.trim(),
        startMs: currentTime,
        endMs: currentTime + avgUtteranceDuration,
        text: text.trim(),
      });
      currentTime += avgUtteranceDuration;
    } else {
      const timestampMatch = line.match(/^\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s*(.+)$/);
      if (timestampMatch) {
        const [, ts, text] = timestampMatch;
        const startMs = parseTimestamp(ts);
        utterances.push({
          speaker: "Unknown",
          startMs,
          endMs: startMs + avgUtteranceDuration,
          text: text.trim(),
        });
        currentTime = startMs + avgUtteranceDuration;
      } else if (line.trim().length > 10) {
        utterances.push({
          speaker: "Unknown",
          startMs: currentTime,
          endMs: currentTime + avgUtteranceDuration,
          text: line.trim(),
        });
        currentTime += avgUtteranceDuration;
      }
    }
  }
  
  let title = filename ? filename.replace(/\.(txt|docx)$/i, "").replace(/_/g, " ") : null;
  if (!title && lines.length > 0 && lines[0].length < 100) {
    title = lines[0];
  }
  
  return {
    title,
    summary: null,
    utterances,
    format: "plain_text",
  };
}

export async function parseDocx(buffer: Buffer, filename?: string): Promise<GenericParseResult> {
  const result = await mammoth.extractRawText({ buffer });
  const content = result.value;
  
  const textResult = parsePlainText(content, filename);
  return {
    ...textResult,
    format: "docx",
  };
}

export function hasSpeakerLabels(utterances: ZoomUtterance[]): boolean {
  if (utterances.length === 0) return false;
  const uniqueSpeakers = new Set(utterances.map((u) => u.speaker));
  const hasMultipleSpeakers = uniqueSpeakers.size > 1;
  const speakerArray = Array.from(uniqueSpeakers);
  const hasNamedSpeaker = speakerArray.some(s => s !== "Unknown" && !s?.startsWith("Speaker "));
  return hasMultipleSpeakers || hasNamedSpeaker;
}

export function detectFormat(filename: string, content?: string): "meetjamie" | "docx" | "plain_text" {
  const ext = filename.toLowerCase().split(".").pop();
  
  if (ext === "docx") {
    return "docx";
  }
  
  if (content) {
    if (content.includes("Executive Summary") && content.includes("Full Summary") && content.includes("Transcript")) {
      return "meetjamie";
    }
  }
  
  return "plain_text";
}
