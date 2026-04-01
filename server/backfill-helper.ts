import { storage } from "./storage";
import type { Episode, EpisodeSource, Job } from "@shared/schema";

export interface BackfillResult {
  total: number;
  enqueued: number;
  skipped: number;
  details: Array<{ episodeId: string; title: string; result: string }>;
}

export interface BackfillSummary {
  annotations: { needed: number; enqueued: number };
  commentsFetch: { needed: number; enqueued: number };
  commentsMap: { needed: number; enqueued: number };
  sponsors: { needed: number; enqueued: number };
  claims: { needed: number; enqueued: number };
}

function isYouTubeUrl(url: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  return lower.includes("youtube.com") || lower.includes("youtu.be");
}

async function getCanonicalSourceForEpisode(episodeId: string): Promise<EpisodeSource | null> {
  const sources = await storage.getEpisodeSourcesByEpisode(episodeId);
  if (sources.length === 0) return null;
  return sources.find(s => s.isCanonical) || sources[0];
}

async function hasActiveOrCompletedJob(sourceId: string, jobType: string): Promise<{ active: boolean; completed: boolean }> {
  const jobs = await storage.getJobsByEpisodeSource(sourceId);
  const active = jobs.some(j => j.type === jobType && (j.status === "pending" || j.status === "running"));
  const completed = jobs.some(j => j.type === jobType && (j.status === "done" || j.status === "error"));
  return { active, completed };
}

export async function backfillAnnotations(): Promise<BackfillResult> {
  console.log("[BACKFILL-ANNOTATIONS] Starting annotation backfill...");
  
  const allEpisodes = await storage.getAllEpisodes();
  const details: BackfillResult["details"] = [];
  let enqueued = 0;
  let skipped = 0;

  for (const episode of allEpisodes) {
    if (episode.transcriptStatus !== "ready") {
      skipped++;
      details.push({
        episodeId: episode.id,
        title: episode.title,
        result: "Skipped: No ready transcript",
      });
      continue;
    }

    const annotations = await storage.getAnnotationsByEpisode(episode.id, { aiOnly: true });
    if (annotations.length > 0) {
      skipped++;
      details.push({
        episodeId: episode.id,
        title: episode.title,
        result: `Skipped: Already has ${annotations.length} AI annotations`,
      });
      continue;
    }

    const source = await getCanonicalSourceForEpisode(episode.id);
    if (!source) {
      skipped++;
      details.push({
        episodeId: episode.id,
        title: episode.title,
        result: "Skipped: No episode source found",
      });
      continue;
    }

    const { active, completed } = await hasActiveOrCompletedJob(source.id, "episode_annotate");
    if (active) {
      skipped++;
      details.push({
        episodeId: episode.id,
        title: episode.title,
        result: "Skipped: Annotation job already pending/running",
      });
      continue;
    }

    if (completed) {
      skipped++;
      details.push({
        episodeId: episode.id,
        title: episode.title,
        result: "Skipped: Annotation job already completed (may have 0 annotations)",
      });
      continue;
    }

    try {
      const job = await storage.createJob({
        episodeSourceId: source.id,
        type: "episode_annotate",
      });
      enqueued++;
      details.push({
        episodeId: episode.id,
        title: episode.title,
        result: `Created episode_annotate job: ${job.id}`,
      });
      console.log(`[BACKFILL-ANNOTATIONS] Created job ${job.id} for episode ${episode.title}`);
    } catch (err) {
      skipped++;
      details.push({
        episodeId: episode.id,
        title: episode.title,
        result: `Error: ${err instanceof Error ? err.message : "Unknown"}`,
      });
    }
  }

  console.log(`[BACKFILL-ANNOTATIONS] Complete: ${enqueued} jobs created, ${skipped} skipped`);
  return { total: allEpisodes.length, enqueued, skipped, details };
}

export async function backfillCommentsFetch(): Promise<BackfillResult> {
  console.log("[BACKFILL-COMMENTS-FETCH] Starting comments fetch backfill...");
  
  const allEpisodes = await storage.getAllEpisodes();
  const details: BackfillResult["details"] = [];
  let enqueued = 0;
  let skipped = 0;

  for (const episode of allEpisodes) {
    const sources = await storage.getEpisodeSourcesByEpisode(episode.id);
    const youtubeSources = sources.filter(s => 
      s.platform === "youtube" || isYouTubeUrl(s.sourceUrl || "")
    );

    if (youtubeSources.length === 0) {
      skipped++;
      details.push({
        episodeId: episode.id,
        title: episode.title,
        result: "Skipped: No YouTube sources",
      });
      continue;
    }

    const existingComments = await storage.getCommentsByEpisode(episode.id);
    if (existingComments.length > 0) {
      skipped++;
      details.push({
        episodeId: episode.id,
        title: episode.title,
        result: `Skipped: Already has ${existingComments.length} comments`,
      });
      continue;
    }

    const youtubeSource = youtubeSources[0];
    const { active, completed } = await hasActiveOrCompletedJob(youtubeSource.id, "episode_comments_fetch");
    
    if (active) {
      skipped++;
      details.push({
        episodeId: episode.id,
        title: episode.title,
        result: "Skipped: Comments fetch job already pending/running",
      });
      continue;
    }

    if (completed) {
      skipped++;
      details.push({
        episodeId: episode.id,
        title: episode.title,
        result: "Skipped: Comments fetch job already completed (may have 0 comments)",
      });
      continue;
    }

    try {
      const job = await storage.createJob({
        episodeSourceId: youtubeSource.id,
        type: "episode_comments_fetch",
      });
      enqueued++;
      details.push({
        episodeId: episode.id,
        title: episode.title,
        result: `Created episode_comments_fetch job: ${job.id}`,
      });
      console.log(`[BACKFILL-COMMENTS-FETCH] Created job ${job.id} for episode ${episode.title}`);
    } catch (err) {
      skipped++;
      details.push({
        episodeId: episode.id,
        title: episode.title,
        result: `Error: ${err instanceof Error ? err.message : "Unknown"}`,
      });
    }
  }

  console.log(`[BACKFILL-COMMENTS-FETCH] Complete: ${enqueued} jobs created, ${skipped} skipped`);
  return { total: allEpisodes.length, enqueued, skipped, details };
}

export async function backfillCommentsMap(): Promise<BackfillResult> {
  console.log("[BACKFILL-COMMENTS-MAP] Starting comments mapping backfill...");
  
  const allEpisodes = await storage.getAllEpisodes();
  const details: BackfillResult["details"] = [];
  let enqueued = 0;
  let skipped = 0;

  for (const episode of allEpisodes) {
    const comments = await storage.getCommentsByEpisode(episode.id);
    if (comments.length === 0) {
      skipped++;
      details.push({
        episodeId: episode.id,
        title: episode.title,
        result: "Skipped: No comments to map",
      });
      continue;
    }

    const episodeSegments = await storage.getEpisodeSegmentsByEpisode(episode.id);
    if (episodeSegments.length === 0) {
      skipped++;
      details.push({
        episodeId: episode.id,
        title: episode.title,
        result: "Skipped: No episode segments to map to",
      });
      continue;
    }

    const links = await storage.getCommentSegmentLinksByEpisode(episode.id);
    if (links.length > 0) {
      skipped++;
      details.push({
        episodeId: episode.id,
        title: episode.title,
        result: `Skipped: Already has ${links.length} comment-segment links`,
      });
      continue;
    }

    const source = await getCanonicalSourceForEpisode(episode.id);
    if (!source) {
      skipped++;
      details.push({
        episodeId: episode.id,
        title: episode.title,
        result: "Skipped: No episode source found",
      });
      continue;
    }

    const { active, completed } = await hasActiveOrCompletedJob(source.id, "episode_comments_map");
    
    if (active) {
      skipped++;
      details.push({
        episodeId: episode.id,
        title: episode.title,
        result: "Skipped: Comments map job already pending/running",
      });
      continue;
    }

    if (completed) {
      skipped++;
      details.push({
        episodeId: episode.id,
        title: episode.title,
        result: "Skipped: Comments map job already completed",
      });
      continue;
    }

    try {
      const job = await storage.createJob({
        episodeSourceId: source.id,
        type: "episode_comments_map",
      });
      enqueued++;
      details.push({
        episodeId: episode.id,
        title: episode.title,
        result: `Created episode_comments_map job: ${job.id}`,
      });
      console.log(`[BACKFILL-COMMENTS-MAP] Created job ${job.id} for episode ${episode.title}`);
    } catch (err) {
      skipped++;
      details.push({
        episodeId: episode.id,
        title: episode.title,
        result: `Error: ${err instanceof Error ? err.message : "Unknown"}`,
      });
    }
  }

  console.log(`[BACKFILL-COMMENTS-MAP] Complete: ${enqueued} jobs created, ${skipped} skipped`);
  return { total: allEpisodes.length, enqueued, skipped, details };
}

export async function backfillSponsors(): Promise<BackfillResult> {
  console.log("[BACKFILL-SPONSORS] Starting sponsor detection backfill...");
  
  const allEpisodes = await storage.getAllEpisodes();
  const details: BackfillResult["details"] = [];
  let enqueued = 0;
  let skipped = 0;

  for (const episode of allEpisodes) {
    if (episode.transcriptStatus !== "ready") {
      skipped++;
      details.push({
        episodeId: episode.id,
        title: episode.title,
        result: "Skipped: No ready transcript",
      });
      continue;
    }

    const sponsors = await storage.getSponsorSegmentsByEpisode(episode.id);
    if (sponsors.length > 0) {
      skipped++;
      details.push({
        episodeId: episode.id,
        title: episode.title,
        result: `Skipped: Already has ${sponsors.length} sponsor segments`,
      });
      continue;
    }

    const source = await getCanonicalSourceForEpisode(episode.id);
    if (!source) {
      skipped++;
      details.push({
        episodeId: episode.id,
        title: episode.title,
        result: "Skipped: No episode source found",
      });
      continue;
    }

    const { active, completed } = await hasActiveOrCompletedJob(source.id, "detect_sponsors");
    
    if (active) {
      skipped++;
      details.push({
        episodeId: episode.id,
        title: episode.title,
        result: "Skipped: Sponsor detection job already pending/running",
      });
      continue;
    }

    if (completed) {
      skipped++;
      details.push({
        episodeId: episode.id,
        title: episode.title,
        result: "Skipped: Sponsor detection job already completed (may have 0 sponsors)",
      });
      continue;
    }

    try {
      const job = await storage.createJob({
        episodeSourceId: source.id,
        type: "detect_sponsors",
      });
      enqueued++;
      details.push({
        episodeId: episode.id,
        title: episode.title,
        result: `Created detect_sponsors job: ${job.id}`,
      });
      console.log(`[BACKFILL-SPONSORS] Created job ${job.id} for episode ${episode.title}`);
    } catch (err) {
      skipped++;
      details.push({
        episodeId: episode.id,
        title: episode.title,
        result: `Error: ${err instanceof Error ? err.message : "Unknown"}`,
      });
    }
  }

  console.log(`[BACKFILL-SPONSORS] Complete: ${enqueued} jobs created, ${skipped} skipped`);
  return { total: allEpisodes.length, enqueued, skipped, details };
}

export async function backfillClaims(): Promise<BackfillResult> {
  console.log("[BACKFILL-CLAIMS] Starting claims detection backfill...");
  
  const allEpisodes = await storage.getAllEpisodes();
  const details: BackfillResult["details"] = [];
  let enqueued = 0;
  let skipped = 0;

  for (const episode of allEpisodes) {
    if (episode.transcriptStatus !== "ready") {
      skipped++;
      details.push({
        episodeId: episode.id,
        title: episode.title,
        result: "Skipped: No ready transcript",
      });
      continue;
    }

    const claims = await storage.getClaimsByEpisodeId(episode.id);
    if (claims.length > 0) {
      skipped++;
      details.push({
        episodeId: episode.id,
        title: episode.title,
        result: `Skipped: Already has ${claims.length} claims`,
      });
      continue;
    }

    const source = await getCanonicalSourceForEpisode(episode.id);
    if (!source) {
      skipped++;
      details.push({
        episodeId: episode.id,
        title: episode.title,
        result: "Skipped: No episode source found",
      });
      continue;
    }

    const { active, completed } = await hasActiveOrCompletedJob(source.id, "detect_claims");
    
    if (active) {
      skipped++;
      details.push({
        episodeId: episode.id,
        title: episode.title,
        result: "Skipped: Claims detection job already pending/running",
      });
      continue;
    }

    if (completed) {
      skipped++;
      details.push({
        episodeId: episode.id,
        title: episode.title,
        result: "Skipped: Claims detection job already completed (may have 0 claims)",
      });
      continue;
    }

    try {
      const job = await storage.createJob({
        episodeSourceId: source.id,
        type: "detect_claims",
      });
      enqueued++;
      details.push({
        episodeId: episode.id,
        title: episode.title,
        result: `Created detect_claims job: ${job.id}`,
      });
      console.log(`[BACKFILL-CLAIMS] Created job ${job.id} for episode ${episode.title}`);
    } catch (err) {
      skipped++;
      details.push({
        episodeId: episode.id,
        title: episode.title,
        result: `Error: ${err instanceof Error ? err.message : "Unknown"}`,
      });
    }
  }

  console.log(`[BACKFILL-CLAIMS] Complete: ${enqueued} jobs created, ${skipped} skipped`);
  return { total: allEpisodes.length, enqueued, skipped, details };
}

export async function runMaintenanceBackfill(): Promise<BackfillSummary> {
  console.log("[MAINTENANCE-BACKFILL] Starting maintenance backfill run...");
  
  const allEpisodes = await storage.getAllEpisodes();
  
  const summary: BackfillSummary = {
    annotations: { needed: 0, enqueued: 0 },
    commentsFetch: { needed: 0, enqueued: 0 },
    commentsMap: { needed: 0, enqueued: 0 },
    sponsors: { needed: 0, enqueued: 0 },
    claims: { needed: 0, enqueued: 0 },
  };

  for (const episode of allEpisodes) {
    const source = await getCanonicalSourceForEpisode(episode.id);
    if (!source) continue;

    const sources = await storage.getEpisodeSourcesByEpisode(episode.id);
    const youtubeSources = sources.filter(s => 
      s.platform === "youtube" || isYouTubeUrl(s.sourceUrl || "")
    );

    if (episode.transcriptStatus === "ready") {
      const annotations = await storage.getAnnotationsByEpisode(episode.id, { aiOnly: true });
      if (annotations.length === 0) {
        const { active, completed } = await hasActiveOrCompletedJob(source.id, "episode_annotate");
        if (!active && !completed) {
          summary.annotations.needed++;
          try {
            await storage.createJob({ episodeSourceId: source.id, type: "episode_annotate" });
            summary.annotations.enqueued++;
          } catch (err) {
            console.error(`[MAINTENANCE] Failed to queue annotation job for ${episode.id}:`, err);
          }
        }
      }

      const sponsors = await storage.getSponsorSegmentsByEpisode(episode.id);
      if (sponsors.length === 0) {
        const { active, completed } = await hasActiveOrCompletedJob(source.id, "detect_sponsors");
        if (!active && !completed) {
          summary.sponsors.needed++;
          try {
            await storage.createJob({ episodeSourceId: source.id, type: "detect_sponsors" });
            summary.sponsors.enqueued++;
          } catch (err) {
            console.error(`[MAINTENANCE] Failed to queue sponsors job for ${episode.id}:`, err);
          }
        }
      }

      const claims = await storage.getClaimsByEpisodeId(episode.id);
      if (claims.length === 0) {
        const { active, completed } = await hasActiveOrCompletedJob(source.id, "detect_claims");
        if (!active && !completed) {
          summary.claims.needed++;
          try {
            await storage.createJob({ episodeSourceId: source.id, type: "detect_claims" });
            summary.claims.enqueued++;
          } catch (err) {
            console.error(`[MAINTENANCE] Failed to queue claims job for ${episode.id}:`, err);
          }
        }
      }
    }

    if (youtubeSources.length > 0) {
      const youtubeSource = youtubeSources[0];
      const comments = await storage.getCommentsByEpisode(episode.id);
      
      if (comments.length === 0) {
        const { active, completed } = await hasActiveOrCompletedJob(youtubeSource.id, "episode_comments_fetch");
        if (!active && !completed) {
          summary.commentsFetch.needed++;
          try {
            await storage.createJob({ episodeSourceId: youtubeSource.id, type: "episode_comments_fetch" });
            summary.commentsFetch.enqueued++;
          } catch (err) {
            console.error(`[MAINTENANCE] Failed to queue comments fetch job for ${episode.id}:`, err);
          }
        }
      } else {
        const episodeSegments = await storage.getEpisodeSegmentsByEpisode(episode.id);
        const links = await storage.getCommentSegmentLinksByEpisode(episode.id);
        
        if (episodeSegments.length > 0 && links.length === 0) {
          const { active, completed } = await hasActiveOrCompletedJob(source.id, "episode_comments_map");
          if (!active && !completed) {
            summary.commentsMap.needed++;
            try {
              await storage.createJob({ episodeSourceId: source.id, type: "episode_comments_map" });
              summary.commentsMap.enqueued++;
            } catch (err) {
              console.error(`[MAINTENANCE] Failed to queue comments map job for ${episode.id}:`, err);
            }
          }
        }
      }
    }
  }

  console.log(`[MAINTENANCE-BACKFILL] Complete:`, JSON.stringify(summary, null, 2));
  return summary;
}

export async function backfillEpisodeSummaries(): Promise<BackfillResult> {
  console.log("[BACKFILL-EPISODE-SUMMARIES] Starting episode summary backfill...");
  
  const allEpisodes = await storage.getAllEpisodes();
  const details: BackfillResult["details"] = [];
  let enqueued = 0;
  let skipped = 0;

  // Target only episodes that would appear on Explore page (featured/analyzed episodes)
  // Same criteria as /api/explore/feed: ready transcript + sufficient analysis
  for (const episode of allEpisodes) {
    if (episode.transcriptStatus !== "ready") {
      skipped++;
      details.push({
        episodeId: episode.id,
        title: episode.title,
        result: "Skipped: No ready transcript",
      });
      continue;
    }

    // Skip if already has episodeSummary
    if (episode.episodeSummary) {
      skipped++;
      details.push({
        episodeId: episode.id,
        title: episode.title,
        result: "Skipped: Already has episode summary",
      });
      continue;
    }

    // Check if episode has sufficient analysis - matches job worker requirements:
    // Job worker requires: narrativeSegments.length > 0 || claims.length > 0
    // Explore page requires: claimsCount >= 10 || hasNarrative
    // Use Explore page criteria to only backfill episodes that will actually display
    const claims = await storage.getClaimsByEpisodeId(episode.id);
    const segments = await storage.getEpisodeSegmentsByEpisode(episode.id);
    const narrativeSegments = segments.filter((s: any) => s.segmentType === "narrative");
    const hasNarrative = narrativeSegments.length > 0;
    
    // Match Explore page display criteria: claimsCount >= 10 OR hasNarrative
    if (claims.length < 10 && !hasNarrative) {
      skipped++;
      details.push({
        episodeId: episode.id,
        title: episode.title,
        result: `Skipped: Would not appear on Explore page (${claims.length} claims, ${narrativeSegments.length} narrative segments)`,
      });
      continue;
    }

    const source = await getCanonicalSourceForEpisode(episode.id);
    if (!source) {
      skipped++;
      details.push({
        episodeId: episode.id,
        title: episode.title,
        result: "Skipped: No episode source found",
      });
      continue;
    }

    const { active, completed } = await hasActiveOrCompletedJob(source.id, "generate_episode_summary");
    if (active) {
      skipped++;
      details.push({
        episodeId: episode.id,
        title: episode.title,
        result: "Skipped: Job already active",
      });
      continue;
    }

    if (completed) {
      skipped++;
      details.push({
        episodeId: episode.id,
        title: episode.title,
        result: "Skipped: Job already completed",
      });
      continue;
    }

    // Enqueue the summary generation job
    await storage.createJob({
      type: "generate_episode_summary",
      episodeSourceId: source.id,
      status: "pending",
    });

    enqueued++;
    details.push({
      episodeId: episode.id,
      title: episode.title,
      result: "Enqueued generate_episode_summary job",
    });
  }

  console.log(`[BACKFILL-EPISODE-SUMMARIES] Complete: ${enqueued} enqueued, ${skipped} skipped`);
  return { total: allEpisodes.length, enqueued, skipped, details };
}
