import { Innertube } from "youtubei.js";
import { storage } from "./storage";
import { callGeminiJson, GeminiError } from "./ai/geminiClient";
import { z } from "zod";

interface TranscriptSegment {
  text: string;
  startTime: number;
  endTime: number;
}

interface SponsorSegment {
  startTime: number;
  endTime: number;
  brand: string | null;
  confidence: number;
  excerpt: string;
}

interface ClaimSegment {
  startTime: number;
  endTime: number | null;
  claimText: string;
  claimType: string;
  confidence: number;
}

interface AnalysisResults {
  videoTitle: string;
  videoDuration: number | null;
  channelName: string | null;
  transcriptSegmentCount: number;
  sponsors: SponsorSegment[];
  claims: ClaimSegment[];
  healthScore: number;
  summary: string;
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

function detectSponsors(segments: TranscriptSegment[]): SponsorSegment[] {
  const detectedSponsors: SponsorSegment[] = [];
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
      const endTime = segment.endTime || (startTime + 30);
      
      if (isOverlapping(startTime, endTime)) {
        continue;
      }
      
      const brand = extractBrand(segment.text);
      const excerpt = buildExcerpt(segments, i);
      
      detectedSponsors.push({
        startTime,
        endTime,
        brand,
        confidence: match.confidence,
        excerpt,
      });
      
      processedRanges.push({ start: startTime, end: endTime + 60 });
    }
  }

  return detectedSponsors.sort((a, b) => a.startTime - b.startTime);
}

const AiClaimsResponseSchema = z.object({
  claims: z.array(z.object({
    segmentIndex: z.number(),
    claimText: z.string(),
    claimType: z.enum(["financial", "medical", "sensitive", "other"]),
    confidence: z.number(),
  })),
});

const CHUNK_SIZE = 100;
const CHUNK_OVERLAP = 5;

function buildClaimsPrompt(segments: TranscriptSegment[], chunkOffset: number): string {
  const segmentTexts = segments.map((s, i) => 
    `[${chunkOffset + i}] ${s.text}`
  ).join("\n");

  return `You are an expert fact-checker analyzing podcast transcripts for claims that may require verification.

TASK: Extract claims from the following transcript segments that fall into these categories:

1. FINANCIAL: Claims about money, investments, markets, prices, revenue, costs, economic predictions
2. MEDICAL: Health claims, medical advice, treatment claims, drug/supplement claims
3. SENSITIVE: Claims about legal matters, political accusations, personal allegations, conspiracy theories
4. OTHER: Verifiable factual claims that could be fact-checked

IMPORTANT GUIDELINES:
- Only extract SPECIFIC, VERIFIABLE claims (not opinions or general statements)
- Include the segment index number where the claim appears
- Rate confidence from 0.0 to 1.0 based on how clearly stated the claim is
- Do NOT extract: personal opinions, subjective preferences, obvious jokes, or hypotheticals
- Limit to the TOP 10 most significant claims

TRANSCRIPT:
${segmentTexts}

Respond with JSON in this exact format:
{
  "claims": [
    {
      "segmentIndex": <number - the segment index from brackets>,
      "claimText": "<the specific claim being made>",
      "claimType": "financial" | "medical" | "sensitive" | "other",
      "confidence": <0.0 to 1.0>
    }
  ]
}

If no claims are found, return: {"claims": []}`;
}

async function detectClaims(segments: TranscriptSegment[]): Promise<ClaimSegment[]> {
  if (segments.length === 0) {
    return [];
  }

  const allClaims: Array<{ segmentIndex: number; claimText: string; claimType: string; confidence: number }> = [];
  const totalChunks = Math.ceil(segments.length / (CHUNK_SIZE - CHUNK_OVERLAP));

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const startIdx = chunkIndex * (CHUNK_SIZE - CHUNK_OVERLAP);
    const endIdx = Math.min(startIdx + CHUNK_SIZE, segments.length);
    const chunkSegments = segments.slice(startIdx, endIdx);

    try {
      const prompt = buildClaimsPrompt(chunkSegments, startIdx);
      const response = await callGeminiJson(
        "gemini-2.5-flash",
        prompt,
        AiClaimsResponseSchema,
        { temperature: 0.3, maxOutputTokens: 4096 }
      );

      if (response.claims && response.claims.length > 0) {
        for (const claim of response.claims) {
          if (claim.segmentIndex >= 0 && claim.segmentIndex < segments.length) {
            allClaims.push(claim);
          }
        }
      }
    } catch (err: any) {
      console.error(`[ANALYZER] Error detecting claims in chunk ${chunkIndex + 1}:`, err.message);
    }
  }

  const seenClaims = new Set<string>();
  const uniqueClaims: ClaimSegment[] = [];

  for (const claim of allClaims) {
    const segment = segments[claim.segmentIndex];
    if (!segment) continue;

    const claimKey = claim.claimText.toLowerCase().trim();
    if (seenClaims.has(claimKey)) continue;
    seenClaims.add(claimKey);

    uniqueClaims.push({
      startTime: Math.floor(segment.startTime),
      endTime: segment.endTime ? Math.ceil(segment.endTime) : null,
      claimText: claim.claimText,
      claimType: claim.claimType,
      confidence: Math.round(claim.confidence * 100),
    });
  }

  return uniqueClaims.sort((a, b) => a.startTime - b.startTime);
}

function calculateHealthScore(sponsors: SponsorSegment[], claims: ClaimSegment[], transcriptLength: number): number {
  let score = 100;
  
  const sponsorDeduction = Math.min(sponsors.length * 3, 15);
  score -= sponsorDeduction;
  
  const highConfidenceClaims = claims.filter(c => c.confidence >= 70);
  const sensitiveOrMedicalClaims = claims.filter(c => c.claimType === "sensitive" || c.claimType === "medical");
  
  score -= Math.min(highConfidenceClaims.length * 2, 20);
  score -= Math.min(sensitiveOrMedicalClaims.length * 5, 25);
  
  if (transcriptLength < 50) {
    score -= 10;
  }
  
  return Math.max(0, Math.min(100, Math.round(score)));
}

function generateSummary(sponsors: SponsorSegment[], claims: ClaimSegment[], healthScore: number): string {
  const parts: string[] = [];
  
  if (healthScore >= 80) {
    parts.push("This episode appears to have high integrity.");
  } else if (healthScore >= 60) {
    parts.push("This episode has moderate integrity concerns.");
  } else {
    parts.push("This episode has significant integrity concerns that warrant attention.");
  }
  
  if (sponsors.length > 0) {
    const brands = sponsors.map(s => s.brand).filter((b): b is string => b !== null);
    const uniqueBrands = Array.from(new Set(brands));
    if (uniqueBrands.length > 0) {
      parts.push(`Found ${sponsors.length} sponsor segment(s) from: ${uniqueBrands.slice(0, 3).join(", ")}${uniqueBrands.length > 3 ? ` and ${uniqueBrands.length - 3} more` : ""}.`);
    } else {
      parts.push(`Found ${sponsors.length} sponsor segment(s).`);
    }
  } else {
    parts.push("No sponsor segments detected.");
  }
  
  if (claims.length > 0) {
    const claimsByType: Record<string, number> = {};
    for (const claim of claims) {
      claimsByType[claim.claimType] = (claimsByType[claim.claimType] || 0) + 1;
    }
    const typeBreakdown = Object.entries(claimsByType)
      .map(([type, count]) => `${count} ${type}`)
      .join(", ");
    parts.push(`Detected ${claims.length} verifiable claim(s): ${typeBreakdown}.`);
  } else {
    parts.push("No significant verifiable claims detected.");
  }
  
  return parts.join(" ");
}

async function fetchVideoMetadataViaOEmbed(videoId: string): Promise<{ title: string; author: string } | null> {
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const response = await fetch(oembedUrl);
    if (response.ok) {
      const data = await response.json();
      return {
        title: data.title || "",
        author: data.author_name || "",
      };
    }
  } catch (err) {
    console.log(`[ANALYZER] oEmbed fetch failed for ${videoId}, will use Innertube data`);
  }
  return null;
}

export async function processAnalyzerRequest(requestId: string, youtubeUrl: string, videoId: string): Promise<void> {
  console.log(`[ANALYZER] Processing request ${requestId} for video ${videoId}`);
  
  try {
    await storage.updateAnalyzerRequestStatus(requestId, "processing");
    
    // Try oEmbed first for reliable metadata
    const oembedData = await fetchVideoMetadataViaOEmbed(videoId);
    
    console.log(`[ANALYZER] Creating Innertube client...`);
    const yt = await Innertube.create();
    
    console.log(`[ANALYZER] Fetching video info for ${videoId}...`);
    const info = await yt.getInfo(videoId);
    
    // Prefer oEmbed data (more reliable), fallback to Innertube data
    let videoTitle = "Unknown Title";
    if (oembedData?.title) {
      videoTitle = oembedData.title;
    } else if (info.basic_info?.title) {
      videoTitle = info.basic_info.title;
    } else if ((info as any).primary_info?.title?.text) {
      videoTitle = (info as any).primary_info.title.text;
    }
    
    let channelName: string | null = null;
    if (oembedData?.author) {
      channelName = oembedData.author;
    } else if (info.basic_info?.channel?.name) {
      channelName = info.basic_info.channel.name;
    } else if ((info as any).basic_info?.author) {
      channelName = (info as any).basic_info.author;
    }
    
    const videoDuration = info.basic_info?.duration || null;
    
    console.log(`[ANALYZER] Video info - Title: "${videoTitle}", Channel: "${channelName || "Unknown"}", Source: ${oembedData ? "oEmbed" : "Innertube"}`);
    
    console.log(`[ANALYZER] Fetching transcript...`);
    const transcriptInfo = await info.getTranscript();
    
    if (!transcriptInfo?.transcript?.content?.body?.initial_segments) {
      throw new Error("No captions available for this YouTube video. The video may not have auto-generated or manual captions.");
    }
    
    const rawSegments = transcriptInfo.transcript.content.body.initial_segments;
    
    const segments: TranscriptSegment[] = rawSegments
      .filter((seg: any) => seg.type === "TranscriptSegment")
      .map((seg: any) => ({
        text: seg.snippet?.text || "",
        startTime: (parseInt(seg.start_ms) || 0) / 1000,
        endTime: (parseInt(seg.end_ms) || 0) / 1000,
      }))
      .filter((seg: TranscriptSegment) => seg.text.trim().length > 0);
    
    console.log(`[ANALYZER] Got ${segments.length} transcript segments`);
    
    if (segments.length === 0) {
      throw new Error("Transcript segments were empty after filtering");
    }
    
    console.log(`[ANALYZER] Detecting sponsors...`);
    const sponsors = detectSponsors(segments);
    console.log(`[ANALYZER] Found ${sponsors.length} sponsor segments`);
    
    console.log(`[ANALYZER] Detecting claims (this may take a moment)...`);
    const claims = await detectClaims(segments);
    console.log(`[ANALYZER] Found ${claims.length} claims`);
    
    const healthScore = calculateHealthScore(sponsors, claims, segments.length);
    const summary = generateSummary(sponsors, claims, healthScore);
    
    const results: AnalysisResults = {
      videoTitle,
      videoDuration,
      channelName,
      transcriptSegmentCount: segments.length,
      sponsors,
      claims,
      healthScore,
      summary,
    };
    
    console.log(`[ANALYZER] Analysis complete. Health score: ${healthScore}`);
    
    await storage.updateAnalyzerRequestResults(requestId, results);
    
    console.log(`[ANALYZER] Request ${requestId} completed successfully`);
    
  } catch (error: any) {
    console.error(`[ANALYZER] Error processing request ${requestId}:`, error);
    
    const errorMessage = error.message || "An unexpected error occurred during analysis";
    await storage.updateAnalyzerRequestStatus(requestId, "error", errorMessage);
  }
}
