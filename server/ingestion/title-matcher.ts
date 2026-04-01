/**
 * Title matching utility for resolving RSS episodes to YouTube videos
 */

export interface MatchCandidate {
  eventId: string;
  title: string;
  videoUrl: string;
  publishedAt: Date | null;
  score: number;
}

export interface MatchResult {
  matched: boolean;
  candidate?: MatchCandidate;
  score: number;
  reason: string;
}

/**
 * Normalize a title for comparison:
 * - Lowercase
 * - Remove common prefixes like episode numbers, "#123", "Ep.", etc.
 * - Remove special characters and extra whitespace
 * - Trim
 */
export function normalizeTitle(title: string): string {
  if (!title) return "";
  
  let normalized = title.toLowerCase();
  
  // Remove common episode number patterns
  // "#123 - Title" or "Ep 123:" or "Episode 123 -" or "#123:"
  normalized = normalized.replace(/^(#\d+\s*[-:.]?\s*)/i, "");
  normalized = normalized.replace(/^(ep\.?\s*\d+\s*[-:.]?\s*)/i, "");
  normalized = normalized.replace(/^(episode\s*\d+\s*[-:.]?\s*)/i, "");
  
  // Remove "| Podcast Name" or "- Podcast Name" suffixes (often added to YouTube titles)
  normalized = normalized.replace(/\s*[|\-]\s*(my first million|mfm|podcast|full episode).*$/i, "");
  
  // Remove special characters except alphanumeric and spaces
  normalized = normalized.replace(/[^\w\s]/g, " ");
  
  // Collapse multiple spaces
  normalized = normalized.replace(/\s+/g, " ");
  
  return normalized.trim();
}

/**
 * Calculate Jaccard similarity between two strings (word-based)
 */
export function jaccardSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.split(/\s+/).filter(w => w.length > 2));
  const wordsB = new Set(b.split(/\s+/).filter(w => w.length > 2));
  
  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  
  const intersection = new Set([...wordsA].filter(x => wordsB.has(x)));
  const union = new Set([...wordsA, ...wordsB]);
  
  return intersection.size / union.size;
}

/**
 * Levenshtein distance between two strings
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculate normalized Levenshtein similarity (0 to 1)
 */
export function levenshteinSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(a, b) / maxLen;
}

/**
 * Combined similarity score using both Jaccard and Levenshtein
 */
export function combinedSimilarity(titleA: string, titleB: string): number {
  const normA = normalizeTitle(titleA);
  const normB = normalizeTitle(titleB);
  
  // Exact match after normalization
  if (normA === normB) return 1.0;
  
  const jaccard = jaccardSimilarity(normA, normB);
  const levenshtein = levenshteinSimilarity(normA, normB);
  
  // Weight Jaccard more heavily (word overlap is more important)
  return jaccard * 0.6 + levenshtein * 0.4;
}

/**
 * Check if two dates are within a given window (days)
 */
export function datesWithinWindow(dateA: Date | null, dateB: Date | null, windowDays: number): boolean {
  if (!dateA || !dateB) return true; // If either is null, don't filter by date
  
  const diffMs = Math.abs(dateA.getTime() - dateB.getTime());
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  
  return diffDays <= windowDays;
}

/**
 * Find the best YouTube match for an RSS episode
 */
export function findBestMatch(
  rssTitle: string,
  rssPublishedAt: Date | null,
  youtubeCandidates: Array<{
    eventId: string;
    title: string;
    videoUrl: string;
    publishedAt: Date | null;
  }>,
  options: {
    minScore?: number;
    dateWindowDays?: number;
  } = {}
): MatchResult {
  const { minScore = 0.5, dateWindowDays = 7 } = options;
  
  if (youtubeCandidates.length === 0) {
    return { matched: false, score: 0, reason: "No YouTube candidates in program" };
  }
  
  let bestCandidate: MatchCandidate | undefined;
  let bestScore = 0;
  
  for (const candidate of youtubeCandidates) {
    // Filter by date proximity first
    if (!datesWithinWindow(rssPublishedAt, candidate.publishedAt, dateWindowDays)) {
      continue;
    }
    
    const score = combinedSimilarity(rssTitle, candidate.title);
    
    if (score > bestScore) {
      bestScore = score;
      bestCandidate = {
        eventId: candidate.eventId,
        title: candidate.title,
        videoUrl: candidate.videoUrl,
        publishedAt: candidate.publishedAt,
        score,
      };
    }
  }
  
  if (!bestCandidate) {
    return { matched: false, score: 0, reason: "No candidates within date window" };
  }
  
  if (bestScore < minScore) {
    return { 
      matched: false, 
      candidate: bestCandidate,
      score: bestScore, 
      reason: `Best match score ${bestScore.toFixed(2)} below threshold ${minScore}` 
    };
  }
  
  console.log(`[TITLE-MATCHER] Match found: "${rssTitle}" -> "${bestCandidate.title}" (score: ${bestScore.toFixed(2)})`);
  
  return {
    matched: true,
    candidate: bestCandidate,
    score: bestScore,
    reason: `Matched with score ${bestScore.toFixed(2)}`,
  };
}
