import { storage } from "./storage";
import type { 
  DiffMetrics, 
  DiffSamples, 
  DiffSampleAdded, 
  DiffSampleRemoved, 
  DiffSampleModified,
  DiffSourceType,
  EpisodeDiff,
  TranscriptSegment,
  SourceTranscriptSegment,
  EpisodeSource
} from "@shared/schema";

interface TextSegment {
  text: string;
  startTime: number;
  endTime: number;
}

interface DiffResult {
  metrics: DiffMetrics;
  samples: DiffSamples;
  summary: string;
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeIntoSentences(text: string): string[] {
  return text
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

function buildTextFromSegments(segments: TextSegment[]): string {
  return segments.map(s => s.text).join(' ');
}

function findNearestSegment(text: string, segments: TextSegment[]): TextSegment | undefined {
  const normalizedText = normalizeText(text);
  let bestMatch: TextSegment | undefined;
  let bestScore = 0;

  for (const segment of segments) {
    const segmentNormalized = normalizeText(segment.text);
    if (segmentNormalized.includes(normalizedText) || normalizedText.includes(segmentNormalized)) {
      const score = Math.min(normalizedText.length, segmentNormalized.length) / 
                    Math.max(normalizedText.length, segmentNormalized.length);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = segment;
      }
    }
  }

  if (!bestMatch && segments.length > 0) {
    for (const segment of segments) {
      const words = normalizeText(segment.text).split(' ');
      const searchWords = normalizedText.split(' ');
      const matchingWords = searchWords.filter(w => words.includes(w));
      const score = matchingWords.length / searchWords.length;
      if (score > bestScore && score > 0.3) {
        bestScore = score;
        bestMatch = segment;
      }
    }
  }

  return bestMatch;
}

function computeLCS(arr1: string[], arr2: string[]): Set<string> {
  const set1 = new Set(arr1.map(normalizeText));
  const set2 = new Set(arr2.map(normalizeText));
  const common = new Set<string>();
  
  const set1Array = Array.from(set1);
  for (const item of set1Array) {
    if (set2.has(item)) {
      common.add(item);
    }
  }
  
  return common;
}

function findSimilarSentence(sentence: string, sentences: string[], threshold = 0.5): string | undefined {
  const normalizedSearch = normalizeText(sentence);
  const searchWords = new Set(normalizedSearch.split(' '));
  const searchWordsArray = Array.from(searchWords);
  
  for (const candidate of sentences) {
    const normalizedCandidate = normalizeText(candidate);
    const candidateWords = new Set(normalizedCandidate.split(' '));
    const candidateWordsArray = Array.from(candidateWords);
    
    const intersection = searchWordsArray.filter(w => candidateWords.has(w));
    const unionSet = new Set([...searchWordsArray, ...candidateWordsArray]);
    const similarity = intersection.length / unionSet.size;
    
    if (similarity >= threshold && similarity < 0.95) {
      return candidate;
    }
  }
  
  return undefined;
}

export function computeDiff(
  primarySegments: TextSegment[],
  secondarySegments: TextSegment[],
  maxSamples: number = 5
): DiffResult {
  const primaryText = buildTextFromSegments(primarySegments);
  const secondaryText = buildTextFromSegments(secondarySegments);
  
  const primarySentences = tokenizeIntoSentences(primaryText);
  const secondarySentences = tokenizeIntoSentences(secondaryText);
  
  const primaryNormalized = primarySentences.map(normalizeText);
  const secondaryNormalized = secondarySentences.map(normalizeText);
  
  const commonSentences = computeLCS(primarySentences, secondarySentences);
  
  const added: DiffSampleAdded[] = [];
  const removed: DiffSampleRemoved[] = [];
  const modified: DiffSampleModified[] = [];
  
  const usedSecondary = new Set<number>();
  
  for (let i = 0; i < primarySentences.length; i++) {
    const sentence = primarySentences[i];
    const normalized = primaryNormalized[i];
    
    if (!commonSentences.has(normalized)) {
      const similarInSecondary = findSimilarSentence(sentence, secondarySentences);
      
      if (similarInSecondary && modified.length < maxSamples) {
        const secondaryIdx = secondarySentences.indexOf(similarInSecondary);
        if (secondaryIdx !== -1 && !usedSecondary.has(secondaryIdx)) {
          usedSecondary.add(secondaryIdx);
          const nearestSegment = findNearestSegment(sentence, primarySegments);
          modified.push({
            before: sentence,
            after: similarInSecondary,
            approxStartTime: nearestSegment?.startTime ?? 0,
            approxEndTime: nearestSegment?.endTime ?? 0,
          });
        }
      } else if (removed.length < maxSamples) {
        const nearestSegment = findNearestSegment(sentence, primarySegments);
        removed.push({
          text: sentence,
          approxStartTime: nearestSegment?.startTime ?? 0,
          approxEndTime: nearestSegment?.endTime ?? 0,
        });
      }
    }
  }
  
  for (let i = 0; i < secondarySentences.length; i++) {
    if (usedSecondary.has(i)) continue;
    
    const sentence = secondarySentences[i];
    const normalized = secondaryNormalized[i];
    
    if (!commonSentences.has(normalized) && added.length < maxSamples) {
      const nearestSegment = findNearestSegment(sentence, secondarySegments);
      added.push({
        text: sentence,
        approxStartTime: nearestSegment?.startTime ?? 0,
        approxEndTime: nearestSegment?.endTime ?? 0,
      });
    }
  }
  
  const addedCount = secondarySentences.filter((_, i) => 
    !usedSecondary.has(i) && !commonSentences.has(secondaryNormalized[i])
  ).length;
  
  const removedCount = primarySentences.filter((_, i) => 
    !commonSentences.has(primaryNormalized[i]) && 
    !modified.some(m => normalizeText(m.before) === primaryNormalized[i])
  ).length;
  
  const modifiedCount = modified.length;
  
  const totalSentences = Math.max(primarySentences.length, secondarySentences.length);
  const unchangedCount = commonSentences.size;
  const similarity = totalSentences > 0 ? unchangedCount / totalSentences : 1;
  
  const metrics: DiffMetrics = {
    similarity: Math.round(similarity * 100) / 100,
    addedCount,
    removedCount,
    modifiedCount,
    totalComparedChars: primaryText.length + secondaryText.length,
    totalComparedSegments: primarySegments.length + secondarySegments.length,
  };
  
  const samples: DiffSamples = {
    added,
    removed,
    modified,
  };
  
  const totalChanges = addedCount + removedCount + modifiedCount;
  const summary = totalChanges === 0
    ? "Transcripts are identical"
    : `${totalChanges} difference${totalChanges === 1 ? '' : 's'} found: ${addedCount} added, ${removedCount} removed, ${modifiedCount} modified`;
  
  return { metrics, samples, summary };
}

export async function getAvailableTranscriptSources(episodeId: string): Promise<{
  source: DiffSourceType;
  hasSegments: boolean;
  segmentCount: number;
  platform?: string;
  sourceId?: string;
}[]> {
  const results: {
    source: DiffSourceType;
    hasSegments: boolean;
    segmentCount: number;
    platform?: string;
    sourceId?: string;
  }[] = [];
  
  const canonicalSegments = await storage.getSegmentsByEpisode(episodeId);
  const episode = await storage.getEpisode(episodeId);
  
  if (canonicalSegments.length > 0 && episode) {
    const source = episode.transcriptSource as DiffSourceType || 'host';
    results.push({
      source,
      hasSegments: true,
      segmentCount: canonicalSegments.length,
    });
  }
  
  const episodeSources = await storage.getEpisodeSourcesByEpisode(episodeId);
  
  for (const epSource of episodeSources) {
    const sourceSegments = await storage.getSourceTranscriptSegmentsByEpisodeSource(epSource.id);
    
    if (sourceSegments.length > 0) {
      let source: DiffSourceType = 'rss';
      if (epSource.platform === 'youtube') {
        source = 'youtube';
      } else if (epSource.platform === 'podcast_host') {
        source = 'host';
      }
      
      const alreadyHasSource = results.some(r => r.source === source);
      if (!alreadyHasSource) {
        results.push({
          source,
          hasSegments: true,
          segmentCount: sourceSegments.length,
          platform: epSource.platform,
          sourceId: epSource.id,
        });
      }
    }
  }
  
  return results;
}

export async function getTranscriptSegmentsForSource(
  episodeId: string,
  source: DiffSourceType
): Promise<TextSegment[]> {
  if (source === 'host' || source === 'assembly') {
    const segments = await storage.getSegmentsByEpisode(episodeId);
    return segments.map(s => ({
      text: s.text,
      startTime: s.startTime,
      endTime: s.endTime,
    }));
  }
  
  const episodeSources = await storage.getEpisodeSourcesByEpisode(episodeId);
  
  let targetSource: EpisodeSource | undefined;
  for (const epSource of episodeSources) {
    if (source === 'youtube' && epSource.platform === 'youtube') {
      targetSource = epSource;
      break;
    }
    if (source === 'rss' && epSource.platform === 'podcast_host') {
      targetSource = epSource;
      break;
    }
  }
  
  if (!targetSource) {
    return [];
  }
  
  const segments = await storage.getSourceTranscriptSegmentsByEpisodeSource(targetSource.id);
  return segments.map(s => ({
    text: s.text,
    startTime: Math.floor(s.startTime / 1000),
    endTime: Math.ceil(s.endTime / 1000),
  }));
}

export async function runDiffForEpisode(
  episodeId: string,
  primarySource: DiffSourceType,
  secondarySource: DiffSourceType
): Promise<EpisodeDiff> {
  console.log(`[DIFF-ENGINE] Running diff for episode ${episodeId}: ${primarySource} vs ${secondarySource}`);
  
  const primarySegments = await getTranscriptSegmentsForSource(episodeId, primarySource);
  const secondarySegments = await getTranscriptSegmentsForSource(episodeId, secondarySource);
  
  if (primarySegments.length === 0) {
    throw new Error(`No transcript segments found for ${primarySource} source`);
  }
  
  if (secondarySegments.length === 0) {
    throw new Error(`No transcript segments found for ${secondarySource} source`);
  }
  
  console.log(`[DIFF-ENGINE] Comparing ${primarySegments.length} ${primarySource} segments vs ${secondarySegments.length} ${secondarySource} segments`);
  
  const { metrics, samples, summary } = computeDiff(primarySegments, secondarySegments);
  
  const diff = await storage.createEpisodeDiff({
    episodeId,
    primarySource,
    secondarySource,
    summary,
    metrics,
    samples,
  });
  
  console.log(`[DIFF-ENGINE] Diff complete: ${summary}`);
  
  return diff;
}

export async function getLatestDiff(episodeId: string): Promise<EpisodeDiff | undefined> {
  return await storage.getLatestEpisodeDiff(episodeId);
}

export async function getAllDiffsForEpisode(episodeId: string): Promise<EpisodeDiff[]> {
  return await storage.getEpisodeDiffsByEpisode(episodeId);
}
