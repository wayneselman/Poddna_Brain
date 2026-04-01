import type { TranscriptSegment } from "@shared/schema";

interface ViralMomentTimestamped {
  start_time: number;
  end_time: number;
  text: string;
  pull_quote: string;
  [key: string]: any;
}

export type SnapVerdict = "confirmed" | "uncertain" | "rejected";

interface SnapResult {
  snapped: boolean;
  verdict: SnapVerdict;
  confidence: number;
  originalStartTime: number;
  originalEndTime: number;
  driftSeconds: number;
  matchSource: "text" | "pull_quote" | "none";
}

const CONFIRMED_THRESHOLD = 0.5;
const UNCERTAIN_THRESHOLD = 0.25;

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractWords(text: string): string[] {
  return normalize(text).split(" ").filter(w => w.length > 2);
}

function getAnchorWords(text: string, count: number = 8): string[] {
  return extractWords(text).slice(0, count);
}

function wordOverlapScore(sourceWords: string[], targetWords: string[]): number {
  if (sourceWords.length === 0) return 0;
  const targetSet = new Set(targetWords);
  let matches = 0;
  for (const w of sourceWords) {
    if (targetSet.has(w)) matches++;
  }
  return matches / sourceWords.length;
}

function findAnchorPosition(
  anchorWords: string[],
  segmentTexts: { index: number; words: string[] }[],
  pairedTexts: { index: number; words: string[] }[]
): number {
  if (anchorWords.length === 0) return -1;

  let bestIndex = -1;
  let bestScore = 0;

  for (const seg of segmentTexts) {
    let matchCount = 0;
    for (const anchor of anchorWords) {
      if (seg.words.includes(anchor)) matchCount++;
    }
    const score = matchCount / anchorWords.length;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = seg.index;
    }
  }

  for (const pair of pairedTexts) {
    let matchCount = 0;
    for (const anchor of anchorWords) {
      if (pair.words.includes(anchor)) matchCount++;
    }
    const score = matchCount / anchorWords.length;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = pair.index;
    }
  }

  return bestScore >= 0.4 ? bestIndex : -1;
}

function buildWindowFromPosition(
  startIdx: number,
  segments: TranscriptSegment[],
  targetDuration: number
): { startTime: number; endTime: number; words: string[]; startIdx: number; endIdx: number } | null {
  if (startIdx < 0 || startIdx >= segments.length) return null;

  const windowStart = Math.max(0, startIdx - 2);
  let endIdx = windowStart;
  const allWords: string[] = [];
  const firstSeg = segments[windowStart];

  while (endIdx < segments.length) {
    const seg = segments[endIdx];
    const elapsed = seg.endTime - firstSeg.startTime;
    allWords.push(...extractWords(seg.text));
    if (elapsed >= targetDuration) break;
    endIdx++;
  }

  endIdx = Math.min(endIdx, segments.length - 1);

  return {
    startTime: segments[windowStart].startTime,
    endTime: segments[endIdx].endTime,
    words: allWords,
    startIdx: windowStart,
    endIdx,
  };
}

function slidingWindowSearch(
  searchWords: string[],
  segments: TranscriptSegment[],
  targetDuration: number,
  minConfidence: number
): { startTime: number; endTime: number; confidence: number } | null {
  if (searchWords.length === 0 || segments.length === 0) return null;

  let bestScore = 0;
  let bestStart = 0;
  let bestEnd = 0;

  for (let i = 0; i < segments.length; i++) {
    const windowWords: string[] = [];
    let endIdx = i;

    while (endIdx < segments.length) {
      windowWords.push(...extractWords(segments[endIdx].text));
      const elapsed = segments[endIdx].endTime - segments[i].startTime;
      if (elapsed >= targetDuration) break;
      endIdx++;
    }

    endIdx = Math.min(endIdx, segments.length - 1);
    const score = wordOverlapScore(searchWords, windowWords);

    if (score > bestScore) {
      bestScore = score;
      bestStart = segments[i].startTime;
      bestEnd = segments[endIdx].endTime;
    }
  }

  if (bestScore >= minConfidence) {
    return { startTime: bestStart, endTime: bestEnd, confidence: bestScore };
  }
  return null;
}

function classifyVerdict(confidence: number): SnapVerdict {
  if (confidence >= CONFIRMED_THRESHOLD) return "confirmed";
  if (confidence >= UNCERTAIN_THRESHOLD) return "uncertain";
  return "rejected";
}

export function snapMomentTimestamps<T extends ViralMomentTimestamped>(
  moments: T[],
  segments: TranscriptSegment[]
): { moments: T[]; snapResults: SnapResult[] } {
  if (!segments || segments.length === 0 || !moments || moments.length === 0) {
    return {
      moments,
      snapResults: moments.map(m => ({
        snapped: false,
        verdict: "rejected" as SnapVerdict,
        confidence: 0,
        originalStartTime: m.start_time,
        originalEndTime: m.end_time,
        driftSeconds: 0,
        matchSource: "none" as const,
      })),
    };
  }

  const sorted = [...segments].sort((a, b) => a.startTime - b.startTime);

  const segmentTexts = sorted.map((seg, index) => ({
    index,
    words: extractWords(seg.text),
  }));

  const pairedTexts: { index: number; words: string[] }[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    pairedTexts.push({
      index: i,
      words: [...extractWords(sorted[i].text), ...extractWords(sorted[i + 1].text)],
    });
  }

  const results: T[] = [];
  const snapResults: SnapResult[] = [];

  for (const moment of moments) {
    const originalStart = moment.start_time;
    const originalEnd = moment.end_time;
    const targetDuration = Math.max(25, Math.min(70, originalEnd - originalStart));

    let bestMatch: { startTime: number; endTime: number; confidence: number; source: "text" | "pull_quote" } | null = null;

    const pullQuoteAnchor = getAnchorWords(moment.pull_quote, 8);
    const pullQuoteWords = extractWords(moment.pull_quote);

    if (pullQuoteWords.length >= 3) {
      const pullQuoteIdx = findAnchorPosition(pullQuoteAnchor, segmentTexts, pairedTexts);

      if (pullQuoteIdx >= 0) {
        const window = buildWindowFromPosition(pullQuoteIdx, sorted, targetDuration);
        if (window) {
          const score = wordOverlapScore(pullQuoteWords, window.words);
          if (score > UNCERTAIN_THRESHOLD) {
            bestMatch = {
              startTime: window.startTime,
              endTime: window.endTime,
              confidence: score,
              source: "pull_quote",
            };
          }
        }
      }

      if (!bestMatch || bestMatch.confidence < 0.6) {
        const slidingResult = slidingWindowSearch(pullQuoteWords, sorted, targetDuration, 0.4);
        if (slidingResult && (!bestMatch || slidingResult.confidence > bestMatch.confidence)) {
          bestMatch = { ...slidingResult, source: "pull_quote" };
        }
      }
    }

    if (!bestMatch || bestMatch.confidence < 0.6) {
      const textAnchor = getAnchorWords(moment.text, 10);
      const textWords = extractWords(moment.text);
      const textIdx = findAnchorPosition(textAnchor, segmentTexts, pairedTexts);

      if (textIdx >= 0) {
        const window = buildWindowFromPosition(textIdx, sorted, targetDuration);
        if (window) {
          const score = wordOverlapScore(textWords, window.words);
          if (score > UNCERTAIN_THRESHOLD && (!bestMatch || score > bestMatch.confidence)) {
            bestMatch = {
              startTime: window.startTime,
              endTime: window.endTime,
              confidence: score,
              source: "text",
            };
          }
        }
      }

      if (!bestMatch || bestMatch.confidence < 0.4) {
        const slidingResult = slidingWindowSearch(textWords, sorted, targetDuration, 0.3);
        if (slidingResult && (!bestMatch || slidingResult.confidence > bestMatch.confidence)) {
          bestMatch = { ...slidingResult, source: "text" };
        }
      }
    }

    const confidence = bestMatch?.confidence ?? 0;
    const verdict = classifyVerdict(confidence);

    if (bestMatch && verdict !== "rejected") {
      const snappedMoment = {
        ...moment,
        start_time: bestMatch.startTime,
        end_time: bestMatch.endTime,
      };
      results.push(snappedMoment);
      snapResults.push({
        snapped: true,
        verdict,
        confidence,
        originalStartTime: originalStart,
        originalEndTime: originalEnd,
        driftSeconds: Math.abs(originalStart - bestMatch.startTime),
        matchSource: bestMatch.source,
      });
    } else {
      results.push({ ...moment });
      snapResults.push({
        snapped: false,
        verdict: "rejected",
        confidence,
        originalStartTime: originalStart,
        originalEndTime: originalEnd,
        driftSeconds: 0,
        matchSource: "none",
      });
    }
  }

  return { moments: results, snapResults };
}
