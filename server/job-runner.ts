import { storage } from "./storage";
import { handleTranscribeJob } from "./job-workers/transcribe";
import { handleVideoAnalysisJob } from "./job-workers/video-analysis";
import { runYouTubeTranscriptJob } from "./job-workers/youtube-transcript";
import { handleYouTubeVideoAnalysisJob } from "./job-workers/youtube-video-analysis";
import { handleAnnotateJob } from "./job-workers/annotate";
import { handleDetectMusicJob } from "./job-workers/detect-music";
import { handleDetectSponsorsJob } from "./job-workers/detect-sponsors";
import { handleDetectClaimsJob } from "./job-workers/detect-claims";
import { handleEpisodeImportJob } from "./job-workers/episode-import";
import { handleEpisodeTranscriptJob } from "./job-workers/episode-transcript";
import { handleEpisodeAnnotateJob } from "./job-workers/episode-annotate";
import { handleEpisodeCommentsFetchJob } from "./job-workers/episode-comments-fetch";
import { handleEpisodeCommentsMapJob } from "./job-workers/episode-comments-map";
import { handleEpisodeVisionEnrichJob } from "./job-workers/episode-vision-enrich";
import { handleExtractStatementsJob } from "./job-workers/extract-statements";
import { handleClassifyClaimsJob } from "./job-workers/classify-claims";
import { handleLinkEntitiesJob } from "./job-workers/link-entities";
import { handleIntegrityEngineJob } from "./job-workers/integrity-engine";
import { handleTopicDiscoveryJob } from "./job-workers/topic-discovery";
import { handleTopicAssignmentJob } from "./job-workers/topic-assignment";
import { handleDiscoverRelationsEpisodeJob } from "./job-workers/discover-relations-episode";
import { handleEmbedStatementsJob } from "./job-workers/embed-statements";
import { handleGenerateChaptersJob } from "./job-workers/generate-chapters";
import { handleGenerateNarrativeSegmentsJob } from "./job-workers/generate-narrative-segments";
import { handleExtractHighlightsJob } from "./job-workers/extract-highlights";
import { handleDetectViralMomentsJob } from "./job-workers/detect-viral-moments";
import { handleGenerateKeyMomentsJob } from "./job-workers/generate-key-moments";
import { handleExtractClipJob } from "./job-workers/extract-clip";
import { handleBurnCaptionsJob } from "./job-workers/burn-captions";
import { handleOptimizeClipJob } from "./job-workers/optimize-clip";
import { handleClipPipelineJob } from "./job-workers/clip-pipeline";
import { handleExtractAffiliateEntitiesJob } from "./job-workers/extract-affiliate-entities";
import { runUserClipRequestProcessor } from "./job-workers/user-clip-request";
import { handleAnalyzeZoomCallJob } from "./job-workers/analyze-zoom-call";
import { handleGenerateEpisodeSummaryJob } from "./job-workers/generate-episode-summary";
import { handleDiscoverRelationsCrossEpisodeJob } from "./job-workers/discover-relations-cross-episode";
import { handleResolveSpeakersJob } from "./job-workers/resolve-speakers";
import { handleDetectContradictionsJob } from "./job-workers/detect-contradictions";
import { handleComputeShowProfileJob } from "./job-workers/compute-show-profile";
import { handleBuildSelmanPackJob } from "./job-workers/build-selman-pack";
import { handleEnrichFinancialClaimsJob } from "./job-workers/enrich-financial-claims";
import { handleResolveClaimPricesJob } from "./job-workers/resolve-claim-prices";
import { handleScoreClaimOutcomesJob } from "./job-workers/score-claim-outcomes";
import { handleComputeSourceCredibilityJob } from "./job-workers/compute-source-credibility";
import { GeminiError, classifyGenericError } from "./ai/geminiClient";
import { fireWebhookEvent } from "./webhook-dispatcher";
import { runMaintenanceBackfill } from "./backfill-helper";
import type { Job, EpisodeSource } from "@shared/schema";

const MAX_ATTEMPTS = 3;

// Generate a unique worker ID for this process (helps identify stuck jobs)
const WORKER_ID = `worker-${process.pid}-${Date.now()}`;

// Concurrency caps per job type to prevent overwhelming external APIs
const JOB_CONCURRENCY_CAPS: Record<string, number> = {
  youtube_transcript: 2,     // Limit concurrent YouTube API calls
  transcribe: 3,             // Limit concurrent AssemblyAI jobs
  detect_music: 2,           // Limit concurrent AudD API calls
  detect_sponsors: 2,        // Limit concurrent sponsor detection (CPU-bound)
  detect_claims: 3,          // Gemini claim extraction (increased for throughput)
  detect_integrity: 2,       // Gemini integrity assessment
  episode_import: 5,         // Episode metadata normalization
  episode_transcript: 3,     // Uses YouTube/AssemblyAI
  episode_annotate: 3,       // Uses Gemini AI (increased)
  episode_comments_fetch: 2, // YouTube API
  episode_comments_map: 2,   // Gemini AI
  episode_vision_enrich: 1,  // Heavy Gemini video processing
  extract_statements: 3,     // Gemini AI statement extraction (increased)
  classify_statements: 1,    // Gemini AI statement classification (sequential to avoid rate limits)
  extract_chapters: 3,       // Gemini AI chapter extraction
  analyze_zoom_call: 2,      // Gemini AI Zoom call analysis
  extract_key_ideas: 3,      // Gemini AI key ideas extraction
  extract_highlights: 3,     // Gemini AI highlights extraction
  detect_viral_moments: 2,   // Gemini AI viral moment detection
  generate_key_moments: 3,   // Gemini AI key moments generation
  extract_clip: 2,           // Video clip extraction (yt-dlp)
  burn_captions: 2,          // FFmpeg caption burning
  optimize_clip: 2,          // FFmpeg platform optimization
  run_clip_pipeline: 3,      // Pipeline orchestration (lightweight)
  link_entities: 2,          // Gemini AI entity canonicalization
  integrity_score: 5,        // Local computation, no external APIs
  extract_affiliate_entities: 3, // Gemini AI affiliate entity extraction
  topic_discovery: 1,        // Heavy Gemini AI clustering (one at a time)
  assign_topics: 3,          // Embedding similarity (CPU-bound, minimal API)
  discover_relations_episode: 2, // Gemini AI relation classification
  embed_statements: 5,       // Vector embeddings (increased for throughput)
  discover_relations_cross_episode: 2, // Cross-episode recurrence detection (Gemini + pgvector)
  generate_narrative_segments: 2, // Gemini AI narrative generation
  generate_episode_summary: 3, // Claude AI episode summary generation
  resolve_speakers: 2,       // Gemini AI speaker identity resolution
  detect_contradictions: 2,  // Claude AI contradiction detection
  compute_show_profile: 1,   // Show Intelligence aggregation (one at a time)
  build_selman_pack: 2,      // Claude deal intelligence reasoning
  enrich_financial_claims: 1, // Claude enrichment — sequential to control cost
  resolve_claim_prices: 1,    // Polygon.io — sequential to avoid rate limits
  score_claim_outcomes: 5,    // Local computation, no external APIs
  compute_source_credibility: 5, // Local computation, no external APIs
};

// In-memory tracking of recently failed jobs for admin visibility
interface FailedJobEntry {
  jobId: string;
  jobType: string;
  episodeSourceId: string | null;
  failedAt: Date;
  attempts: number;
  lastError: string;
  isPermanent: boolean;
}

// Track last N failed jobs in memory for quick admin access
const MAX_FAILED_JOB_ENTRIES = 50;
const recentFailedJobs: FailedJobEntry[] = [];

async function trackFailedJob(job: Job, error: string, errorStack: string | null, isPermanent: boolean, isTransient: boolean, attemptNumber: number): Promise<void> {
  const entry: FailedJobEntry = {
    jobId: job.id,
    jobType: job.type,
    episodeSourceId: job.episodeSourceId,
    failedAt: new Date(),
    attempts: attemptNumber,
    lastError: error.slice(0, 500), // Truncate long errors
    isPermanent,
  };
  
  recentFailedJobs.unshift(entry);
  
  // Keep only the most recent entries
  if (recentFailedJobs.length > MAX_FAILED_JOB_ENTRIES) {
    recentFailedJobs.pop();
  }
  
  // Log structured failure for monitoring
  console.error(`[JOB-FAILURE] ${JSON.stringify({
    timestamp: entry.failedAt.toISOString(),
    jobId: entry.jobId,
    type: entry.jobType,
    attempt: entry.attempts,
    maxAttempts: MAX_ATTEMPTS,
    isPermanent: entry.isPermanent,
    error: entry.lastError,
  })}`);

  // Persist permanent failures to database for admin visibility
  if (isPermanent) {
    try {
      await storage.insertJobFailure({
        jobId: job.id,
        jobType: job.type,
        errorMessage: error,
        errorStack: errorStack,
        isTransient: isTransient,
      });
      console.log(`[JOB-RUNNER] Persisted failure for job ${job.id} to database`);
    } catch (persistErr) {
      console.error(`[JOB-RUNNER] Failed to persist job failure to database:`, persistErr);
    }

    // Create admin notification for permanent job failures
    try {
      // Look up the episode source to get the episodeId for click-through
      let episodeId: string | null = null;
      try {
        if (job.episodeSourceId) {
          const source = await storage.getEpisodeSource(job.episodeSourceId);
          if (source) {
            episodeId = source.episodeId;
          }
        }
      } catch (lookupErr) {
        console.warn(`[JOB-RUNNER] Could not look up episode source for notification:`, lookupErr);
      }

      await storage.createAdminNotification({
        type: 'job_failure',
        severity: 'error',
        title: `${job.type} job failed`,
        message: error.slice(0, 200),
        episodeId: episodeId,
        jobType: job.type,
        payload: { 
          jobId: job.id, 
          episodeSourceId: job.episodeSourceId,
          attempts: attemptNumber, 
          lastError: error.slice(0, 500),
          isTransient: isTransient
        },
      });
      console.log(`[JOB-RUNNER] Created admin notification for failed job ${job.id}`);
    } catch (notifyErr) {
      console.error(`[JOB-RUNNER] Failed to create admin notification:`, notifyErr);
    }
  }
}

// Expose recent failed jobs for API/admin access
function getRecentFailedJobs(): FailedJobEntry[] {
  return [...recentFailedJobs];
}

function getFailedJobStats(): { total: number; permanent: number; retrying: number } {
  const permanent = recentFailedJobs.filter(j => j.isPermanent).length;
  return {
    total: recentFailedJobs.length,
    permanent,
    retrying: recentFailedJobs.length - permanent,
  };
}

// Exponential backoff delays in milliseconds
// Attempt 1 failed -> wait 30 seconds
// Attempt 2 failed -> wait 2 minutes  
// Attempt 3 failed -> permanent error (no delay, job marked failed)
const RETRY_DELAYS_MS = [
  30 * 1000,      // After attempt 1 failure: wait 30 seconds
  2 * 60 * 1000,  // After attempt 2 failure: wait 2 minutes
];

function getNextRetryTime(attempts: number): Date | null {
  if (attempts >= MAX_ATTEMPTS) {
    return null; // No more retries
  }
  const delayMs = RETRY_DELAYS_MS[attempts - 1] || RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
  return new Date(Date.now() + delayMs);
}

function formatRetryDelay(attempts: number): string {
  if (attempts >= MAX_ATTEMPTS) return "no more retries";
  const delayMs = RETRY_DELAYS_MS[attempts - 1] || RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
  if (delayMs >= 60000) {
    return `${Math.round(delayMs / 60000)} minute(s)`;
  }
  return `${Math.round(delayMs / 1000)} second(s)`;
}

// Stuck job detection threshold in minutes
// Configured per job type to account for different processing durations
const STUCK_JOB_THRESHOLD_MINUTES_BY_TYPE: Record<string, number> = {
  // Long-running AI analysis jobs (Claude's 3-pass viral moment detection)
  detect_viral_moments: 15,
  generate_key_moments: 15,
  
  // Medium-length transcription/processing jobs
  youtube_transcript: 30,
  episode_transcript: 5,
  transcribe: 5,
  episode_import: 5,
  episode_annotate: 5,

  // Clip pipeline — proxy downloads can take 5+ minutes
  extract_clip: 10,
  burn_captions: 10,

  // Gemini analysis jobs — large episodes (6000+ segments / 73 chunks) need 30+ min
  detect_claims: 10,
  extract_highlights: 10,
  extract_statements: 45,
  embed_statements: 30,
  discover_relations_cross_episode: 20,
  detect_contradictions: 180,

  // Classification with exponential backoff — 2263 statements @ 90 batches with rate-limit retries
  // can take up to 90 minutes in worst case; 60 min is a safe practical threshold
  classify_statements: 90,

  // Financial credibility engine — 810 claims @ ~2s each = ~27 min for enrichment
  // resolve_claim_prices is slower due to Polygon rate limits
  enrich_financial_claims: 60,
  resolve_claim_prices: 60,
  score_claim_outcomes: 10,
  compute_source_credibility: 10,

  // Default threshold for all other job types
  // (will be used as fallback)
};

// Default threshold for job types not explicitly configured (in minutes)
const DEFAULT_STUCK_JOB_THRESHOLD_MINUTES = 3;

// Helper function to get the timeout threshold for a job type
function getStuckJobThreshold(jobType: string): number {
  return STUCK_JOB_THRESHOLD_MINUTES_BY_TYPE[jobType] ?? DEFAULT_STUCK_JOB_THRESHOLD_MINUTES;
}

// Maintenance backfill interval (1 hour)
const MAINTENANCE_BACKFILL_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
// Initialize to current time so maintenance doesn't run immediately on boot
let lastMaintenanceRunTime: number = Date.now();

/**
 * Self-healing mechanism for stuck jobs.
 * 
 * Jobs can get stuck in "running" status when:
 * - Server restarts mid-job (Replit workflow restart, deployment)
 * - Job handler crashes without proper cleanup
 * - External API timeout causes worker to hang indefinitely
 * 
 * This function finds jobs running longer than their job-type-specific threshold and either:
 * - Schedules a retry with exponential backoff (if attempts < MAX_ATTEMPTS)
 * - Marks as permanently failed (if max attempts reached)
 */
async function reclaimStuckJobs(): Promise<number> {
  // We need to check all potentially stuck jobs, so we query with the minimum threshold
  const minThreshold = Math.min(
    DEFAULT_STUCK_JOB_THRESHOLD_MINUTES,
    ...Object.values(STUCK_JOB_THRESHOLD_MINUTES_BY_TYPE)
  );
  
  const potentiallyStuckJobs = await storage.getStuckJobs(minThreshold);
  
  if (potentiallyStuckJobs.length === 0) {
    return 0;
  }
  
  // Filter jobs that are actually stuck based on their specific threshold
  const stuckJobs = potentiallyStuckJobs.filter(job => {
    const threshold = getStuckJobThreshold(job.type);
    const stuckDuration = job.startedAt
      ? Math.round((Date.now() - new Date(job.startedAt).getTime()) / 60000)
      : threshold;
    return stuckDuration > threshold;
  });
  
  if (stuckJobs.length === 0) {
    return 0;
  }
  
  console.log(`[JOB-RUNNER] Found ${stuckJobs.length} stuck job(s) (exceeding per-type thresholds)`);
  
  let reclaimedCount = 0;
  
  for (const job of stuckJobs) {
    const isPermanent = job.attempts >= MAX_ATTEMPTS;
    const threshold = getStuckJobThreshold(job.type);
    const stuckDuration = job.startedAt 
      ? Math.round((Date.now() - new Date(job.startedAt).getTime()) / 60000)
      : threshold;
    
    // Track as failure for admin visibility (stuck jobs are considered transient infrastructure issues)
    // Note: job.attempts is already the current attempt number since job was claimed as "running"
    await trackFailedJob(job, `Job stuck running for ${stuckDuration} minutes (timeout recovery)`, null, isPermanent, true, job.attempts);
    
    if (!isPermanent) {
      // Schedule retry with exponential backoff
      const nextRetryAt = getNextRetryTime(job.attempts);
      const retryDelay = formatRetryDelay(job.attempts);
      
      console.log(`[JOB-RUNNER] Reclaiming stuck job ${job.id} (type: ${job.type}, running for ${stuckDuration}/${threshold} min) - will retry in ${retryDelay} (attempt ${job.attempts + 1}/${MAX_ATTEMPTS})`);
      
      const updated = await storage.updateJobWhereStatus(job.id, "running", {
        status: "pending",
        lastError: `stuck_running_timeout (${stuckDuration} min) - attempt ${job.attempts} will retry`,
        nextRetryAt: nextRetryAt,
        startedAt: null,
        lockedBy: null,
      });
      
      if (updated) reclaimedCount++;
    } else {
      // Max attempts reached - permanent failure
      console.error(`[JOB-RUNNER] Stuck job ${job.id} (type: ${job.type}, running for ${stuckDuration}/${threshold} min) permanently failed after ${MAX_ATTEMPTS} attempts`);
      
      const updated = await storage.updateJobWhereStatus(job.id, "running", {
        status: "error",
        lastError: `stuck_running_timeout after ${MAX_ATTEMPTS} attempts. Last known state: running for ${stuckDuration} minutes`,
        nextRetryAt: null,
        startedAt: null,
        lockedBy: null,
      });
      
      if (updated) reclaimedCount++;
    }
  }
  
  console.log(`[JOB-RUNNER] Reclaimed ${reclaimedCount}/${stuckJobs.length} stuck job(s)`);
  return reclaimedCount;
}

/**
 * Execute a single job asynchronously (fire-and-forget pattern).
 * This function handles the entire job lifecycle including error handling and status updates.
 * It runs independently and doesn't block other jobs from starting.
 */
async function executeJobAsync(job: Job, attemptNumber: number): Promise<void> {
  try {
    let result: any = null;

    console.log(`[JOB-RUNNER] executeJobAsync: type="${job.type}" id=${job.id} attempt=${attemptNumber}`);

    if (job.type === "transcribe") {
      result = await handleTranscribeJob(job, (message, percentage) => {
        console.log(`[JOB-RUNNER] Job ${job.id}: ${percentage}% - ${message}`);
      });
    } else if (job.type === "video_analysis") {
      result = await handleVideoAnalysisJob(job, (message, percentage) => {
        console.log(`[JOB-RUNNER] Job ${job.id}: ${percentage}% - ${message}`);
      });
    } else if (job.type === "youtube_transcript") {
      if (!job.episodeSourceId) {
        throw new Error(`Job ${job.id} has no episodeSourceId`);
      }
      const source = await storage.getEpisodeSource(job.episodeSourceId);
      if (!source) {
        throw new Error(`Episode source not found: ${job.episodeSourceId}`);
      }
      await runYouTubeTranscriptJob(job, source);
      result = { type: "youtube_transcript", completed: true };
    } else if (job.type === "youtube_video_analysis") {
      result = await handleYouTubeVideoAnalysisJob(job, (message, percentage) => {
        console.log(`[JOB-RUNNER] Job ${job.id}: ${percentage}% - ${message}`);
      });
    } else if (job.type === "annotate") {
      result = await handleAnnotateJob(job, (message, percentage) => {
        console.log(`[JOB-RUNNER] Job ${job.id}: ${percentage}% - ${message}`);
      });
    } else if (job.type === "detect_music") {
      result = await handleDetectMusicJob(job, (message, percentage) => {
        console.log(`[JOB-RUNNER] Job ${job.id}: ${percentage}% - ${message}`);
      });
    } else if (job.type === "detect_sponsors") {
      result = await handleDetectSponsorsJob(job, (message, percentage) => {
        console.log(`[JOB-RUNNER] Job ${job.id}: ${percentage}% - ${message}`);
      });
    } else if (job.type === "detect_claims") {
      result = await handleDetectClaimsJob(job, (message, percentage) => {
        console.log(`[JOB-RUNNER] Job ${job.id}: ${percentage}% - ${message}`);
      });
    } else if (job.type === "episode_import") {
      result = await handleEpisodeImportJob(job, (message, percentage) => {
        console.log(`[JOB-RUNNER] Job ${job.id}: ${percentage}% - ${message}`);
      });
    } else if (job.type === "episode_transcript") {
      result = await handleEpisodeTranscriptJob(job, (message, percentage) => {
        console.log(`[JOB-RUNNER] Job ${job.id}: ${percentage}% - ${message}`);
      });
    } else if (job.type === "episode_annotate") {
      result = await handleEpisodeAnnotateJob(job, (message, percentage) => {
        console.log(`[JOB-RUNNER] Job ${job.id}: ${percentage}% - ${message}`);
      });
    } else if (job.type === "episode_comments_fetch") {
      result = await handleEpisodeCommentsFetchJob(job, (message, percentage) => {
        console.log(`[JOB-RUNNER] Job ${job.id}: ${percentage}% - ${message}`);
      });
    } else if (job.type === "episode_comments_map") {
      result = await handleEpisodeCommentsMapJob(job, (message, percentage) => {
        console.log(`[JOB-RUNNER] Job ${job.id}: ${percentage}% - ${message}`);
      });
    } else if (job.type === "episode_vision_enrich") {
      result = await handleEpisodeVisionEnrichJob(job, (message, percentage) => {
        console.log(`[JOB-RUNNER] Job ${job.id}: ${percentage}% - ${message}`);
      });
    } else if (job.type === "extract_statements") {
      result = await handleExtractStatementsJob(job, (message, percentage) => {
        console.log(`[JOB-RUNNER] Job ${job.id}: ${percentage}% - ${message}`);
      });
      // Auto-chain: embed statements after extraction (which then auto-queues cross-episode discovery)
      if (job.episodeSourceId) {
        try {
          const extractResult = result as { totalExtracted?: number } | null;
          if (extractResult && (extractResult.totalExtracted ?? 0) > 0) {
            const epSource = await storage.getEpisodeSource(job.episodeSourceId);
            if (epSource?.episodeId) {
              const embedJob = await storage.createJob({
                type: "embed_statements",
                episodeSourceId: job.episodeSourceId,
                result: { episodeId: epSource.episodeId },
              });
              console.log(`[JOB-RUNNER] Auto-queued embed_statements job ${embedJob.id} after extract_statements for episode ${epSource.episodeId}`);
            }
          }
        } catch (chainErr: any) {
          console.error(`[JOB-RUNNER] Failed to auto-queue embed job:`, chainErr.message);
        }
      }
    } else if (job.type === "classify_statements") {
      result = await handleClassifyClaimsJob(job, (message, percentage) => {
        console.log(`[JOB-RUNNER] Job ${job.id}: ${percentage}% - ${message}`);
      });
    } else if (job.type === "link_entities") {
      result = await handleLinkEntitiesJob(job, (message, percentage) => {
        console.log(`[JOB-RUNNER] Job ${job.id}: ${percentage}% - ${message}`);
      });
    } else if (job.type === "integrity_score") {
      result = await handleIntegrityEngineJob(job, (message, percentage) => {
        console.log(`[JOB-RUNNER] Job ${job.id}: ${percentage}% - ${message}`);
      });
    } else if (job.type === "extract_affiliate_entities") {
      console.log(`[JOB-RUNNER] Dispatching extract_affiliate_entities job ${job.id}`);
      result = await handleExtractAffiliateEntitiesJob(job, (message, percentage) => {
        console.log(`[JOB-RUNNER] Job ${job.id}: ${percentage}% - ${message}`);
      });
    } else if (job.type === "analyze_zoom_call") {
      console.log(`[JOB-RUNNER] Dispatching analyze_zoom_call job ${job.id}`);
      result = await handleAnalyzeZoomCallJob(job, (message, percentage) => {
        console.log(`[JOB-RUNNER] Job ${job.id}: ${percentage}% - ${message}`);
      });
    } else if (job.type === "topic_discovery") {
      result = await handleTopicDiscoveryJob(job, (message, percentage) => {
        console.log(`[JOB-RUNNER] Job ${job.id}: ${percentage}% - ${message}`);
      });
    } else if (job.type === "assign_topics") {
      result = await handleTopicAssignmentJob(job, (message, percentage) => {
        console.log(`[JOB-RUNNER] Job ${job.id}: ${percentage}% - ${message}`);
      });
    } else if (job.type === "discover_relations_episode") {
      result = await handleDiscoverRelationsEpisodeJob(job, (message, percentage) => {
        console.log(`[JOB-RUNNER] Job ${job.id}: ${percentage}% - ${message}`);
      });
    } else if (job.type === "embed_statements") {
      result = await handleEmbedStatementsJob(job, (message, percentage) => {
        console.log(`[JOB-RUNNER] Job ${job.id}: ${percentage}% - ${message}`);
      });
      const embedPayload = (job.result as { episodeId?: string }) ?? {};
      if (embedPayload.episodeId) {
        try {
          const crossEpJob = await storage.createJob({
            type: "discover_relations_cross_episode",
            episodeSourceId: job.episodeSourceId,
            result: { episodeId: embedPayload.episodeId },
          });
          console.log(`[JOB-RUNNER] Auto-queued cross-episode recurrence job ${crossEpJob.id} after embed_statements for episode ${embedPayload.episodeId}`);
        } catch (chainErr: any) {
          console.error(`[JOB-RUNNER] Failed to auto-queue cross-episode job:`, chainErr.message);
        }
      }
    } else if (job.type === "discover_relations_cross_episode") {
      console.log(`[JOB-RUNNER] Dispatching discover_relations_cross_episode job ${job.id}`);
      result = await handleDiscoverRelationsCrossEpisodeJob(job, (message, percentage) => {
        console.log(`[JOB-RUNNER] Job ${job.id}: ${percentage}% - ${message}`);
      });
      // Auto-chain: run contradiction detection after cross-episode relations are discovered
      const rawCrossEp = job.result;
      const crossEpPayload: { episodeId?: string } = typeof rawCrossEp === "string"
        ? ((() => { try { return JSON.parse(rawCrossEp); } catch { return {}; } })())
        : ((rawCrossEp as { episodeId?: string }) ?? {});
      const crossEpEpisodeId = crossEpPayload.episodeId;
      if (job.episodeSourceId && crossEpEpisodeId) {
        try {
          const contradictJob = await storage.createJob({
            type: "detect_contradictions",
            episodeSourceId: job.episodeSourceId,
            result: { episodeId: crossEpEpisodeId },
          });
          console.log(`[JOB-RUNNER] Auto-queued detect_contradictions job ${contradictJob.id} after discover_relations_cross_episode`);
        } catch (chainErr: any) {
          console.error(`[JOB-RUNNER] Failed to auto-queue detect_contradictions job:`, chainErr.message);
        }
      }
    } else if (job.type === "generate_chapters" || job.type === "extract_chapters") {
      // Note: extract_chapters is an alias for generate_chapters (legacy/admin UI compatibility)
      result = await handleGenerateChaptersJob(job, (message, percentage) => {
        console.log(`[JOB-RUNNER] Job ${job.id}: ${percentage}% - ${message}`);
      });
    } else if (job.type === "extract_highlights") {
      console.log(`[JOB-RUNNER] Dispatching extract_highlights job ${job.id}`);
      result = await handleExtractHighlightsJob(job, (message, percentage) => {
        console.log(`[JOB-RUNNER] Job ${job.id}: ${percentage}% - ${message}`);
      });
    } else if (job.type === "semantic_analyze") {
      // semantic_analyze is an alias for embed_statements (runs the semantic search embedding pipeline)
      result = await handleEmbedStatementsJob(job, (message, percentage) => {
        console.log(`[JOB-RUNNER] Job ${job.id}: ${percentage}% - ${message}`);
      });
    } else if (job.type === "detect_viral_moments") {
      console.log(`[JOB-RUNNER] Dispatching detect_viral_moments job ${job.id}`);
      result = await handleDetectViralMomentsJob(job, (message, percentage) => {
        console.log(`[JOB-RUNNER] Job ${job.id}: ${percentage}% - ${message}`);
      });
    } else if (job.type === "generate_key_moments") {
      console.log(`[JOB-RUNNER] Dispatching generate_key_moments job ${job.id}`);
      result = await handleGenerateKeyMomentsJob(job, (message, percentage) => {
        console.log(`[JOB-RUNNER] Job ${job.id}: ${percentage}% - ${message}`);
      });
    } else if (job.type === "extract_clip") {
      console.log(`[JOB-RUNNER] Dispatching extract_clip job ${job.id}`);
      result = await handleExtractClipJob(job, (message, percentage) => {
        console.log(`[JOB-RUNNER] Job ${job.id}: ${percentage}% - ${message}`);
      });
    } else if (job.type === "burn_captions") {
      console.log(`[JOB-RUNNER] Dispatching burn_captions job ${job.id}`);
      result = await handleBurnCaptionsJob(job, (message, percentage) => {
        console.log(`[JOB-RUNNER] Job ${job.id}: ${percentage}% - ${message}`);
      });
    } else if (job.type === "optimize_clip") {
      console.log(`[JOB-RUNNER] Dispatching optimize_clip job ${job.id}`);
      result = await handleOptimizeClipJob(job, (message, percentage) => {
        console.log(`[JOB-RUNNER] Job ${job.id}: ${percentage}% - ${message}`);
      });
    } else if (job.type === "run_clip_pipeline") {
      console.log(`[JOB-RUNNER] Dispatching run_clip_pipeline job ${job.id}`);
      result = await handleClipPipelineJob(job, (message, percentage) => {
        console.log(`[JOB-RUNNER] Job ${job.id}: ${percentage}% - ${message}`);
      });
    } else if (job.type === "generate_narrative_segments") {
      console.log(`[JOB-RUNNER] Dispatching generate_narrative_segments job ${job.id}`);
      result = await handleGenerateNarrativeSegmentsJob(job, (message, percentage) => {
        console.log(`[JOB-RUNNER] Job ${job.id}: ${percentage}% - ${message}`);
      });
    } else if (job.type === "generate_episode_summary") {
      console.log(`[JOB-RUNNER] Dispatching generate_episode_summary job ${job.id}`);
      result = await handleGenerateEpisodeSummaryJob(job, (message, percentage) => {
        console.log(`[JOB-RUNNER] Job ${job.id}: ${percentage}% - ${message}`);
      });
    } else if (job.type === "resolve_speakers") {
      console.log(`[JOB-RUNNER] Dispatching resolve_speakers job ${job.id}`);
      result = await handleResolveSpeakersJob(job, (message, percentage) => {
        console.log(`[JOB-RUNNER] Job ${job.id}: ${percentage}% - ${message}`);
      });
    } else if (job.type === "detect_contradictions") {
      console.log(`[JOB-RUNNER] Dispatching detect_contradictions job ${job.id}`);
      result = await handleDetectContradictionsJob(job, (message, percentage) => {
        console.log(`[JOB-RUNNER] Job ${job.id}: ${percentage}% - ${message}`);
      });
    } else if (job.type === "compute_show_profile") {
      console.log(`[JOB-RUNNER] Dispatching compute_show_profile job ${job.id}`);
      result = await handleComputeShowProfileJob(job, (message, percentage) => {
        console.log(`[JOB-RUNNER] Job ${job.id}: ${percentage}% - ${message}`);
      });
    } else if (job.type === "build_selman_pack") {
      console.log(`[JOB-RUNNER] Dispatching build_selman_pack job ${job.id}`);
      result = await handleBuildSelmanPackJob(job, (message, percentage) => {
        console.log(`[JOB-RUNNER] Job ${job.id}: ${percentage}% - ${message}`);
      });
    } else if (job.type === "enrich_financial_claims") {
      console.log(`[JOB-RUNNER] Dispatching enrich_financial_claims job ${job.id}`);
      result = await handleEnrichFinancialClaimsJob(job, (message, percentage) => {
        console.log(`[JOB-RUNNER] Job ${job.id}: ${percentage}% - ${message}`);
      });
    } else if (job.type === "resolve_claim_prices") {
      console.log(`[JOB-RUNNER] Dispatching resolve_claim_prices job ${job.id} [DEBUG: type="${job.type}" len=${job.type.length}]`);
      result = await handleResolveClaimPricesJob(job, (message, percentage) => {
        console.log(`[JOB-RUNNER] Job ${job.id}: ${percentage}% - ${message}`);
      });
    } else if (job.type === "score_claim_outcomes") {
      console.log(`[JOB-RUNNER] Dispatching score_claim_outcomes job ${job.id}`);
      result = await handleScoreClaimOutcomesJob(job, (message, percentage) => {
        console.log(`[JOB-RUNNER] Job ${job.id}: ${percentage}% - ${message}`);
      });
    } else if (job.type === "compute_source_credibility") {
      console.log(`[JOB-RUNNER] Dispatching compute_source_credibility job ${job.id}`);
      result = await handleComputeSourceCredibilityJob(job, (message, percentage) => {
        console.log(`[JOB-RUNNER] Job ${job.id}: ${percentage}% - ${message}`);
      });
    } else {
      throw new Error(`Unknown job type: ${job.type}`);
    }

    // Success! Use optimistic locking to ensure we still own this job
    const completed = await storage.updateJobWhereStatus(job.id, "running", {
      status: "done",
      result: result ?? null,
      lastError: null,
      nextRetryAt: null,
      startedAt: null,
      lockedBy: null,
    });

    if (completed) {
      console.log(`[JOB-RUNNER] Job ${job.id} completed successfully`);
      
      const webhookEventMap: Record<string, string> = {
        transcribe: "episode.transcribed",
        youtube_transcript: "episode.transcribed",
        episode_transcript: "episode.transcribed",
        extract_statements: "episode.analyzed",
        classify_statements: "episode.analyzed",
        link_entities: "entities.extracted",
        extract_affiliate_entities: "entities.extracted",
        discover_relations_cross_episode: "patterns.detected",
        discover_relations_episode: "patterns.detected",
        detect_contradictions: "contradictions.detected",
        resolve_speakers: "speakers.resolved",
        topic_discovery: "topics.updated",
        assign_topics: "topics.updated",
        integrity_score: "episode.analyzed",
        embed_statements: "episode.analyzed",
        generate_episode_summary: "episode.analyzed",
        generate_narrative_segments: "episode.analyzed",
        analyze_zoom_call: "zoom.call.analyzed",
        build_selman_pack: "episode.analyzed",
        episode_import: "episode.ingested",
      };
      const webhookEvent = webhookEventMap[job.type];
      if (webhookEvent) {
        const payload: Record<string, any> = { jobId: job.id, jobType: job.type, completedAt: new Date().toISOString() };
        try {
          const jobResult = result ? (typeof result === "string" ? JSON.parse(result) : result) : {};
          if (jobResult.episodeId) payload.episodeId = jobResult.episodeId;
          if (job.episodeSourceId) payload.episodeSourceId = job.episodeSourceId;
          // Enrich selman pack webhook with full result data
          if (job.type === "build_selman_pack") {
            if (jobResult.packId) payload.packId = jobResult.packId;
            if (jobResult.companyName) payload.companyName = jobResult.companyName;
            if (jobResult.priorEpisodeCount !== undefined) payload.priorEpisodeCount = jobResult.priorEpisodeCount;
            if (jobResult.deliveryStatus) payload.deliveryStatus = jobResult.deliveryStatus;
          }
        } catch {}
        fireWebhookEvent(webhookEvent, payload);
      }
    } else {
      console.warn(`[JOB-RUNNER] Job ${job.id} completion update failed - status may have changed externally`);
    }
  } catch (err: any) {
    const errorMessage = err?.message ?? String(err);
    console.error(`[JOB-RUNNER] Job ${job.id} failed (attempt ${attemptNumber}/${MAX_ATTEMPTS}):`, errorMessage);

    // Check if this error is transient (can retry) or permanent (fail immediately)
    let isTransientError = true;
    
    if (err instanceof GeminiError) {
      // GeminiError has explicit transient flag from API response analysis
      isTransientError = err.transient;
      if (!isTransientError) {
        console.log(`[JOB-RUNNER] GeminiError is permanent (code: ${err.code}), skipping retries`);
      }
    } else {
      // For other errors, use heuristic classification
      isTransientError = classifyGenericError(err);
      if (!isTransientError) {
        console.log(`[JOB-RUNNER] Error classified as permanent, skipping retries`);
      }
    }

    // Determine if we should retry or mark as permanent error
    // isPermanent if: max attempts reached OR error is not transient
    const isPermanent = attemptNumber >= MAX_ATTEMPTS || !isTransientError;
    
    // Track the failure for admin visibility
    const errorStack = err?.stack ?? null;
    await trackFailedJob(job, errorMessage, errorStack, isPermanent, isTransientError, attemptNumber);

    if (!isPermanent) {
      // Schedule retry with exponential backoff (optimistic locking)
      const nextRetryAt = getNextRetryTime(attemptNumber);
      const retryDelay = formatRetryDelay(attemptNumber);
      
      console.log(`[JOB-RUNNER] Job ${job.id} will retry in ${retryDelay} (attempt ${attemptNumber + 1}/${MAX_ATTEMPTS})`);
      
      await storage.updateJobWhereStatus(job.id, "running", {
        status: "pending", // Keep as pending so it gets picked up later
        lastError: `Attempt ${attemptNumber} failed (transient): ${errorMessage}`,
        nextRetryAt: nextRetryAt,
        startedAt: null,
        lockedBy: null,
      });
    } else {
      // Permanent error - either max attempts or non-transient error
      const reason = !isTransientError 
        ? `permanent error (no retry): ${errorMessage}`
        : `Failed after ${MAX_ATTEMPTS} attempts. Last error: ${errorMessage}`;
      
      console.error(`[JOB-RUNNER] Job ${job.id} permanently failed: ${!isTransientError ? 'non-transient error' : 'max attempts reached'}`);
      
      await storage.updateJobWhereStatus(job.id, "running", {
        status: "error",
        lastError: reason,
        nextRetryAt: null,
        startedAt: null,
        lockedBy: null,
      });
    }
  }
}

/**
 * PARALLEL JOB PROCESSING
 * 
 * This function now launches jobs in PARALLEL using fire-and-forget pattern.
 * Previously, it would await each job sequentially, causing slow jobs (like transcription)
 * to block faster jobs (like episode_import) from running.
 * 
 * Now:
 * 1. Jobs are claimed synchronously (to enforce concurrency caps)
 * 2. Job execution is launched WITHOUT awaiting (fire-and-forget)
 * 3. Each job type runs independently in parallel
 * 4. Concurrency caps are still enforced per job type
 */
async function runPendingJobs(): Promise<void> {
  console.log("[JOB-RUNNER] Checking for pending jobs...");

  // getJobsByStatus now filters out jobs with nextRetryAt in the future
  const pendingJobs = await storage.getJobsByStatus("pending", 10);
  
  if (pendingJobs.length === 0) {
    return; // No jobs to process
  }
  
  console.log(`[JOB-RUNNER] Found ${pendingJobs.length} job(s) ready to process`);
  
  // Get currently running jobs to enforce concurrency caps
  const runningJobs = await storage.getJobsByStatus("running", 100);
  const runningCountByType: Record<string, number> = {};
  for (const rj of runningJobs) {
    runningCountByType[rj.type] = (runningCountByType[rj.type] || 0) + 1;
  }

  let launchedCount = 0;

  for (const job of pendingJobs) {
    // Check concurrency cap for this job type
    const cap = JOB_CONCURRENCY_CAPS[job.type];
    if (cap !== undefined) {
      const currentRunning = runningCountByType[job.type] || 0;
      if (currentRunning >= cap) {
        console.log(`[JOB-RUNNER] Skipping job ${job.id} - concurrency cap reached for ${job.type} (${currentRunning}/${cap})`);
        continue;
      }
      // Track that we're about to run this job type
      runningCountByType[job.type] = currentRunning + 1;
    }
    
    const attemptNumber = job.attempts + 1;
    
    // Check if max attempts exceeded (shouldn't happen due to status change, but safety check)
    if (attemptNumber > MAX_ATTEMPTS) {
      console.log(`[JOB-RUNNER] Job ${job.id} has exceeded max attempts (${MAX_ATTEMPTS}), marking as error`);
      await storage.updateJobWhereStatus(job.id, "pending", {
        status: "error",
        lastError: `Exceeded max attempts (${MAX_ATTEMPTS})`,
        startedAt: null,
        lockedBy: null,
      });
      continue;
    }

    console.log(`[JOB-RUNNER] Launching job ${job.id} (type: ${job.type}, attempt: ${attemptNumber}/${MAX_ATTEMPTS})`);

    // Claim job with optimistic locking: set status, startedAt, and lockedBy atomically
    const claimedJob = await storage.updateJobWhereStatus(job.id, "pending", {
      status: "running",
      attempts: attemptNumber,
      startedAt: new Date(),
      lockedBy: WORKER_ID,
      nextRetryAt: null, // Clear retry time while running
    });
    
    // If claim failed, someone else grabbed it - skip
    if (!claimedJob) {
      console.log(`[JOB-RUNNER] Job ${job.id} was claimed by another worker, skipping`);
      continue;
    }

    // FIRE AND FORGET: Launch job execution without awaiting
    // Use claimedJob (fresh from DB) instead of stale job object to ensure
    // handlers and error handling see the updated attempts/status/lockedBy fields
    executeJobAsync(claimedJob, attemptNumber).catch(err => {
      // This catch handles unexpected errors in executeJobAsync itself
      // Normal job failures are handled inside executeJobAsync
      console.error(`[JOB-RUNNER] Unexpected error in job ${claimedJob.id} execution wrapper:`, err);
    });

    launchedCount++;
  }

  console.log(`[JOB-RUNNER] Launched ${launchedCount} job(s) in parallel`);
}

async function runContinuously(intervalMs: number = 30000): Promise<never> {
  console.log(`[JOB-RUNNER] Starting continuous job runner (interval: ${intervalMs}ms, max attempts: ${MAX_ATTEMPTS})`);
  console.log(`[JOB-RUNNER] Retry delays: ${RETRY_DELAYS_MS.map((d, i) => `Attempt ${i + 1}: ${formatRetryDelay(i + 1)}`).join(", ")}`);
  console.log(`[JOB-RUNNER] Stuck job recovery: enabled (per-type thresholds)`);
  console.log(`[JOB-RUNNER]   - detect_viral_moments, generate_key_moments: ${STUCK_JOB_THRESHOLD_MINUTES_BY_TYPE.detect_viral_moments} min`);
  console.log(`[JOB-RUNNER]   - youtube_transcript, transcribe, episode_*: ${STUCK_JOB_THRESHOLD_MINUTES_BY_TYPE.youtube_transcript} min`);
  console.log(`[JOB-RUNNER]   - extract_clip, burn_captions: ${STUCK_JOB_THRESHOLD_MINUTES_BY_TYPE.extract_clip} min`);
  console.log(`[JOB-RUNNER]   - default (other job types): ${DEFAULT_STUCK_JOB_THRESHOLD_MINUTES} min`);
  console.log(`[JOB-RUNNER] Maintenance backfill: enabled (interval: ${MAINTENANCE_BACKFILL_INTERVAL_MS / 60000} minutes)`);
  console.log(`[JOB-RUNNER] Worker ID: ${WORKER_ID}`);
  
  // IMMEDIATE STARTUP RECOVERY: Reset any running jobs from previous workers
  // This handles orphaned jobs when the server restarts (even if < threshold time)
  try {
    const orphanedJobs = await storage.getOrphanedRunningJobs(WORKER_ID);
    if (orphanedJobs.length > 0) {
      console.log(`[JOB-RUNNER] Found ${orphanedJobs.length} orphaned job(s) from previous workers - resetting...`);
      for (const job of orphanedJobs) {
        // Decrement attempts so orphaned restarts don't burn retry slots.
        // The job was interrupted externally (server restart), not due to a real failure.
        const restoredAttempts = Math.max(0, job.attempts - 1);
        await storage.updateJobWhereStatus(job.id, "running", {
          status: "pending",
          attempts: restoredAttempts,
          startedAt: null,
          lockedBy: null,
          lastError: `orphaned_on_restart (previous worker: ${job.lockedBy})`,
        });
        console.log(`[JOB-RUNNER] Reset orphaned job ${job.id} (was locked by ${job.lockedBy}, attempts restored: ${job.attempts} → ${restoredAttempts})`);
      }
    }
  } catch (err) {
    console.error("[JOB-RUNNER] Error recovering orphaned jobs on startup:", err);
  }
  
  while (true) {
    try {
      // First, recover any stuck jobs from crashes/restarts
      await reclaimStuckJobs();
      
      // Process user clip requests (converts pending requests into jobs)
      await runUserClipRequestProcessor();
      
      // Then process pending jobs
      await runPendingJobs();
      
      // Run periodic maintenance backfill (every hour)
      const now = Date.now();
      if (now - lastMaintenanceRunTime >= MAINTENANCE_BACKFILL_INTERVAL_MS) {
        console.log("[JOB-RUNNER] Running periodic maintenance backfill...");
        try {
          const summary = await runMaintenanceBackfill();
          const totalEnqueued = 
            summary.annotations.enqueued + 
            summary.commentsFetch.enqueued + 
            summary.commentsMap.enqueued + 
            summary.sponsors.enqueued + 
            summary.claims.enqueued;
          
          if (totalEnqueued > 0) {
            console.log(`[JOB-RUNNER] Maintenance backfill enqueued ${totalEnqueued} job(s):`, JSON.stringify(summary));
          } else {
            console.log("[JOB-RUNNER] Maintenance backfill: no missing jobs found");
          }
        } catch (maintenanceErr) {
          console.error("[JOB-RUNNER] Maintenance backfill error:", maintenanceErr);
        }
        lastMaintenanceRunTime = now;
      }
    } catch (err) {
      console.error("[JOB-RUNNER] Error in job runner loop:", err);
    }
    
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
}

// NOTE: The "run as main script" block has been removed.
// In production bundles, the isMain check incorrectly triggers because
// esbuild bundles everything into one file. This was causing process.exit(0)
// to kill the server. The job runner is started via runContinuously() from routes.ts.
// To run the job runner manually, use: npx tsx server/job-runner.ts [mode] [interval]

export { runPendingJobs, runContinuously, reclaimStuckJobs, getRecentFailedJobs, getFailedJobStats };
