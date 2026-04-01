import https from "https";
import { db } from "../db";
import { storage } from "../storage";
import {
  jobs,
  episodeSources,
  sourceTranscripts,
  sourceTranscriptSegments,
  episodes,
  transcriptSegments,
  type Job,
  type EpisodeSource,
} from "@shared/schema";
import { eq, and, inArray } from "drizzle-orm";

const BATCH_SIZE = 10; // Max videos per API call (youtube-transcript.io limit)
const RATE_LIMIT_DELAY_MS = 2100; // Slightly over 2 seconds between batches to stay under 5 req/10s

interface TranscriptSegment {
  text: string;
  start: number;
  duration: number;
}

interface BatchTranscriptResult {
  videoId: string;
  segments: TranscriptSegment[] | null;
  error: string | null;
  trackInfo?: {
    languageCode: string;
    isGenerated: boolean;
  };
}

/**
 * Fetches transcripts for multiple videos in a single API call.
 * Returns results for all videos, with errors for any that failed.
 */
async function fetchBatchFromYouTubeTranscriptIO(
  videoIds: string[]
): Promise<BatchTranscriptResult[]> {
  const apiToken = process.env.YOUTUBE_TRANSCRIPT_API_TOKEN;
  if (!apiToken) {
    throw new Error("YOUTUBE_TRANSCRIPT_API_TOKEN not configured");
  }

  if (videoIds.length === 0) {
    return [];
  }

  if (videoIds.length > BATCH_SIZE) {
    throw new Error(`Batch size exceeds maximum of ${BATCH_SIZE}`);
  }

  console.log(
    `[BATCH-TRANSCRIPT] Fetching ${videoIds.length} videos in single API call`
  );

  const data = JSON.stringify({ ids: videoIds });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: "www.youtube-transcript.io",
      path: "/api/transcripts",
      method: "POST",
      headers: {
        Authorization: `Basic ${apiToken}`,
        "Content-Type": "application/json",
        "Content-Length": data.length,
      },
    };

    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        if (res.statusCode === 200) {
          try {
            const parsed = JSON.parse(body);
            if (!Array.isArray(parsed)) {
              reject(new Error("Unexpected response format from API"));
              return;
            }

            const results: BatchTranscriptResult[] = parsed.map(
              (videoResult: any) => {
                const videoId = videoResult.id || videoResult.videoId || "";

                if (videoResult.error) {
                  return {
                    videoId,
                    segments: null,
                    error: videoResult.error,
                  };
                }

                if (videoResult.tracks && videoResult.tracks.length > 0) {
                  const track = videoResult.tracks[0];
                  const transcriptData = track.transcript || track.segments;

                  if (transcriptData && Array.isArray(transcriptData)) {
                    const segments: TranscriptSegment[] = transcriptData
                      .map((seg: any) => {
                        const startVal = Number(seg.start) || 0;
                        const durVal = Number(seg.dur ?? seg.duration) || 0;
                        return {
                          text: seg.text || "",
                          start: Number.isFinite(startVal)
                            ? Math.round(startVal * 1000)
                            : 0,
                          duration: Number.isFinite(durVal)
                            ? Math.round(durVal * 1000)
                            : 0,
                        };
                      })
                      .filter(
                        (seg: TranscriptSegment) => seg.text.trim().length > 0
                      );

                    return {
                      videoId,
                      segments,
                      error: null,
                      trackInfo: {
                        languageCode: track.languageCode || "en",
                        isGenerated: track.kind === "asr",
                      },
                    };
                  }
                }

                return {
                  videoId,
                  segments: null,
                  error: "No transcript data available",
                };
              }
            );

            console.log(
              `[BATCH-TRANSCRIPT] API returned ${results.length} results`
            );
            resolve(results);
          } catch (error) {
            reject(new Error("Failed to parse API response"));
          }
        } else if (res.statusCode === 429) {
          reject(new Error("Rate limit exceeded - waiting for retry"));
        } else {
          reject(new Error(`API returned status ${res.statusCode}`));
        }
      });
    });

    req.on("error", (error) => reject(new Error(`API error: ${error.message}`)));
    req.write(data);
    req.end();
  });
}

function extractYouTubeVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }
  return null;
}

interface BatchProcessingStats {
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  apiCalls: number;
}

/**
 * Processes all pending youtube_transcript jobs in batches.
 * Uses batch API calls to dramatically reduce API usage.
 */
export async function processPendingTranscriptsBatch(): Promise<BatchProcessingStats> {
  const stats: BatchProcessingStats = {
    total: 0,
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    apiCalls: 0,
  };

  // Get all pending youtube_transcript jobs
  const pendingJobs = await db
    .select()
    .from(jobs)
    .where(
      and(eq(jobs.type, "youtube_transcript"), eq(jobs.status, "pending"))
    );

  stats.total = pendingJobs.length;
  console.log(`[BATCH-TRANSCRIPT] Found ${stats.total} pending jobs`);

  if (stats.total === 0) {
    return stats;
  }

  // Get episode sources for all jobs
  const sourceIds = pendingJobs
    .map((j) => j.episodeSourceId)
    .filter((id): id is string => id !== null);
  const sources = await db
    .select()
    .from(episodeSources)
    .where(inArray(episodeSources.id, sourceIds));

  const sourceMap = new Map(sources.map((s) => [s.id, s]));

  // Build job-to-videoId mapping
  const jobVideoMap: Array<{
    job: typeof pendingJobs[0];
    source: typeof sources[0];
    videoId: string;
  }> = [];

  for (const job of pendingJobs) {
    if (!job.episodeSourceId) {
      stats.skipped++;
      continue;
    }

    const source = sourceMap.get(job.episodeSourceId);
    if (!source?.sourceUrl) {
      stats.skipped++;
      await markJobFailed(job.id, "No source URL");
      continue;
    }

    const videoId = extractYouTubeVideoId(source.sourceUrl);
    if (!videoId) {
      stats.skipped++;
      await markJobFailed(job.id, "Invalid YouTube URL");
      continue;
    }

    jobVideoMap.push({ job, source, videoId });
  }

  console.log(
    `[BATCH-TRANSCRIPT] Processing ${jobVideoMap.length} valid jobs in batches of ${BATCH_SIZE}`
  );

  // Process in batches
  for (let i = 0; i < jobVideoMap.length; i += BATCH_SIZE) {
    const batch = jobVideoMap.slice(i, i + BATCH_SIZE);
    const videoIds = batch.map((b) => b.videoId);

    console.log(
      `[BATCH-TRANSCRIPT] Processing batch ${Math.floor(i / BATCH_SIZE) + 1} with ${batch.length} videos`
    );

    try {
      // Mark jobs as running
      for (const { job } of batch) {
        await db
          .update(jobs)
          .set({ status: "running", startedAt: new Date() })
          .where(eq(jobs.id, job.id));
      }

      // Fetch batch
      const results = await fetchBatchFromYouTubeTranscriptIO(videoIds);
      stats.apiCalls++;

      // Create a map of results by videoId
      const resultMap = new Map(results.map((r) => [r.videoId, r]));

      // Process each result
      for (const { job, source, videoId } of batch) {
        const result = resultMap.get(videoId);
        stats.processed++;

        if (!result || result.error) {
          stats.failed++;
          await markJobFailed(job.id, result?.error || "No result from API");
          continue;
        }

        if (!result.segments || result.segments.length === 0) {
          stats.failed++;
          await markJobFailed(job.id, "No transcript segments");
          continue;
        }

        try {
          // Save transcript data
          await saveTranscriptData(source, result.segments, result.trackInfo);
          stats.succeeded++;

          // Mark job completed
          await db
            .update(jobs)
            .set({
              status: "done",
              result: { segmentCount: result.segments.length },
              updatedAt: new Date(),
            })
            .where(eq(jobs.id, job.id));

          console.log(
            `[BATCH-TRANSCRIPT] Saved ${result.segments.length} segments for ${videoId}`
          );
        } catch (err) {
          stats.failed++;
          await markJobFailed(
            job.id,
            err instanceof Error ? err.message : "Save failed"
          );
        }
      }
    } catch (err) {
      // Batch API call failed - mark all jobs in batch as failed
      console.error(`[BATCH-TRANSCRIPT] Batch failed:`, err);
      for (const { job } of batch) {
        stats.failed++;
        await markJobFailed(
          job.id,
          err instanceof Error ? err.message : "Batch failed"
        );
      }
    }

    // Rate limit delay between batches (except for last batch)
    if (i + BATCH_SIZE < jobVideoMap.length) {
      console.log(
        `[BATCH-TRANSCRIPT] Waiting ${RATE_LIMIT_DELAY_MS}ms before next batch...`
      );
      await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_DELAY_MS));
    }
  }

  console.log(
    `[BATCH-TRANSCRIPT] Complete: ${stats.succeeded} succeeded, ${stats.failed} failed, ${stats.apiCalls} API calls`
  );
  return stats;
}

async function markJobFailed(jobId: string, error: string): Promise<void> {
  await db
    .update(jobs)
    .set({
      status: "failed",
      lastError: error,
      updatedAt: new Date(),
    })
    .where(eq(jobs.id, jobId));
}

async function saveTranscriptData(
  source: EpisodeSource,
  segments: TranscriptSegment[],
  trackInfo?: { languageCode: string; isGenerated: boolean }
): Promise<void> {
  // Create source transcript record
  const [transcript] = await db
    .insert(sourceTranscripts)
    .values({
      episodeSourceId: source.id,
      provider: "youtube",
      language: trackInfo?.languageCode || "en",
    })
    .returning();

  // Insert source-level segments
  const segmentInserts = segments.map((seg) => ({
    sourceTranscriptId: transcript.id,
    startTime: Math.round(seg.start),
    endTime: Math.round(seg.start + seg.duration),
    text: seg.text,
    speaker: null,
  }));

  await db.insert(sourceTranscriptSegments).values(segmentInserts);

  // Also populate canonical transcriptSegments if episode doesn't have any
  const existingCanonical = await db
    .select()
    .from(transcriptSegments)
    .where(eq(transcriptSegments.episodeId, source.episodeId))
    .limit(1);

  if (existingCanonical.length === 0) {
    // Convert milliseconds to seconds for canonical segments
    // Use deduplication to handle the unique constraint on (episodeId, startTime)
    const usedStartTimes = new Set<number>();
    const canonicalInserts = segments.map((seg) => {
      let startTimeSeconds = Math.floor(seg.start / 1000);
      while (usedStartTimes.has(startTimeSeconds)) {
        startTimeSeconds += 1;
      }
      usedStartTimes.add(startTimeSeconds);
      return {
        episodeId: source.episodeId,
        startTime: startTimeSeconds,
        endTime: Math.ceil((seg.start + seg.duration) / 1000),
        text: seg.text,
        type: "speech",
        speaker: null,
      };
    });

    await db.insert(transcriptSegments).values(canonicalInserts);
    console.log(
      `[BATCH-TRANSCRIPT] Also created ${canonicalInserts.length} canonical segments (converted to seconds)`
    );

    // Update episode status
    await db
      .update(episodes)
      .set({
        transcriptStatus: "ready",
        transcriptSource: "youtube",
        updatedAt: new Date(),
      })
      .where(eq(episodes.id, source.episodeId));
  }
}

/**
 * Gets count of pending youtube_transcript jobs for batch processing.
 */
export async function getPendingTranscriptJobCount(): Promise<number> {
  const result = await db
    .select()
    .from(jobs)
    .where(
      and(eq(jobs.type, "youtube_transcript"), eq(jobs.status, "pending"))
    );
  return result.length;
}
