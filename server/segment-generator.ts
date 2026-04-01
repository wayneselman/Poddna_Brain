import { callGeminiJson, GeminiError } from "./ai/geminiClient";
import { AiSegmentLabelsResponseSchema, type AiSegmentLabel } from "./ai/schemas";

interface TranscriptWindow {
  startTime: number;
  endTime: number;
  text: string;
  speakers: string[];
}

interface EpisodeContext {
  title: string;
  showName: string;
  description: string;
}

interface GeneratedSegment {
  startTime: number;
  endTime: number | null;
  label: string;
  snippetText: string;
  segmentType: string;
  confidence?: number;
}

export async function generateTopicSegments(
  transcriptWindows: TranscriptWindow[],
  episodeContext?: EpisodeContext
): Promise<GeneratedSegment[]> {
  if (transcriptWindows.length === 0) {
    return [];
  }

  const segmentsPayload = transcriptWindows.map((window, index) => ({
    segment_id: `seg_${index}`,
    start_seconds: Math.round(window.startTime),
    end_seconds: Math.round(window.endTime),
    raw_speakers: window.speakers,
    transcript_text: window.text.substring(0, 2000),
  }));

  const episodeInfo = episodeContext ? {
    title: episodeContext.title,
    show_name: episodeContext.showName,
    description: episodeContext.description,
  } : {
    title: "Unknown Episode",
    show_name: "Unknown Podcast",
    description: "",
  };

  const prompt = `You are the PodDNA Segment Labeler.

Your job:
- Read the podcast episode metadata and transcript segments below.
- Produce a short, human-readable TITLE for each segment that tells a listener what this part is about.

Rules for the title:
- 4-10 words.
- Focus on the main IDEA or TOPIC of the segment.
- Do NOT include timestamps, speaker lists, or filler like "at 9 minutes".
- Avoid clickbait and emojis.
- Use plain, neutral language (no ALL CAPS).
- Prefer "what is being discussed" over "who is speaking".
- If multiple ideas are present, choose the most important or unifying one.

If the segment is mostly filler (greetings, ads, breaks, music), use labels like:
- "Intro and Housekeeping"
- "Sponsored Ad Break"
- "Outro and Episode Wrap-up"

Never output speaker lists or phrases like:
- "Host and guest at 9 minutes"
- "Paul C. Brunson & Chris at 9m"

Always describe the topic, not who is speaking or when.

EPISODE CONTEXT:
Title: "${episodeInfo.title}"
Show: "${episodeInfo.show_name}"
Description: "${episodeInfo.description}"

SEGMENTS TO LABEL:
${JSON.stringify(segmentsPayload, null, 2)}

Return ONLY a valid JSON object with this exact structure (no markdown, no extra text):
{
  "segments": [
    {
      "segment_id": "seg_0",
      "start_seconds": 0,
      "end_seconds": 120,
      "label": "Topic Title Goes Here",
      "type": "topic",
      "confidence": 0.9
    }
  ]
}`;

  try {
    console.log(`[SEGMENT-GEN] Generating labels for ${transcriptWindows.length} segments...`);
    
    const response = await callGeminiJson(
      "gemini-2.5-flash",
      prompt,
      AiSegmentLabelsResponseSchema,
      { maxOutputTokens: 4096 }
    );

    const labeledSegments: AiSegmentLabel[] = response.segments;

    if (labeledSegments.length === 0) {
      console.warn(`[SEGMENT-GEN] No segments in response, using fallback labels`);
      return fallbackLabels(transcriptWindows);
    }

    const generatedSegments: GeneratedSegment[] = transcriptWindows.map((window, index) => {
      const matchingLabel = labeledSegments.find(
        ls => ls.segment_id === `seg_${index}` || 
             (ls.start_seconds === Math.round(window.startTime))
      );

      return {
        startTime: window.startTime,
        endTime: window.endTime,
        label: matchingLabel?.label || `Topic at ${formatTime(window.startTime)}`,
        snippetText: truncateText(window.text, 250),
        segmentType: matchingLabel?.type || "topic",
        confidence: matchingLabel?.confidence,
      };
    });

    console.log(`[SEGMENT-GEN] Successfully generated ${generatedSegments.length} segment labels`);
    return generatedSegments;

  } catch (error) {
    console.error(`[SEGMENT-GEN] Error generating labels:`, error);
    
    // Re-throw GeminiErrors so job runner can classify them
    if (error instanceof GeminiError) {
      throw error;
    }
    
    return fallbackLabels(transcriptWindows);
  }
}

function fallbackLabels(windows: TranscriptWindow[]): GeneratedSegment[] {
  return windows.map((window, index) => ({
    startTime: window.startTime,
    endTime: window.endTime,
    label: index === 0 ? "Episode Introduction" : `Topic at ${formatTime(window.startTime)}`,
    snippetText: truncateText(window.text, 250),
    segmentType: "topic",
  }));
}

export function groupTranscriptIntoWindows(
  segments: Array<{ startTime: number; endTime: number; text: string; speaker?: string | null }>,
  windowSeconds: number = 120
): TranscriptWindow[] {
  if (segments.length === 0) return [];

  const windows: TranscriptWindow[] = [];
  let currentWindow: typeof segments = [];
  let windowStart = segments[0].startTime;

  for (const segment of segments) {
    if (segment.startTime - windowStart >= windowSeconds && currentWindow.length > 0) {
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

function createWindow(
  segments: Array<{ startTime: number; endTime: number; text: string; speaker?: string | null }>
): TranscriptWindow {
  const combinedText = segments.map(s => s.text).join(" ");
  const speakerSet = new Set(segments.filter(s => s.speaker).map(s => s.speaker as string));
  const speakers = Array.from(speakerSet);
  
  return {
    startTime: segments[0].startTime,
    endTime: segments[segments.length - 1].endTime,
    text: combinedText,
    speakers,
  };
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0 
    ? `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
    : `${m}:${s.toString().padStart(2, "0")}`;
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const truncated = text.substring(0, maxLength);
  const lastSpaceIndex = truncated.lastIndexOf(" ");
  if (lastSpaceIndex > maxLength * 0.7) {
    return truncated.substring(0, lastSpaceIndex) + "...";
  }
  return truncated + "...";
}

export type { EpisodeContext, GeneratedSegment, TranscriptWindow };
