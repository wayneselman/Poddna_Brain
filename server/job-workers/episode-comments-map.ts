import { storage } from "../storage";
import { callGeminiJson, GeminiError } from "../ai/geminiClient";
import { z } from "zod";
import type { Job, EpisodeComment, EpisodeSegment } from "@shared/schema";

type ProgressCallback = (message: string, percentage: number) => void;

const GENERAL_SEGMENT_ID = 'general_episode';
const TIMESTAMP_REGEX = /\b(\d{1,2}:\d{2}(?::\d{2})?)\b/g;
const BATCH_SIZE = 25;
const MAX_CONSECUTIVE_FAILURES = 5;

const SentimentOnlySchema = z.object({
  sentiment: z.enum(['positive', 'negative', 'neutral', 'debate', 'confused', 'funny']),
  confidence: z.number().min(0).max(1),
});

const MappingResultSchema = z.object({
  primary_segment_index: z.number().nullable(),
  secondary_segment_index: z.number().nullable(),
  applies_to_entire_episode: z.boolean(),
  sentiment_label: z.enum(['positive', 'negative', 'neutral', 'debate', 'confused', 'funny']),
  confidence: z.number().min(0).max(1),
});

type MappingResult = z.infer<typeof MappingResultSchema>;
type SentimentLabel = 'positive' | 'negative' | 'neutral' | 'debate' | 'confused' | 'funny';

interface SegmentSentimentSummary {
  positive: number;
  negative: number;
  neutral: number;
  debate: number;
  confused: number;
  funny: number;
  totalComments: number;
  topComments: Array<{
    id: string;
    text: string;
    sentiment: string;
    likeCount: number;
  }>;
}

interface CommentLink {
  commentId: string;
  segmentId: string;
  sentiment: SentimentLabel;
  confidence: number;
}

interface JobMetrics {
  totalComments: number;
  processed: number;
  successful: number;
  failed: number;
  retries: number;
  timestampMatches: number;
  llmMappings: number;
  generalBucket: number;
  geminiErrors: number;
}

function extractVideoTimestampFromCommentText(text: string): number | null {
  const matches = text.match(TIMESTAMP_REGEX);
  if (!matches) return null;
  for (const token of matches) {
    const ms = parseTimestampToMs(token);
    if (ms !== null) return ms;
  }
  return null;
}

function parseTimestampToMs(token: string): number | null {
  const parts = token.split(':').map(p => parseInt(p, 10));
  if (parts.some(isNaN)) return null;
  if (parts.length === 2) {
    const [min, sec] = parts;
    return (min * 60 + sec) * 1000;
  } else if (parts.length === 3) {
    const [hr, min, sec] = parts;
    return (hr * 3600 + min * 60 + sec) * 1000;
  }
  return null;
}

function findSegmentByTimestamp(
  segments: EpisodeSegment[],
  tsMs: number
): EpisodeSegment | null {
  const tsSec = tsMs / 1000;
  
  let seg = segments.find(s => {
    const endTime = s.endTime ?? (s.startTime + 300);
    return tsSec >= s.startTime && tsSec <= endTime;
  });
  if (seg) return seg;

  let best: EpisodeSegment | null = null;
  let bestDelta = Infinity;

  for (const s of segments) {
    const endTime = s.endTime ?? (s.startTime + 300);
    const center = (s.startTime + endTime) / 2;
    const delta = Math.abs(center - tsSec);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = s;
    }
  }

  if (best && bestDelta <= 90) return best;
  return null;
}

async function analyzeSentimentOnly(commentText: string): Promise<{ sentiment: SentimentLabel; confidence: number }> {
  const prompt = `Classify the sentiment of this YouTube comment about a podcast episode.

Comment: "${commentText.slice(0, 500)}"

Sentiment labels:
- "positive": praising, agreeing, enthusiastic, supportive
- "negative": criticizing, disagreeing, complaining
- "neutral": informational, factual, questions without strong opinion
- "debate": challenging claims, counter-arguments, controversial takes
- "confused": expressing confusion, asking for clarification
- "funny": jokes, humor, sarcasm, memes

Return JSON with this exact structure:
{
  "sentiment": "positive|negative|neutral|debate|confused|funny",
  "confidence": 0.85
}

Confidence is 0-1 how sure you are about the classification.`;

  return await callGeminiJson(
    "gemini-2.5-flash",
    prompt,
    SentimentOnlySchema,
    { temperature: 0.2, maxOutputTokens: 256 }
  );
}

async function mapCommentToSegmentUsingLlm(
  segments: EpisodeSegment[],
  commentText: string,
  commentTimestampStr: string | null
): Promise<MappingResult> {
  const segmentsJson = segments.map((s, idx) => ({
    segment_index: idx,
    start_time: formatSeconds(s.startTime),
    end_time: formatSeconds(s.endTime ?? s.startTime + 300),
    title: s.label || `Segment ${idx + 1}`,
    summary: (s.summary || '').slice(0, 200),
  }));

  const systemPrompt = `You are an analyst that maps YouTube comments to specific segments of a podcast episode.

You are given:
- A list of episode segments with start/end times, titles, and summaries.
- A single viewer comment.
- Optionally, a timestamp extracted from the comment text.

Your goals:
1. Decide whether this comment is about:
   - A specific segment of the episode, or
   - The episode in general (overall tone, hosts, show quality, etc.)
2. If about specific content, choose the ONE best segment_index.
   Optionally provide a secondary segment_index if another is also relevant.
3. Classify the sentiment using one of these labels ONLY:
   - "positive", "negative", "neutral", "debate", "confused", "funny"
4. Provide a confidence score between 0 and 1.

IMPORTANT RULES:
- Do NOT guess a specific segment if the comment refers to the show or hosts in general.
- Do NOT always choose the first segment (segment_index 0) by default.
- If you are not at least moderately confident, set applies_to_entire_episode = true.
- Comments like "great podcast!", "love you guys", "first!" are about the episode in general.`;

  const userPrompt = `EPISODE SEGMENTS (JSON):
${JSON.stringify(segmentsJson, null, 2)}

VIEWER COMMENT:
"${commentText.slice(0, 500)}"

EXTRACTED TIMESTAMP (if any):
${commentTimestampStr || 'null'}

TASK:
1. If the comment is about a specific part of the episode, choose:
   - primary_segment_index: the single best segment index (0-based)
   - secondary_segment_index: another relevant segment, or null
2. If the comment is about the episode/show in general, set:
   - applies_to_entire_episode = true
   - primary_segment_index = null
3. Choose ONE sentiment_label from: "positive", "negative", "neutral", "debate", "confused", "funny"
4. Return a confidence score between 0 and 1.

Respond ONLY with a single JSON object:
{
  "primary_segment_index": number | null,
  "secondary_segment_index": number | null,
  "applies_to_entire_episode": boolean,
  "sentiment_label": "positive" | "negative" | "neutral" | "debate" | "confused" | "funny",
  "confidence": number
}`;

  return await callGeminiJson(
    "gemini-2.5-flash",
    `${systemPrompt}\n\n${userPrompt}`,
    MappingResultSchema,
    { temperature: 0.3, maxOutputTokens: 512 }
  );
}

function formatSeconds(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

async function processCommentBatch(
  batch: EpisodeComment[],
  sortedSegments: EpisodeSegment[],
  metrics: JobMetrics
): Promise<{ links: CommentLink[]; failed: number }> {
  const links: CommentLink[] = [];
  let consecutiveFailures = 0;
  let batchFailed = 0;

  for (const comment of batch) {
    metrics.processed++;
    
    try {
      let targetSegmentId: string = GENERAL_SEGMENT_ID;
      let sentiment: SentimentLabel = 'neutral';
      let confidence = 0.5;

      const tsMs = extractVideoTimestampFromCommentText(comment.text);

      if (tsMs !== null) {
        const seg = findSegmentByTimestamp(sortedSegments, tsMs);
        if (seg) {
          targetSegmentId = seg.id;
          const sentimentResult = await analyzeSentimentOnly(comment.text);
          sentiment = sentimentResult.sentiment;
          confidence = 0.9;
          metrics.timestampMatches++;
          metrics.successful++;
          consecutiveFailures = 0;
          
          links.push({ commentId: comment.id, segmentId: targetSegmentId, sentiment, confidence });
          continue;
        }
      }

      const extractedTimestampStr = tsMs !== null ? formatSeconds(tsMs / 1000) : null;
      const llm = await mapCommentToSegmentUsingLlm(sortedSegments, comment.text, extractedTimestampStr);
      metrics.llmMappings++;

      sentiment = llm.sentiment_label;
      confidence = llm.confidence;

      if (
        llm.applies_to_entire_episode ||
        llm.primary_segment_index === null ||
        confidence < 0.45
      ) {
        metrics.generalBucket++;
        metrics.successful++;
        consecutiveFailures = 0;
        links.push({ commentId: comment.id, segmentId: GENERAL_SEGMENT_ID, sentiment, confidence });
        continue;
      }

      let chosenIdx = llm.primary_segment_index;
      if (
        chosenIdx === 0 &&
        confidence < 0.7 &&
        llm.secondary_segment_index !== null
      ) {
        chosenIdx = llm.secondary_segment_index;
      }

      const seg = sortedSegments[chosenIdx];
      if (!seg) {
        links.push({ commentId: comment.id, segmentId: GENERAL_SEGMENT_ID, sentiment, confidence });
        metrics.generalBucket++;
      } else {
        links.push({ commentId: comment.id, segmentId: seg.id, sentiment, confidence });
      }
      
      metrics.successful++;
      consecutiveFailures = 0;

    } catch (err) {
      metrics.failed++;
      batchFailed++;
      consecutiveFailures++;
      
      if (err instanceof GeminiError) {
        metrics.geminiErrors++;
        console.error(`[COMMENTS-MAP] Gemini error for comment ${comment.id}:`, err.message);
      } else {
        console.error(`[COMMENTS-MAP] Error processing comment ${comment.id}:`, err);
      }

      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        console.error(`[COMMENTS-MAP] ${MAX_CONSECUTIVE_FAILURES} consecutive failures - stopping batch`);
        throw new GeminiError(
          `Too many consecutive failures (${consecutiveFailures}). Last error: ${err instanceof Error ? err.message : String(err)}`,
          true,
          "BATCH_FAILURE"
        );
      }

      links.push({
        commentId: comment.id,
        segmentId: GENERAL_SEGMENT_ID,
        sentiment: 'neutral',
        confidence: 0.3,
      });
      metrics.generalBucket++;
    }
  }

  return { links, failed: batchFailed };
}

export async function handleEpisodeCommentsMapJob(
  job: Job,
  onProgress: ProgressCallback
): Promise<{ success: boolean; message: string }> {
  const source = await storage.getEpisodeSource(job.episodeSourceId);
  if (!source) {
    throw new GeminiError(`Episode source not found: ${job.episodeSourceId}`, false);
  }

  const episodeId = source.episodeId;

  onProgress("Loading comments and segments...", 5);

  const [comments, segments, episode] = await Promise.all([
    storage.getCommentsByEpisode(episodeId),
    storage.getEpisodeSegmentsByEpisode(episodeId),
    storage.getEpisode(episodeId),
  ]);

  if (!episode) {
    throw new GeminiError(`Episode ${episodeId} not found`, false);
  }

  if (comments.length === 0) {
    onProgress("No comments to analyze", 100);
    return { success: true, message: "No comments found for this episode" };
  }

  if (segments.length === 0) {
    onProgress("No segments to link comments to", 100);
    return { success: true, message: "No segments found for this episode" };
  }

  console.log(`[COMMENTS-MAP] Processing ${comments.length} comments for episode ${episodeId}`);
  console.log(`[COMMENTS-MAP] Episode has ${segments.length} segments`);

  const metrics: JobMetrics = {
    totalComments: comments.length,
    processed: 0,
    successful: 0,
    failed: 0,
    retries: 0,
    timestampMatches: 0,
    llmMappings: 0,
    generalBucket: 0,
    geminiErrors: 0,
  };

  const sortedSegments = [...segments].sort((a, b) => a.startTime - b.startTime);
  const allLinks: CommentLink[] = [];
  const batches: EpisodeComment[][] = [];

  for (let i = 0; i < comments.length; i += BATCH_SIZE) {
    batches.push(comments.slice(i, i + BATCH_SIZE));
  }

  console.log(`[COMMENTS-MAP] Split into ${batches.length} batches of up to ${BATCH_SIZE} comments`);

  onProgress(`Processing ${comments.length} comments in ${batches.length} batches...`, 10);

  let allBatchesSucceeded = true;

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx];
    const batchProgress = 10 + Math.floor(((batchIdx + 1) / batches.length) * 70);
    
    onProgress(`Processing batch ${batchIdx + 1}/${batches.length} (${batch.length} comments)...`, batchProgress);

    try {
      const { links } = await processCommentBatch(batch, sortedSegments, metrics);
      allLinks.push(...links);
      
      console.log(`[COMMENTS-MAP] Batch ${batchIdx + 1} complete: ${links.length} links, ${metrics.failed} total failures so far`);
    } catch (err) {
      console.error(`[COMMENTS-MAP] Batch ${batchIdx + 1} failed critically:`, err);
      allBatchesSucceeded = false;
      break;
    }
  }

  if (!allBatchesSucceeded) {
    console.log(`[COMMENTS-MAP] Job aborted - keeping existing links intact. Processed ${metrics.processed}/${metrics.totalComments} comments before failure.`);
    throw new GeminiError(
      `Job failed after processing ${metrics.processed}/${metrics.totalComments} comments. Existing data preserved.`,
      true,
      "PARTIAL_FAILURE"
    );
  }

  if (allLinks.length === 0) {
    throw new GeminiError("No comments could be processed - all failed", true, "COMPLETE_FAILURE");
  }

  onProgress("Committing results to database...", 85);

  const realLinks = allLinks.filter(l => l.segmentId !== GENERAL_SEGMENT_ID);
  const generalCount = allLinks.length - realLinks.length;

  console.log(`[COMMENTS-MAP] All batches succeeded - atomic commit: ${realLinks.length} segment links, ${generalCount} general bucket`);

  await storage.deleteSegmentLinksByEpisode(episodeId);

  let linksCreated = 0;
  for (const link of realLinks) {
    try {
      await storage.createCommentSegmentLink({
        commentId: link.commentId,
        segmentId: link.segmentId,
        sentimentLabel: link.sentiment,
        confidence: Math.round(link.confidence * 100),
      });
      linksCreated++;
    } catch (err) {
      console.error(`[COMMENTS-MAP] Error creating link:`, err);
    }
  }

  onProgress("Updating segment engagement scores...", 90);

  const segmentLinksMap = new Map<string, CommentLink[]>();
  for (const link of realLinks) {
    if (!segmentLinksMap.has(link.segmentId)) {
      segmentLinksMap.set(link.segmentId, []);
    }
    segmentLinksMap.get(link.segmentId)!.push(link);
  }

  await updateSegmentEngagementScores(segments, segmentLinksMap);

  const allSources = await storage.getEpisodeSourcesByEpisode(episodeId);
  const videoSource = allSources.find(s => s.kind === "video" && s.platform === "youtube");

  if (videoSource) {
    const visionJob = await storage.createJob({
      episodeSourceId: source.id,
      type: "episode_vision_enrich",
      status: "pending",
    });
    console.log(`[COMMENTS-MAP] Vision enrich job ${visionJob.id} queued for episode ${episodeId}`);
  }

  console.log(`[COMMENTS-MAP] Job complete. Metrics:`, metrics);

  const distribution: Record<string, number> = { general: generalCount };
  segmentLinksMap.forEach((segLinks, segId) => {
    const seg = segments.find(s => s.id === segId);
    const label = seg?.label || segId.slice(0, 8);
    distribution[label] = segLinks.length;
  });
  console.log(`[COMMENTS-MAP] Distribution:`, distribution);

  onProgress("Comment mapping complete", 100);

  const successRate = Math.round((metrics.successful / metrics.totalComments) * 100);
  return {
    success: true,
    message: `Mapped ${allLinks.length}/${comments.length} comments (${successRate}% success): ${linksCreated} to segments, ${generalCount} to general. Gemini errors: ${metrics.geminiErrors}`,
  };
}

async function updateSegmentEngagementScores(
  segments: EpisodeSegment[],
  segmentLinksMap: Map<string, CommentLink[]>
): Promise<void> {
  for (const segment of segments) {
    const links = segmentLinksMap.get(segment.id) || [];

    if (links.length === 0) {
      await storage.updateSegmentEngagement(segment.id, 0, {
        positive: 0,
        negative: 0,
        neutral: 0,
        debate: 0,
        confused: 0,
        funny: 0,
        totalComments: 0,
        topComments: [],
      });
      continue;
    }

    const summary: SegmentSentimentSummary = {
      positive: 0,
      negative: 0,
      neutral: 0,
      debate: 0,
      confused: 0,
      funny: 0,
      totalComments: links.length,
      topComments: [],
    };

    for (const link of links) {
      summary[link.sentiment]++;
    }

    const total = links.length;
    const engagementScore = Math.min(100, Math.floor(
      (total * 5) +
      (summary.positive * 2) +
      (summary.debate * 3) +
      (summary.funny * 1)
    ));

    const linkedComments = await storage.getCommentsBySegment(segment.id);
    summary.topComments = linkedComments
      .slice(0, 3)
      .map(lc => ({
        id: lc.comment.id,
        text: lc.comment.text.slice(0, 200),
        sentiment: lc.sentimentLabel,
        likeCount: lc.comment.likeCount,
      }));

    await storage.updateSegmentEngagement(segment.id, engagementScore, summary);
  }
}
