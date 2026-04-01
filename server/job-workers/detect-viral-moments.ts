import { storage } from "../storage";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { GeminiError } from "../ai/geminiClient";
import { ClaudeError } from "../ai/claudeClient";
import { findViralMoments, convertToInsertViralMoment } from "../services/viral-moment-service";
import { findViralMomentsWithClaude, convertToInsertMoments } from "../services/claude-viral-service";
import { snapMomentTimestamps } from "../services/timestamp-snapper";
import type { Job, InsertViralMoment } from "@shared/schema";

const SHOW_PROFILE_MILESTONES = [5, 10, 25];

async function maybeQueueShowProfile(podcastId: string): Promise<void> {
  try {
    const countResult = await db.execute(sql`
      SELECT COUNT(DISTINCT vm.episode_id) as cnt
      FROM viral_moments vm
      JOIN episodes e ON e.id = vm.episode_id
      WHERE e.podcast_id = ${podcastId}
    `);
    const episodeCount = parseInt(countResult.rows[0]?.cnt as string) || 0;

    if (!SHOW_PROFILE_MILESTONES.includes(episodeCount)) return;

    const existing = await db.execute(sql`
      SELECT id FROM jobs
      WHERE type = 'compute_show_profile'
        AND status IN ('pending', 'running')
        AND result::text LIKE ${'%' + podcastId + '%'}
      LIMIT 1
    `);
    if (existing.rows.length > 0) return;

    await storage.createJob({
      type: "compute_show_profile",
      result: { podcastId },
      status: "pending",
    });
    console.log(`[DETECT-VIRAL] Queued compute_show_profile for podcast ${podcastId} at ${episodeCount} episodes`);
  } catch (err) {
    console.error(`[DETECT-VIRAL] Failed to queue show profile for podcast ${podcastId}:`, err);
  }
}

const USE_CLAUDE_FOR_VIRAL_DETECTION = true;

export interface ViralMomentDetectionResult {
  momentsDetected: number;
  episodeId: string;
}

export async function handleDetectViralMomentsJob(
  job: Job,
  onProgress?: (message: string, percentage: number) => void
): Promise<ViralMomentDetectionResult> {
  console.log(`[DETECT-VIRAL] Starting viral moment detection job ${job.id}`);

  if (!job.episodeSourceId) {
    throw new GeminiError(`Job ${job.id} has no episodeSourceId`, false, "INVALID_INPUT");
  }

  const source = await storage.getEpisodeSource(job.episodeSourceId);
  if (!source) {
    throw new GeminiError(`Episode source not found: ${job.episodeSourceId}`, false, "NOT_FOUND");
  }

  const episode = await storage.getEpisode(source.episodeId);
  if (!episode) {
    throw new GeminiError(`Episode not found for source: ${job.episodeSourceId}`, false, "NOT_FOUND");
  }

  const podcast = episode.podcastId ? await storage.getPodcast(episode.podcastId) : null;

  onProgress?.("Loading transcript segments...", 10);

  const segments = await storage.getSegmentsByEpisode(source.episodeId);
  if (segments.length === 0) {
    console.log(`[DETECT-VIRAL] No transcript segments found for episode ${source.episodeId}`);
    return { momentsDetected: 0, episodeId: source.episodeId };
  }

  const sortedSegments = segments.sort((a, b) => a.startTime - b.startTime);
  const totalDuration = Math.max(...segments.map(s => s.endTime));
  console.log(`[DETECT-VIRAL] Episode has ${segments.length} segments, ~${Math.round(totalDuration / 60)} minutes`);

  onProgress?.("Detecting viral moments with AI...", 30);

  let momentInserts: InsertViralMoment[];

  if (USE_CLAUDE_FOR_VIRAL_DETECTION) {
    console.log(`[DETECT-VIRAL] Using Claude (agentic 3-pass) for viral detection`);
    try {
      const claudeMoments = await findViralMomentsWithClaude(sortedSegments, {
        title: episode.title || undefined,
        podcastTitle: podcast?.title || undefined,
      });
      console.log(`[DETECT-VIRAL] Claude detected ${claudeMoments.length} viral moments`);
      momentInserts = convertToInsertMoments(source.episodeId, claudeMoments);
    } catch (error) {
      const isTransient = error instanceof ClaudeError && error.transient;
      if (isTransient) {
        console.error(`[DETECT-VIRAL] Claude transient error, falling back to Gemini:`, error);
        const geminiMoments = await findViralMoments(sortedSegments, {
          title: episode.title || undefined,
          podcastTitle: podcast?.title || undefined,
        });
        const geminiWithQuotes = geminiMoments.map(m => ({ ...m, pull_quote: (m as any).pull_quote || m.text.slice(0, 100) }));
        const { moments: snappedGemini, snapResults: geminiSnaps } = snapMomentTimestamps(geminiWithQuotes, sortedSegments);
        for (let i = 0; i < geminiSnaps.length; i++) {
          const sr = geminiSnaps[i];
          if (sr.snapped) {
            console.log(`[DETECT-VIRAL] Gemini moment snapped: drift=${sr.driftSeconds}s, confidence=${(sr.confidence * 100).toFixed(0)}%`);
          }
        }
        momentInserts = snappedGemini.map((m, idx) => convertToInsertViralMoment(source.episodeId, m, idx));
      } else {
        console.error(`[DETECT-VIRAL] Claude permanent error, not retrying:`, error);
        throw error;
      }
    }
  } else {
    const detectedMoments = await findViralMoments(sortedSegments, {
      title: episode.title || undefined,
      podcastTitle: podcast?.title || undefined,
    });
    console.log(`[DETECT-VIRAL] Gemini detected ${detectedMoments.length} potential viral moments`);
    const detectedWithQuotes = detectedMoments.map(m => ({ ...m, pull_quote: (m as any).pull_quote || m.text.slice(0, 100) }));
    const { moments: snappedDetected, snapResults: detectedSnaps } = snapMomentTimestamps(detectedWithQuotes, sortedSegments);
    for (let i = 0; i < detectedSnaps.length; i++) {
      const sr = detectedSnaps[i];
      if (sr.snapped) {
        console.log(`[DETECT-VIRAL] Gemini moment snapped: drift=${sr.driftSeconds}s, confidence=${(sr.confidence * 100).toFixed(0)}%`);
      }
    }
    momentInserts = snappedDetected.map((m, idx) => convertToInsertViralMoment(source.episodeId, m, idx));
  }

  onProgress?.("Processing and saving viral moments...", 70);

  await storage.deleteViralMomentsByEpisode(source.episodeId);

  if (momentInserts.length > 0) {
    await storage.createViralMoments(momentInserts);
  }

  onProgress?.("Complete!", 100);

  console.log(`[DETECT-VIRAL] Saved ${momentInserts.length} viral moments for episode ${source.episodeId}`);

  if (episode.podcastId) {
    await maybeQueueShowProfile(episode.podcastId);
  }

  return { momentsDetected: momentInserts.length, episodeId: source.episodeId };
}
