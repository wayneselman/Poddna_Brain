import { storage } from "../storage";
import { GeminiError } from "../ai/geminiClient";
import type { Job, InsertSponsorSegment, TranscriptSegment } from "@shared/schema";

export interface SponsorDetectionJobResult {
  sponsors: Array<{
    startTime: number;
    endTime: number | null;
    brand: string | null;
    confidence: number;
  }>;
  totalDetected: number;
}

const SPONSOR_PATTERNS: { pattern: RegExp; confidence: number; label: string }[] = [
  { pattern: /this episode is sponsored by/i, confidence: 85, label: "strong_sponsor" },
  { pattern: /this episode is brought to you by/i, confidence: 85, label: "strong_sponsor" },
  { pattern: /today['']?s sponsor is/i, confidence: 85, label: "strong_sponsor" },
  { pattern: /our sponsor for (this|today)/i, confidence: 80, label: "sponsor_mention" },
  { pattern: /brought to you by/i, confidence: 75, label: "sponsor_mention" },
  { pattern: /sponsored by/i, confidence: 75, label: "sponsor_mention" },
  { pattern: /thanks to .+ for sponsoring/i, confidence: 80, label: "thanks_sponsor" },
  { pattern: /support for this (show|podcast|episode) (comes|is provided|is brought)/i, confidence: 80, label: "support_mention" },
  { pattern: /our presenting sponsor/i, confidence: 85, label: "presenting_sponsor" },
  { pattern: /a word from our sponsor/i, confidence: 85, label: "ad_break" },
  { pattern: /let me tell you about/i, confidence: 50, label: "soft_pitch" },
  { pattern: /use (code|promo|coupon)\s+\w+/i, confidence: 70, label: "promo_code" },
  { pattern: /go to .+\.com\/\w+/i, confidence: 65, label: "tracking_url" },
  { pattern: /visit .+\.com\/\w+/i, confidence: 65, label: "tracking_url" },
  { pattern: /head (over )?to .+\.com/i, confidence: 60, label: "tracking_url" },
  { pattern: /get \d+%? off (at|with)/i, confidence: 65, label: "discount_offer" },
  { pattern: /free (trial|shipping|month)/i, confidence: 55, label: "promo_offer" },
];

const BRAND_EXTRACTION_PATTERNS = [
  /(?:sponsored by|brought to you by|today['']?s sponsor is|our sponsor)\s+([A-Z][A-Za-z0-9\s&]+?)(?:\.|,|!|\s+(?:is|has|offers|provides|gives|where|at|and|for|the))/i,
  /thanks to\s+([A-Z][A-Za-z0-9\s&]+?)\s+for sponsoring/i,
  /(?:use code|promo code|coupon code)\s+\w+\s+at\s+([A-Za-z0-9]+(?:\.com)?)/i,
  /(?:go to|visit|head to)\s+([A-Za-z0-9]+)\.com/i,
];

function extractBrand(text: string): string | null {
  for (const pattern of BRAND_EXTRACTION_PATTERNS) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const brand = match[1].trim();
      if (brand.length >= 2 && brand.length <= 50) {
        return brand.replace(/\s+/g, " ");
      }
    }
  }
  return null;
}

function findPatternMatch(text: string): { confidence: number; label: string } | null {
  for (const { pattern, confidence, label } of SPONSOR_PATTERNS) {
    if (pattern.test(text)) {
      return { confidence, label };
    }
  }
  return null;
}

function buildExcerpt(segments: TranscriptSegment[], matchIndex: number, maxChars: number = 300): string {
  const parts: string[] = [];
  let totalLength = 0;
  
  parts.push(segments[matchIndex].text);
  totalLength = segments[matchIndex].text.length;
  
  if (matchIndex + 1 < segments.length && totalLength < maxChars) {
    const next = segments[matchIndex + 1].text;
    if (totalLength + next.length <= maxChars) {
      parts.push(next);
      totalLength += next.length;
    }
  }
  
  if (matchIndex > 0 && totalLength < maxChars) {
    const prev = segments[matchIndex - 1].text;
    if (totalLength + prev.length <= maxChars) {
      parts.unshift(prev);
    }
  }
  
  return parts.join(" ").trim();
}

export async function handleDetectSponsorsJob(
  job: Job,
  onProgress?: (message: string, percentage: number) => void
): Promise<SponsorDetectionJobResult> {
  console.log(`[DETECT-SPONSORS] Starting sponsor detection job ${job.id}`);

  const source = await storage.getEpisodeSource(job.episodeSourceId);
  if (!source) {
    throw new GeminiError(`Episode source not found: ${job.episodeSourceId}`, false, "NOT_FOUND");
  }

  const episode = await storage.getEpisode(source.episodeId);
  if (!episode) {
    throw new GeminiError(`Episode not found for source: ${job.episodeSourceId}`, false, "NOT_FOUND");
  }

  onProgress?.("Loading transcript segments...", 10);

  const segments = await storage.getSegmentsByEpisode(source.episodeId);
  if (segments.length === 0) {
    console.log(`[DETECT-SPONSORS] No transcript segments found for episode ${source.episodeId}`);
    await storage.replaceSponsorSegmentsForEpisode(source.episodeId, []);
    return { sponsors: [], totalDetected: 0 };
  }

  console.log(`[DETECT-SPONSORS] Scanning ${segments.length} segments for sponsor patterns`);
  onProgress?.(`Scanning ${segments.length} transcript segments...`, 30);

  const detectedSponsors: InsertSponsorSegment[] = [];
  const processedRanges: Array<{ start: number; end: number }> = [];

  function isOverlapping(startTime: number, endTime: number): boolean {
    for (const range of processedRanges) {
      if (startTime <= range.end && endTime >= range.start) {
        return true;
      }
    }
    return false;
  }

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const match = findPatternMatch(segment.text);
    
    if (match) {
      const startTime = segment.startTime;
      const endTime = segment.endTime ?? (startTime + 30);
      
      if (isOverlapping(startTime, endTime)) {
        continue;
      }
      
      const brand = extractBrand(segment.text);
      const excerpt = buildExcerpt(segments, i);
      
      detectedSponsors.push({
        episodeId: source.episodeId,
        startTime,
        endTime,
        brand,
        confidence: match.confidence,
        excerpt,
      });
      
      processedRanges.push({ start: startTime, end: endTime + 60 });
      
      console.log(`[DETECT-SPONSORS] Found sponsor at ${startTime}s: ${match.label} (${match.confidence}% confidence)${brand ? `, brand: ${brand}` : ""}`);
    }
    
    if (i % 100 === 0) {
      const progress = 30 + Math.floor((i / segments.length) * 50);
      onProgress?.(`Scanning segment ${i + 1}/${segments.length}...`, progress);
    }
  }

  onProgress?.("Saving sponsor segments...", 90);
  
  detectedSponsors.sort((a, b) => a.startTime - b.startTime);
  
  await storage.replaceSponsorSegmentsForEpisode(source.episodeId, detectedSponsors);

  console.log(`[DETECT-SPONSORS] Completed: found ${detectedSponsors.length} sponsor segments for episode ${source.episodeId}`);
  onProgress?.("Sponsor detection complete", 100);

  return {
    sponsors: detectedSponsors.map(s => ({
      startTime: s.startTime,
      endTime: s.endTime ?? null,
      brand: s.brand ?? null,
      confidence: s.confidence,
    })),
    totalDetected: detectedSponsors.length,
  };
}
