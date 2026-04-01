import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertPodcastSchema, insertEpisodeSchema, insertAnnotationSchema, insertAnnotationReportSchema, insertCategorySchema, insertEntitySchema, insertEntityMentionSchema, insertEpisodeSourceSchema, insertProgramSchema, insertProgramSourceSchema, programConfigSchema, insertDemoLeadSchema, userRoles, userCertifications, entityTypes, affiliateNetworks, sourceKinds, sourcePlatforms, reportReasons, reportStatuses } from "@shared/schema";
import type { ProgramConfig } from "@shared/schema";
import { setupAuth, isAuthenticated, optionalAuth, requireAdmin, requireAdminOrModerator, requireAdminSessionOrKey } from "./replitAuth";
import googleAuthRoutes from "./routes/google-auth";
import zoomAdminRoutes from "./routes/admin/zoom";
import zoomWebhookRoutes from "./routes/zoom-webhook";
import { z } from "zod";
import https from "https";
import bcrypt from "bcrypt";
import crypto from "crypto";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import rateLimit from "express-rate-limit";
import { transcriptionJobManager, type TranscriptionJob } from "./transcription-jobs";
import { generateChaptersFromTranscript } from "./transcription";
import { runContinuously as runJobRunner, getRecentFailedJobs, getFailedJobStats } from "./job-runner";
import { maybeEnqueueYoutubeTranscriptJob, backfillYoutubeTranscriptJobs, enqueueEpisodePipelineJob, backfillEpisodePipelineJobs } from "./youtube-job-helper";
import { shouldGenerateTranscript, canEnqueueTranscriptJob, logTranscriptGuardDecision } from "./transcript-guard";
import { processAnalyzerRequest } from "./analyzer-processor";
import { 
  backfillAnnotations, 
  backfillCommentsFetch, 
  backfillCommentsMap, 
  backfillSponsors, 
  backfillClaims, 
  backfillEpisodeSummaries,
  runMaintenanceBackfill 
} from "./backfill-helper";
import { episodeKnowledgeService } from "./services/episode-knowledge-service";
import { pollRssSource, type RssPollResult } from "./ingestion/rss-poller";
import { pollYouTubeChannel, type YouTubePollResult } from "./ingestion/youtube-poller";
import { pollPodcastIndexFeed, pollPodcastIndexQuery, type PodcastIndexPollResult } from "./ingestion/podcastindex-poller";
import { ObjectStorageService, objectStorageClient } from "./replit_integrations/object_storage";

type AnyPollResult = RssPollResult | YouTubePollResult | PodcastIndexPollResult;

// ============ RATE LIMITING ============
// Strict rate limit for login attempts (5 per minute per IP)
const loginRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  message: { error: "Too many login attempts. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false }, // Disable IPv6 validation warning
});

// Moderate rate limit for voting (30 per minute per IP)
const voteRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  message: { error: "Too many votes. Please slow down." },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
});

// General rate limit for API (100 per minute per IP)
const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  message: { error: "Too many requests. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  skip: (req) => req.path.startsWith("/api/admin"), // Skip for admin routes
});

const transcriptSegmentSchema = z.object({
  startTime: z.number().min(0),
  endTime: z.number().min(0),
  text: z.string().min(1),
  speaker: z.string().optional(),
  type: z.enum(["speech", "music", "media"]).default("speech"),
});

const transcriptUploadSchema = z.object({
  transcript: z.string().min(1),
});

// ============ SNIPPET HELPER FUNCTIONS ============
// Truncate text to a maximum length, preserving word boundaries
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  
  // Find the last space before maxLength
  const truncated = text.substring(0, maxLength);
  const lastSpaceIndex = truncated.lastIndexOf(" ");
  
  if (lastSpaceIndex > maxLength * 0.7) {
    return truncated.substring(0, lastSpaceIndex) + "...";
  }
  return truncated + "...";
}

// Generate snippets from transcript segments by grouping into time windows
function generateSnippetsFromTranscript(
  segments: Array<{ id: string; startTime: number; endTime: number; text: string; speaker?: string | null }>,
  maxChars: number
): Array<{ id: string; startSeconds: number; endSeconds: number | null; label: string; snippetText: string; segmentType: string; isAiGenerated: boolean }> {
  if (segments.length === 0) return [];
  
  // Group segments into ~2-minute windows
  const WINDOW_SECONDS = 120;
  const snippets: Array<{ id: string; startSeconds: number; endSeconds: number | null; label: string; snippetText: string; segmentType: string; isAiGenerated: boolean }> = [];
  
  let currentWindow: typeof segments = [];
  let windowStart = segments[0].startTime;
  
  for (const segment of segments) {
    if (segment.startTime - windowStart >= WINDOW_SECONDS && currentWindow.length > 0) {
      // Process current window
      const snippet = createSnippetFromWindow(currentWindow, maxChars, snippets.length);
      snippets.push(snippet);
      
      // Start new window
      currentWindow = [segment];
      windowStart = segment.startTime;
    } else {
      currentWindow.push(segment);
    }
  }
  
  // Don't forget the last window
  if (currentWindow.length > 0) {
    const snippet = createSnippetFromWindow(currentWindow, maxChars, snippets.length);
    snippets.push(snippet);
  }
  
  return snippets;
}

// Create a snippet from a window of segments
function createSnippetFromWindow(
  segments: Array<{ id: string; startTime: number; endTime: number; text: string; speaker?: string | null }>,
  maxChars: number,
  index: number
): { id: string; startSeconds: number; endSeconds: number | null; label: string; snippetText: string; segmentType: string; isAiGenerated: boolean } {
  const combinedText = segments.map(s => s.text).join(" ");
  const speakers = [...new Set(segments.filter(s => s.speaker).map(s => s.speaker))];
  
  // Generate a label based on speaker(s) and timestamp
  const speakerLabel = speakers.length > 0 ? speakers.join(" & ") : "Discussion";
  const minutes = Math.floor(segments[0].startTime / 60);
  const label = `${speakerLabel} at ${minutes}m`;
  
  return {
    id: `derived-${segments[0].id}`,
    startSeconds: segments[0].startTime,
    endSeconds: segments[segments.length - 1].endTime,
    label,
    snippetText: truncateText(combinedText, maxChars),
    segmentType: "topic",
    isAiGenerated: false,
  };
}

// ============ VIDEO SOURCE DETECTION HELPERS ============
// Interface for video source extracted from Podcast Index alternateEnclosures
interface DetectedVideoSource {
  url: string;
  platform: "youtube" | "vimeo" | "other";
  kind: "video";
  mimeType: string;
  height?: number;
  title?: string;
}

// Detect platform from URL
function detectVideoPlatform(url: string): "youtube" | "vimeo" | "other" {
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes("youtube.com") || lowerUrl.includes("youtu.be")) {
    return "youtube";
  }
  if (lowerUrl.includes("vimeo.com")) {
    return "vimeo";
  }
  return "other";
}

// Check if MIME type indicates video content
function isVideoMimeType(mimeType: string): boolean {
  return mimeType.toLowerCase().startsWith("video/");
}

// Check if URL appears to be video content (platform or extension)
function isVideoUrl(url: string): boolean {
  const lowerUrl = url.toLowerCase();
  // Known video platforms
  if (lowerUrl.includes("youtube.com") || lowerUrl.includes("youtu.be") ||
      lowerUrl.includes("vimeo.com")) {
    return true;
  }
  // Video file extensions
  const videoExtensions = [".mp4", ".webm", ".mov", ".avi", ".mkv", ".m4v"];
  return videoExtensions.some(ext => lowerUrl.includes(ext));
}

// Check if URL is a streaming format we don't currently handle
function isUnrecognizedStreamingFormat(url: string, mimeType: string): boolean {
  const lowerUrl = url.toLowerCase();
  const lowerMime = mimeType.toLowerCase();
  
  // HLS (HTTP Live Streaming)
  if (lowerUrl.includes(".m3u8") || lowerMime.includes("mpegurl") || lowerMime.includes("x-mpegurl")) {
    return true;
  }
  // DASH (Dynamic Adaptive Streaming over HTTP)
  if (lowerUrl.includes(".mpd") || lowerMime.includes("dash+xml")) {
    return true;
  }
  return false;
}

// Extract video sources from Podcast Index alternateEnclosures
function extractVideoSources(alternateEnclosures: any[]): DetectedVideoSource[] {
  if (!alternateEnclosures || !Array.isArray(alternateEnclosures)) {
    return [];
  }

  const videoSources: DetectedVideoSource[] = [];

  for (const enclosure of alternateEnclosures) {
    // Get the URL from sources array or direct URL first
    let url = "";
    if (enclosure.sources && Array.isArray(enclosure.sources)) {
      // Find the first HTTP/HTTPS source (prefer these over IPFS, torrent, etc.)
      const httpSource = enclosure.sources.find((s: any) => 
        s.uri && (s.uri.startsWith("http://") || s.uri.startsWith("https://"))
      );
      if (httpSource) {
        url = httpSource.uri;
      }
    } else if (enclosure.url) {
      url = enclosure.url;
    }

    if (!url) {
      continue;
    }

    // Check if this is a video enclosure using multiple strategies:
    // 1. MIME type (if available)
    // 2. URL patterns (YouTube, Vimeo, or video file extensions)
    // 3. Presence of height attribute (indicates video)
    const mimeType = enclosure.type || "";
    const hasVideoMimeType = isVideoMimeType(mimeType);
    const hasVideoUrl = isVideoUrl(url);
    const hasHeight = typeof enclosure.height === "number" && enclosure.height > 0;
    
    if (!hasVideoMimeType && !hasVideoUrl && !hasHeight) {
      // Log unrecognized streaming formats for future analysis
      if (isUnrecognizedStreamingFormat(url, mimeType)) {
        console.log(`[VIDEO_SOURCES] Unrecognized streaming format detected (not imported): URL=${url}, MIME=${mimeType}`);
      }
      continue;
    }

    // Infer MIME type if not provided
    let finalMimeType = mimeType;
    if (!finalMimeType && hasVideoUrl) {
      finalMimeType = "video/mp4"; // Default for detected video URLs
    }

    videoSources.push({
      url,
      platform: detectVideoPlatform(url),
      kind: "video",
      mimeType: finalMimeType,
      height: enclosure.height || undefined,
      title: enclosure.title || undefined,
    });
  }

  // Deduplicate by URL and prefer highest resolution
  const uniqueByPlatform = new Map<string, DetectedVideoSource>();
  for (const source of videoSources) {
    const existing = uniqueByPlatform.get(source.platform);
    if (!existing || (source.height && existing.height && source.height > existing.height)) {
      uniqueByPlatform.set(source.platform, source);
    }
  }

  return Array.from(uniqueByPlatform.values());
}

async function fetchYouTubeTranscript(videoId: string): Promise<any> {
  const apiToken = process.env.YOUTUBE_TRANSCRIPT_API_TOKEN;
  if (!apiToken) {
    throw new Error("YOUTUBE_TRANSCRIPT_API_TOKEN not configured");
  }

  const data = JSON.stringify({ ids: [videoId] });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'www.youtube-transcript.io',
      path: '/api/transcripts',
      method: 'POST',
      headers: {
        'Authorization': `Basic ${apiToken}`,
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(new Error('Failed to parse YouTube transcript response'));
          }
        } else if (res.statusCode === 429) {
          reject(new Error('Rate limit exceeded. Please wait a few seconds and try again.'));
        } else if (res.statusCode === 403) {
          reject(new Error('Access forbidden. The video may be private or region-restricted.'));
        } else if (res.statusCode === 404) {
          reject(new Error('Video not found. Verify the YouTube video ID is correct.'));
        } else if (res.statusCode === 503) {
          reject(new Error('YouTube transcript service temporarily unavailable. Please try again later.'));
        } else {
          reject(new Error(`YouTube transcript API returned status ${res.statusCode}. Please check your API subscription and video ID.`));
        }
      });
    });

    req.on('error', (error) => reject(error));
    req.write(data);
    req.end();
  });
}

function convertYouTubeTranscriptToSegments(transcriptData: any, videoId: string): any[] {
  // Check for error responses from YouTube transcript API
  if (transcriptData.error) {
    if (transcriptData.error.includes('no transcript') || transcriptData.error.includes('not available')) {
      throw new Error('Transcript not available for this video. Verify captions are enabled on YouTube.');
    } else if (transcriptData.error.includes('rate limit')) {
      throw new Error('Rate limit exceeded. Please wait a few seconds and try again.');
    } else {
      throw new Error(`YouTube API error: ${transcriptData.error}`);
    }
  }

  // Handle different possible response formats
  let transcript;
  
  // Format 0: { "0": { data: [{ transcript: [...] }] } } (numeric key wrapper)
  if (transcriptData['0']?.data && Array.isArray(transcriptData['0'].data) && transcriptData['0'].data[0]?.transcript) {
    transcript = transcriptData['0'].data[0].transcript;
  }
  // Format 1: { data: [{ transcript: [...] }] }
  else if (transcriptData.data && Array.isArray(transcriptData.data) && transcriptData.data[0]?.transcript) {
    transcript = transcriptData.data[0].transcript;
  }
  // Format 2: { [videoId]: { transcript: [...] } }
  else if (transcriptData[videoId]?.transcript) {
    transcript = transcriptData[videoId].transcript;
  }
  // Format 3: { transcript: [...] }
  else if (transcriptData.transcript) {
    transcript = transcriptData.transcript;
  }
  // Format 4: Direct array [...]
  else if (Array.isArray(transcriptData)) {
    transcript = transcriptData;
  }
  // Unrecognized format
  else {
    console.error('[ERROR] Unrecognized transcript format. Keys:', Object.keys(transcriptData));
    throw new Error('No transcript data found for video. Verify the video ID is correct and captions are available.');
  }

  if (!Array.isArray(transcript) || transcript.length === 0) {
    throw new Error('No transcript segments found. Verify captions are available for this video.');
  }

  return transcript.map((item: any, index: number) => {
    // Comprehensive text extraction (handles all YouTube API formats)
    let text = '';
    
    // Direct string
    if (typeof item.text === 'string') {
      text = item.text;
    }
    // Simple text object
    else if (item.text?.simpleText) {
      text = item.text.simpleText;
    }
    // Runs array (common in multi-language/styled text)
    else if (Array.isArray(item.text?.runs)) {
      text = item.text.runs.map((r: any) => {
        if (typeof r === 'string') return r;
        if (typeof r.text === 'string') return r.text;
        if (r.text?.simpleText) return r.text.simpleText;
        if (r.simpleText) return r.simpleText;
        return '';
      }).filter(Boolean).join('');
    }
    // Accessibility label (fallback for auto-captions)
    else if (item.text?.accessibility?.accessibilityData?.label) {
      text = item.text.accessibility.accessibilityData.label;
    }
    // Array of strings/objects
    else if (Array.isArray(item.text)) {
      text = item.text.map((t: any) => {
        if (typeof t === 'string') return t;
        return t?.text || t?.simpleText || '';
      }).filter(Boolean).join(' ');
    }

    // Skip segments with no extractable text
    if (!text.trim()) {
      console.warn('[WARN] Skipping segment with no text:', JSON.stringify(item).slice(0, 200));
    }

    // Robust timestamp parsing (handles numbers, numeric strings, and time formats)
    const parseTime = (value: any): number | null => {
      if (typeof value === 'number' && !isNaN(value)) return value;
      
      if (typeof value === 'string') {
        // Remove non-numeric suffixes (e.g., "7.17s" -> "7.17")
        let cleaned = value.replace(/[^\d.:,-]/g, '');
        
        // Handle locale-specific decimal separators (e.g., "7,17" -> "7.17")
        cleaned = cleaned.replace(',', '.');
        
        // Handle HH:MM:SS or MM:SS format
        if (cleaned.includes(':')) {
          const parts = cleaned.split(':').map(p => parseFloat(p) || 0);
          if (parts.length === 3) {
            // HH:MM:SS
            return parts[0] * 3600 + parts[1] * 60 + parts[2];
          } else if (parts.length === 2) {
            // MM:SS
            return parts[0] * 60 + parts[1];
          }
        }
        
        const parsed = parseFloat(cleaned);
        return isNaN(parsed) ? null : parsed;
      }
      
      return null;
    };

    const startTime = parseTime(item.start) ?? parseTime(item.startTime) ?? (index * 5);
    const duration = parseTime(item.duration) ?? 5;
    const endTime = parseTime(item.end) ?? parseTime(item.endTime) ?? (startTime + duration);

    // Ensure endTime > startTime with small epsilon
    const finalEndTime = endTime <= startTime ? startTime + 0.1 : endTime;

    return {
      startTime: Math.max(0, startTime),
      endTime: Math.max(startTime + 0.1, finalEndTime),
      text: text.trim(),
      speaker: item.speaker || undefined,
      type: 'speech' as const,
    };
  }).filter(segment => segment.text.length > 0); // Remove empty segments
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup authentication middleware
  await setupAuth(app);

  // ============ Google/YouTube Auth Routes ============
  app.use(googleAuthRoutes);

  // ============ Zoom Webhook (public - no auth, Zoom sends events here) ============
  app.use("/api/zoom/webhook", zoomWebhookRoutes);

  // ============ Zoom Admin Routes ============
  app.use("/api/admin/zoom", zoomAdminRoutes);

  // ============ Public Episode Intelligence API ============
  // Returns episode data with auth-aware content gating (public: 5 moments/claims, auth: all)
  app.get("/api/episodes/:id/intelligence", optionalAuth, async (req: any, res) => {
    try {
      const episodeId = req.params.id;
      const isAuthed = !!req.user;
      const viewer = isAuthed ? "auth" : "public";

      const episode = await storage.getEpisode(episodeId);
      if (!episode) return res.status(404).json({ error: "Episode not found" });

      const podcast = await storage.getPodcast(episode.podcastId);

      // Viral moments: prefer displayOrder then viralityScore
      const allMoments = await storage.getViralMomentsByEpisode(episodeId);
      const orderedMoments = [...allMoments].sort((a: any, b: any) => {
        const da = a.displayOrder ?? 0;
        const db = b.displayOrder ?? 0;
        if (da !== db) return da - db;
        return (b.viralityScore ?? 0) - (a.viralityScore ?? 0);
      });

      const visibleMoments = isAuthed ? orderedMoments : orderedMoments.slice(0, 5);

      const mapRole = (contentType?: string | null, hookType?: string | null): string => {
        const ct = (contentType || "").toLowerCase();
        if (ct === "framework") return "Authority";
        if (ct === "confession") return "Hook";
        if (ct === "story") return "Conversation";
        if (ct === "tactical" || ct === "insight") return "Insight";
        const ht = (hookType || "").toLowerCase();
        if (ht.includes("question") || ht.includes("curiosity")) return "Hook";
        return "Insight";
      };

      const moments = visibleMoments.map((m: any) => {
        const hasAnyClipFile = !!(m.videoPath || m.captionedPath || m.optimizedPath);
        return {
          id: m.id,
          title: m.suggestedTitle,
          startTime: m.startTime,
          endTime: m.endTime,
          momentKind: m.momentKind ?? "viral",
          viralityScore: m.viralityScore,
          transcriptSnippet: m.pullQuote || m.text,
          whyThisMatters: m.text || m.hookReason,
          signals: m.shareabilityFactors ?? [],
          role: mapRole(m.contentType, m.hookType),
          clipStatus: m.clipStatus ?? "pending",
          previewUrl: hasAnyClipFile ? `/api/viral-moments/${m.id}/preview` : null,
        };
      });

      // Claims
      const allClaims = await storage.getClaimsByEpisodeId(episodeId);
      const orderedClaims = [...allClaims].sort((a: any, b: any) => (b.confidence ?? 0) - (a.confidence ?? 0));
      const visibleClaims = isAuthed ? orderedClaims : orderedClaims.slice(0, 5);

      const claims = visibleClaims.map((c: any) => ({
        id: c.id,
        claimText: c.claimText,
        startTime: c.startTime,
        endTime: c.endTime ?? null,
        claimType: c.claimType,
        confidence: c.confidence,
        contextText: "",
        whyItMatters: "",
      }));

      // Narrative segments
      const segs = await storage.getEpisodeSegmentsByEpisode(episodeId);
      const shouldShowSegment = (label: string, segmentType: string) => {
        const l = (label || "").toLowerCase();
        const t = (segmentType || "").toLowerCase();
        if (t === "narrative") return true;
        return ["setup", "rising tension", "tension", "insight", "resolution"].includes(l);
      };

      const narrativeSegments = (segs || [])
        .filter((s: any) => shouldShowSegment(s.label, s.segmentType))
        .sort((a: any, b: any) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
        .map((s: any) => ({
          id: s.id,
          label: s.label,
          startTime: s.startTime,
          endTime: s.endTime ?? null,
          summary: s.summary ?? "",
        }));

      // Derive summary one-liner
      const deriveSummaryOneLiner = (description?: string | null) => {
        if (!description) return "This episode is being analyzed. Check back shortly.";
        const cleaned = description.replace(/\s+/g, " ").trim();
        return cleaned.length > 220 ? cleaned.slice(0, 217) + "…" : cleaned;
      };

      const transcriptReady = (episode.transcriptStatus || "").toLowerCase() === "ready";
      const shouldNoIndex = !transcriptReady || moments.length === 0;

      let relatedMoments: Array<{
        id: string;
        podcastName: string;
        episodeTitle: string;
        title: string;
        startTime: number;
        endTime: number;
        whyThisMatters: string;
        linkToEpisode: string;
      }> = [];
      try {
        const { db: dbInstance } = await import("./db");
        const { sql: sqlTag } = await import("drizzle-orm");
        const crossRelations = await dbInstance.execute(sqlTag`
          SELECT
            sr.id AS relation_id,
            sr.confidence,
            sa.text AS anchor_text,
            sb.text AS match_text,
            sb.start_time AS match_start_time,
            sb.episode_id AS match_episode_id,
            e2.title AS match_episode_title,
            p2.title AS match_podcast_name
          FROM statement_relations sr
          INNER JOIN statements sa ON sa.id = sr.statement_a_id
          INNER JOIN statements sb ON sb.id = sr.statement_b_id
          INNER JOIN episodes e2 ON e2.id = sb.episode_id
          INNER JOIN podcasts p2 ON p2.id = e2.podcast_id
          WHERE sr.scope = 'cross_episode'
            AND sr.relation = 'recurrence'
            AND sa.episode_id = ${episodeId}
          UNION
          SELECT
            sr.id AS relation_id,
            sr.confidence,
            sb.text AS anchor_text,
            sa.text AS match_text,
            sa.start_time AS match_start_time,
            sa.episode_id AS match_episode_id,
            e2.title AS match_episode_title,
            p2.title AS match_podcast_name
          FROM statement_relations sr
          INNER JOIN statements sa ON sa.id = sr.statement_a_id
          INNER JOIN statements sb ON sb.id = sr.statement_b_id
          INNER JOIN episodes e2 ON e2.id = sa.episode_id
          INNER JOIN podcasts p2 ON p2.id = e2.podcast_id
          WHERE sr.scope = 'cross_episode'
            AND sr.relation = 'recurrence'
            AND sb.episode_id = ${episodeId}
          ORDER BY confidence DESC
          LIMIT 10
        `);

        const rows = crossRelations.rows as Array<{
          relation_id: string;
          confidence: number;
          anchor_text: string;
          match_text: string;
          match_start_time: number;
          match_episode_id: string;
          match_episode_title: string;
          match_podcast_name: string;
        }>;

        relatedMoments = rows.map(r => ({
          id: r.relation_id,
          podcastName: r.match_podcast_name || "Podcast",
          episodeTitle: r.match_episode_title || "Episode",
          title: r.match_text.length > 80 ? r.match_text.slice(0, 77) + "..." : r.match_text,
          startTime: r.match_start_time || 0,
          endTime: (r.match_start_time || 0) + 30,
          whyThisMatters: `Recurring idea (${Math.round(r.confidence * 100)}% match): "${r.anchor_text.length > 60 ? r.anchor_text.slice(0, 57) + "..." : r.anchor_text}"`,
          linkToEpisode: `/episode/${r.match_episode_id}`,
        }));
      } catch (relErr: any) {
        console.error("[EPISODE INTELLIGENCE] Error fetching related moments:", relErr.message);
      }

      return res.json({
        viewer,
        episode: {
          episodeId: episode.id,
          podcastId: episode.podcastId,
          podcastName: podcast?.title || podcast?.name || "Podcast",
          title: episode.title,
          episodeNumber: episode.episodeNumber ?? null,
          publishedDate: episode.publishedAt,
          durationSeconds: episode.duration,
          summaryOneLiner: deriveSummaryOneLiner(episode.description),
          shouldNoIndex,
          episodeSummary: episode.episodeSummary ?? null,
        },
        moments,
        claims,
        narrativeSegments,
        relatedMoments,
      });
    } catch (err) {
      console.error("[EPISODE INTELLIGENCE] error", err);
      res.status(500).json({ error: "Failed to load episode intelligence" });
    }
  });

  // ============ Public Viral Moment Preview Endpoint ============
  // Streams video preview with Range support. Public users can only preview ready clips.
  // Supports both local /tmp paths and Object Storage paths.
  app.get("/api/viral-moments/:id/preview", optionalAuth, async (req: any, res) => {
    try {
      const moment = await storage.getViralMoment(req.params.id);
      if (!moment) return res.status(404).json({ error: "Moment not found" });

      const isAuthed = !!req.user;

      // Public guardrail: only allow preview once clip is ready
      if (!isAuthed) {
        const status = (moment.clipStatus || "").toLowerCase();
        if (status !== "ready") {
          return res.status(403).json({ error: "Preview not available yet" });
        }
      }

      const videoPath = moment.captionedPath || moment.videoPath;
      if (!videoPath) return res.status(404).json({ error: "No video available for this moment" });

      // Check if this is an Object Storage path (starts with /replit-objstore-)
      if (videoPath.startsWith("/replit-objstore-")) {
        try {
          const pathParts = videoPath.split("/").filter(p => p);
          const bucketName = pathParts[0];
          const objectName = pathParts.slice(1).join("/");
          
          const bucket = objectStorageClient.bucket(bucketName);
          const file = bucket.file(objectName);
          
          const [exists] = await file.exists();
          if (!exists) {
            return res.status(404).json({ error: "Video file not found in storage" });
          }
          
          const [metadata] = await file.getMetadata();
          const fileSize = parseInt(metadata.size as string, 10);
          
          res.setHeader("Cache-Control", "public, max-age=3600");
          res.setHeader("Accept-Ranges", "bytes");
          
          const range = req.headers.range;
          
          if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

            if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= fileSize) {
              return res.status(416).setHeader("Content-Range", `bytes */${fileSize}`).end();
            }

            const chunksize = end - start + 1;
            res.writeHead(206, {
              "Content-Range": `bytes ${start}-${end}/${fileSize}`,
              "Content-Length": chunksize,
              "Content-Type": "video/mp4",
            });

            const stream = file.createReadStream({ start, end });
            stream.pipe(res);
          } else {
            res.writeHead(200, {
              "Content-Length": fileSize,
              "Content-Type": "video/mp4",
            });
            file.createReadStream().pipe(res);
          }
          return;
        } catch (objectStorageError) {
          console.error("[PUBLIC PREVIEW] Object Storage error:", objectStorageError);
          return res.status(500).json({ error: "Failed to serve video from storage" });
        }
      }

      // Local file path fallback (for /tmp or other local paths)
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Accept-Ranges", "bytes");

      try {
        await fs.access(videoPath);
      } catch {
        return res.status(404).json({ error: "Video file not found on disk" });
      }

      const stat = await fs.stat(videoPath);
      const fileSize = stat.size;
      const range = req.headers.range;

      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

        // Validate range
        if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= fileSize) {
          return res.status(416).setHeader("Content-Range", `bytes */${fileSize}`).end();
        }

        const chunksize = end - start + 1;
        const { createReadStream } = await import("fs");
        const file = createReadStream(videoPath, { start, end });

        res.writeHead(206, {
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Content-Length": chunksize,
          "Content-Type": "video/mp4",
        });

        file.pipe(res);
      } else {
        const { createReadStream } = await import("fs");
        res.writeHead(200, {
          "Content-Length": fileSize,
          "Content-Type": "video/mp4",
        });
        createReadStream(videoPath).pipe(res);
      }
    } catch (error) {
      console.error("[PUBLIC PREVIEW] Error serving video:", error);
      res.status(500).json({ error: "Failed to serve video" });
    }
  });

  // ============ Local Auth Routes (email/password) ============

  // Registration validation schema
  const registerSchema = z.object({
    email: z.string().email("Invalid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
  });

  // Login validation schema
  const loginSchema = z.object({
    email: z.string().email("Invalid email address"),
    password: z.string().min(1, "Password is required"),
  });

  // Register new user with email/password
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { email, password, firstName, lastName } = registerSchema.parse(req.body);

      // Check if email already exists
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ error: "An account with this email already exists" });
      }

      // Hash password
      const saltRounds = 12;
      const passwordHash = await bcrypt.hash(password, saltRounds);

      // Create user
      const user = await storage.createLocalUser({
        email,
        passwordHash,
        firstName,
        lastName,
      });

      // Log user in by creating session
      const sessionUser = {
        claims: {
          sub: user.id,
          email: user.email || undefined,
          first_name: user.firstName || undefined,
          last_name: user.lastName || undefined,
        },
        expires_at: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60), // 1 week
      };

      req.login(sessionUser, (err: any) => {
        if (err) {
          console.error("Session creation error:", err);
          return res.status(500).json({ error: "Account created but login failed" });
        }
        import("./email").then(({ sendWelcomeEmail }) => {
          if (user.email) sendWelcomeEmail(user.email, user.firstName).catch(() => {});
        }).catch(() => {});
        res.status(201).json({
          message: "Account created successfully",
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
          },
        });
      });
    } catch (error) {
      console.error("Registration error:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: "Registration failed" });
    }
  });

  // Login with email/password (rate limited)
  app.post("/api/auth/login", loginRateLimiter, async (req, res) => {
    try {
      const { email, password } = loginSchema.parse(req.body);

      // Find user by email
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      // Check if user is banned
      if (user.isBanned) {
        return res.status(403).json({ error: "Your account has been suspended", reason: user.banReason });
      }

      // Check if user has a password (might be Replit Auth only)
      if (!user.passwordHash) {
        return res.status(401).json({ error: "Please sign in with Replit" });
      }

      // Verify password
      const validPassword = await bcrypt.compare(password, user.passwordHash);
      if (!validPassword) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      // Create session
      const sessionUser = {
        claims: {
          sub: user.id,
          email: user.email || undefined,
          first_name: user.firstName || undefined,
          last_name: user.lastName || undefined,
          profile_image_url: user.profileImageUrl || undefined,
        },
        expires_at: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60), // 1 week
      };

      req.login(sessionUser, (err: any) => {
        if (err) {
          console.error("Session creation error:", err);
          return res.status(500).json({ error: "Login failed" });
        }
        res.json({
          message: "Login successful",
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            profileImageUrl: user.profileImageUrl,
          },
        });
      });
    } catch (error) {
      console.error("Login error:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: "Login failed" });
    }
  });

  // Request password reset
  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const { email } = z.object({ email: z.string().email() }).parse(req.body);

      // Find user
      const user = await storage.getUserByEmail(email);
      if (!user) {
        // Don't reveal if email exists for security
        return res.json({ message: "If an account exists with this email, you will receive reset instructions" });
      }

      // Generate reset token and hash it for secure storage
      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

      // Store the hashed token in database
      await storage.setPasswordResetToken(email, tokenHash, resetExpires);

      // Log the raw token for admin use (never expose to client)
      // In production, this would be sent via email service
      console.log(`[PASSWORD RESET] Admin link for ${email}: /reset-password?token=${rawToken}`);

      res.json({ 
        message: "If an account exists with this email, you will receive reset instructions",
      });
    } catch (error) {
      console.error("Password reset request error:", error);
      res.status(500).json({ error: "Failed to process password reset request" });
    }
  });

  // Reset password with token
  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { token, password } = z.object({
        token: z.string().min(1),
        password: z.string().min(8, "Password must be at least 8 characters"),
      }).parse(req.body);

      // Hash the provided token to compare with stored hash
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

      // Find user by hashed reset token
      const user = await storage.getUserByResetToken(tokenHash);
      if (!user) {
        return res.status(400).json({ error: "Invalid or expired reset token" });
      }

      // Check if token is expired
      if (user.passwordResetExpires && new Date(user.passwordResetExpires) < new Date()) {
        await storage.clearPasswordResetToken(user.id);
        return res.status(400).json({ error: "Reset token has expired. Please request a new one." });
      }

      // Hash new password
      const saltRounds = 12;
      const passwordHash = await bcrypt.hash(password, saltRounds);

      // Update password and clear reset token
      await storage.updateUserPassword(user.id, passwordHash);

      res.json({ message: "Password reset successfully. You can now login with your new password." });
    } catch (error) {
      console.error("Password reset error:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: "Failed to reset password" });
    }
  });

  // Logout (works for both local and Replit auth)
  app.post("/api/auth/logout", (req, res) => {
    req.logout((err: any) => {
      if (err) {
        console.error("Logout error:", err);
        return res.status(500).json({ error: "Logout failed" });
      }
      res.json({ message: "Logged out successfully" });
    });
  });

  // ============ End Local Auth Routes ============

  // Documentation download endpoint - serves technical documentation for external storage
  app.get('/api/docs/download', async (_req, res) => {
    try {
      const fs = await import('fs');
      const path = await import('path');
      const docPath = path.join(process.cwd(), 'docs', 'technical-architecture.md');
      
      if (!fs.existsSync(docPath)) {
        return res.status(404).json({ error: 'Documentation file not found' });
      }
      
      const content = fs.readFileSync(docPath, 'utf-8');
      
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="PODDNA-Technical-Architecture.md"');
      res.send(content);
    } catch (error) {
      console.error('Error downloading documentation:', error);
      res.status(500).json({ error: 'Failed to download documentation' });
    }
  });

  // Auth endpoint - get current user
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  app.get("/api/podcasts", async (_req, res) => {
    try {
      const podcasts = await storage.getAllPodcasts();
      res.json(podcasts);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch podcasts" });
    }
  });

  app.get("/api/podcasts/:id", async (req, res) => {
    try {
      const podcast = await storage.getPodcast(req.params.id);
      if (!podcast) {
        return res.status(404).json({ error: "Podcast not found" });
      }
      res.json(podcast);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch podcast" });
    }
  });

  app.post("/api/podcasts", async (req, res) => {
    try {
      const validated = insertPodcastSchema.parse(req.body);
      const podcast = await storage.createPodcast(validated);
      res.status(201).json(podcast);
    } catch (error) {
      res.status(400).json({ error: "Invalid podcast data" });
    }
  });

  app.patch("/api/podcasts/:id", isAuthenticated, async (req, res) => {
    try {
      const updateData = { ...req.body };
      
      // Normalize knownSpeakers: trim whitespace, remove duplicates, filter empty
      if (updateData.knownSpeakers && Array.isArray(updateData.knownSpeakers)) {
        updateData.knownSpeakers = [...new Set(
          updateData.knownSpeakers
            .map((s: string) => s.trim())
            .filter((s: string) => s.length > 0)
        )];
      }
      
      const podcast = await storage.updatePodcast(req.params.id, updateData);
      if (!podcast) {
        return res.status(404).json({ error: "Podcast not found" });
      }
      res.json(podcast);
    } catch (error) {
      console.error("[ERROR] Failed to update podcast:", error);
      res.status(400).json({ error: "Failed to update podcast" });
    }
  });

  app.delete("/api/podcasts/:id", isAuthenticated, async (req, res) => {
    try {
      const deleted = await storage.deletePodcast(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Podcast not found" });
      }
      res.json({ message: "Podcast deleted successfully" });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete podcast" });
    }
  });

  app.get("/api/podcasts/featured/landing", async (_req, res) => {
    try {
      const podcasts = await storage.getFeaturedLandingPodcasts();
      res.json(podcasts);
    } catch (error) {
      console.error("[ERROR] Failed to fetch featured landing podcasts:", error);
      res.status(500).json({ error: "Failed to fetch featured podcasts" });
    }
  });

  app.get("/api/podcasts/featured/explore", async (_req, res) => {
    try {
      const podcasts = await storage.getFeaturedExplorePodcasts();
      res.json(podcasts);
    } catch (error) {
      console.error("[ERROR] Failed to fetch featured explore podcasts:", error);
      res.status(500).json({ error: "Failed to fetch featured podcasts" });
    }
  });

  // ============ PUBLIC PODCAST INDEX SEARCH ============
  // Public search endpoint for "Add to PodDNA" workflow
  app.get("/api/discover/search", async (req, res) => {
    try {
      const { q } = req.query;
      if (!q || typeof q !== "string" || q.trim().length < 2) {
        return res.status(400).json({ error: "Search query 'q' is required (min 2 characters)" });
      }

      // Check if Podcast Index is configured
      const apiKey = process.env.PODCAST_INDEX_API_KEY?.trim();
      const apiSecret = process.env.PODCAST_INDEX_API_SECRET?.trim();
      
      if (!apiKey || !apiSecret) {
        // If not configured, fall back to local search only
        const localPodcasts = await storage.getAllPodcasts();
        const query = q.toLowerCase();
        const filteredPodcasts = localPodcasts.filter(p => 
          p.title.toLowerCase().includes(query) ||
          p.host?.toLowerCase().includes(query) ||
          p.description?.toLowerCase().includes(query)
        ).slice(0, 20);
        
        return res.json({
          source: "local",
          count: filteredPodcasts.length,
          podcasts: filteredPodcasts.map(p => ({
            id: p.id,
            title: p.title,
            author: p.host,
            description: p.description,
            artworkUrl: p.artworkUrl,
            feedUrl: p.feedUrl,
            inPodDNA: true,
            podcastIndexFeedId: p.podcastIndexFeedId,
          })),
        });
      }

      // Use Podcast Index API
      const podcastIndexModule = await import("podcast-index-api");
      const PodcastIndexApi = podcastIndexModule.default;
      const podcastIndexApi = PodcastIndexApi(apiKey, apiSecret, "PODDNA/1.0");

      console.log(`[DISCOVER] Searching for: "${q}"`);
      
      // Search Podcast Index
      let results = await podcastIndexApi.searchByTitle(q, '', false, true);
      
      if (!results.feeds || results.feeds.length === 0) {
        results = await podcastIndexApi.searchByTerm(q, '', false, true);
      }

      // Check which podcasts are already in PodDNA
      const localPodcasts = await storage.getAllPodcasts();
      const localFeedIds = new Set(localPodcasts.filter(p => p.podcastIndexFeedId).map(p => p.podcastIndexFeedId));
      const localFeedUrls = new Set(localPodcasts.filter(p => p.feedUrl).map(p => p.feedUrl?.toLowerCase()));

      const podcasts = (results.feeds || []).slice(0, 20).map((feed: any) => {
        const inPodDNA = localFeedIds.has(String(feed.id)) || 
                        (feed.url && localFeedUrls.has(feed.url.toLowerCase()));
        const existingPodcast = localPodcasts.find(p => 
          p.podcastIndexFeedId === String(feed.id) ||
          (p.feedUrl && feed.url && p.feedUrl.toLowerCase() === feed.url.toLowerCase())
        );

        return {
          id: existingPodcast?.id || null,
          podcastIndexFeedId: String(feed.id),
          title: feed.title,
          author: feed.author,
          description: feed.description,
          artworkUrl: feed.artwork || feed.image,
          feedUrl: feed.url,
          episodeCount: feed.episodeCount,
          inPodDNA,
        };
      });

      res.json({
        source: "podcast_index",
        count: podcasts.length,
        podcasts,
      });
    } catch (error) {
      console.error("[DISCOVER] Search error:", error);
      res.status(500).json({ error: "Failed to search podcasts" });
    }
  });

  // Get episodes for a podcast from Podcast Index (public)
  app.get("/api/discover/podcast/:feedId/episodes", async (req, res) => {
    try {
      const { feedId } = req.params;
      const max = parseInt(req.query.max as string) || 20;

      // Check if Podcast Index is configured
      const apiKey = process.env.PODCAST_INDEX_API_KEY?.trim();
      const apiSecret = process.env.PODCAST_INDEX_API_SECRET?.trim();
      
      if (!apiKey || !apiSecret) {
        return res.status(503).json({ error: "Podcast discovery not available" });
      }

      const podcastIndexModule = await import("podcast-index-api");
      const PodcastIndexApi = podcastIndexModule.default;
      const podcastIndexApi = PodcastIndexApi(apiKey, apiSecret, "PODDNA/1.0");

      // Get podcast info first
      const podcastResult = await podcastIndexApi.podcastsByFeedId(feedId);
      const feed = podcastResult.feed;
      
      if (!feed) {
        return res.status(404).json({ error: "Podcast not found" });
      }

      // Check if podcast is already in PodDNA
      const localPodcasts = await storage.getAllPodcasts();
      const existingPodcast = localPodcasts.find(p => 
        p.podcastIndexFeedId === feedId ||
        (p.feedUrl && feed.url && p.feedUrl.toLowerCase() === feed.url.toLowerCase())
      );

      // Get episodes from Podcast Index
      const results = await podcastIndexApi.episodesByFeedId(feedId, null, max, true);

      // If podcast exists in PodDNA, check which episodes exist
      let existingEpisodeUrls = new Set<string>();
      let existingEpisodeTitles = new Set<string>();
      if (existingPodcast) {
        const localEpisodes = await storage.getEpisodesByPodcast(existingPodcast.id);
        existingEpisodeUrls = new Set(localEpisodes.filter(e => e.mediaUrl).map(e => e.mediaUrl!.toLowerCase()));
        existingEpisodeTitles = new Set(localEpisodes.map(e => e.title.toLowerCase()));
      }

      const episodes = (results.items || []).map((ep: any) => {
        const mediaUrl = ep.enclosureUrl || "";
        const inPodDNA = existingEpisodeUrls.has(mediaUrl.toLowerCase()) ||
                        existingEpisodeTitles.has((ep.title || "").toLowerCase());

        // Extract video sources from alternateEnclosures
        const videoUrl = (ep.alternateEnclosures || []).find((enc: any) => 
          enc.type?.startsWith("video/") || 
          enc.source?.toLowerCase().includes("youtube")
        )?.url;

        return {
          podcastIndexId: ep.id,
          guid: ep.guid,
          title: ep.title,
          description: ep.description,
          publishedAt: ep.datePublished ? new Date(ep.datePublished * 1000).toISOString() : null,
          duration: ep.duration || 0,
          audioUrl: mediaUrl,
          videoUrl,
          artworkUrl: ep.image || ep.feedImage,
          transcriptUrl: (ep.transcripts || [])[0]?.url || null,
          transcriptType: (ep.transcripts || [])[0]?.type || null,
          chaptersUrl: ep.chaptersUrl || null,
          inPodDNA,
        };
      });

      res.json({
        podcast: {
          podcastIndexFeedId: feedId,
          title: feed.title,
          author: feed.author,
          description: feed.description,
          artworkUrl: feed.artwork || feed.image,
          feedUrl: feed.url,
          inPodDNA: !!existingPodcast,
          podcastId: existingPodcast?.id || null,
        },
        count: episodes.length,
        episodes,
      });
    } catch (error) {
      console.error("[DISCOVER] Episodes fetch error:", error);
      res.status(500).json({ error: "Failed to fetch episodes" });
    }
  });

  app.patch("/api/podcasts/:id/featured/landing", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { featured } = req.body;
      const userId = req.user?.claims?.sub;

      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ error: "Only admins can feature podcasts" });
      }

      if (typeof featured !== "boolean") {
        return res.status(400).json({ error: "Featured must be a boolean" });
      }

      const podcast = await storage.setPodcastFeaturedLanding(id, featured);
      if (!podcast) {
        return res.status(404).json({ error: "Podcast not found" });
      }

      res.json(podcast);
    } catch (error) {
      console.error("[ERROR] Setting landing featured status:", error);
      res.status(500).json({ error: "Failed to update podcast" });
    }
  });

  app.patch("/api/podcasts/:id/featured/explore", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { featured } = req.body;
      const userId = req.user?.claims?.sub;

      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ error: "Only admins can feature podcasts" });
      }

      if (typeof featured !== "boolean") {
        return res.status(400).json({ error: "Featured must be a boolean" });
      }

      const podcast = await storage.setPodcastFeaturedExplore(id, featured);
      if (!podcast) {
        return res.status(404).json({ error: "Podcast not found" });
      }

      res.json(podcast);
    } catch (error) {
      console.error("[ERROR] Setting explore featured status:", error);
      res.status(500).json({ error: "Failed to update podcast" });
    }
  });

  app.get("/api/episodes", async (_req, res) => {
    try {
      const episodes = await storage.getAllEpisodes();
      
      // Add hasTranscript flag for each episode
      const episodesWithTranscriptStatus = await Promise.all(
        episodes.map(async (episode) => {
          const segments = await storage.getSegmentsByEpisode(episode.id);
          return {
            ...episode,
            hasTranscript: segments.length > 0,
          };
        })
      );
      
      res.json(episodesWithTranscriptStatus);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch episodes" });
    }
  });

  // Enriched episodes with counts for explore page
  app.get("/api/episodes/enriched", async (_req, res) => {
    try {
      const episodes = await storage.getAllEpisodes();
      const podcasts = await storage.getAllPodcasts();
      const podcastMap = new Map(podcasts.map(p => [p.id, p]));
      
      const enrichedEpisodes = await Promise.all(
        episodes.map(async (ep) => {
          const podcast = podcastMap.get(ep.podcastId);
          const annotations = await storage.getAnnotationsByEpisode(ep.id);
          const musicDetections = await storage.getMusicDetectionsByEpisode(ep.id);
          const segments = await storage.getSegmentsByEpisode(ep.id);
          
          return {
            ...ep,
            podcastTitle: podcast?.title || "Unknown Podcast",
            podcastArtworkUrl: podcast?.artworkUrl || null,
            annotationCount: annotations.length,
            musicCount: musicDetections.length,
            hasTranscript: segments.length > 0,
          };
        })
      );
      
      res.json(enrichedEpisodes);
    } catch (error) {
      console.error("[ERROR] Failed to fetch enriched episodes:", error);
      res.status(500).json({ error: "Failed to fetch enriched episodes" });
    }
  });

  // Curated episodes catalog for public browsing
  app.get("/api/episodes/catalog", async (_req, res) => {
    try {
      const episodes = await storage.getCuratedEpisodes();
      const podcasts = await storage.getAllPodcasts();
      const podcastMap = new Map(podcasts.map(p => [p.id, p]));
      
      const catalogEpisodes = await Promise.all(
        episodes.map(async (ep) => {
          const podcast = podcastMap.get(ep.podcastId);
          const segments = await storage.getSegmentsByEpisode(ep.id);
          const viralMoments = await storage.getViralMomentsByEpisode(ep.id);
          
          return {
            id: ep.id,
            title: ep.title,
            description: ep.description,
            publishedAt: ep.publishedAt,
            duration: ep.duration,
            artworkUrl: podcast?.artworkUrl || null,
            podcastId: ep.podcastId,
            podcastTitle: podcast?.title || "Unknown Podcast",
            podcastHost: podcast?.host || null,
            transcriptStatus: ep.transcriptStatus,
            hasTranscript: segments.length > 0,
            processingStatus: ep.processingStatus || "new",
            lastError: ep.lastError,
            viralMomentCount: viralMoments.length,
          };
        })
      );
      
      res.json(catalogEpisodes);
    } catch (error) {
      console.error("[ERROR] Failed to fetch catalog episodes:", error);
      res.status(500).json({ error: "Failed to fetch catalog episodes" });
    }
  });

  // T-7: Most annotated episodes for discovery (optimized with SQL aggregation)
  app.get("/api/episodes/most-annotated", async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize as string) || 20));
      
      const result = await storage.getMostAnnotatedEpisodes({ page, pageSize });
      
      res.json({
        episodes: result.episodes,
        pagination: {
          page,
          pageSize,
          totalCount: result.totalCount,
          totalPages: Math.ceil(result.totalCount / pageSize),
        },
      });
    } catch (error) {
      console.error("[ERROR] Failed to fetch most annotated episodes:", error);
      res.status(500).json({ error: "Failed to fetch most annotated episodes" });
    }
  });

  app.get("/api/podcasts/:id/episodes", async (req, res) => {
    try {
      const episodes = await storage.getEpisodesByPodcast(req.params.id);
      res.json(episodes);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch episodes" });
    }
  });

  app.get("/api/podcasts/:id/patterns", async (req, res) => {
    try {
      const podcastId = req.params.id;
      const podcast = await storage.getPodcast(podcastId);
      if (!podcast) {
        return res.status(404).json({ error: "Podcast not found" });
      }

      const { db: dbInstance } = await import("./db");
      const { sql: sqlTag } = await import("drizzle-orm");

      const patternRows = await dbInstance.execute(sqlTag`
        WITH recurrence_pairs AS (
          SELECT
            sr.id AS relation_id,
            sr.confidence,
            sr.statement_a_id,
            sr.statement_b_id,
            sa.text AS text_a,
            sb.text AS text_b,
            sa.episode_id AS episode_a_id,
            sb.episode_id AS episode_b_id,
            ea.title AS episode_a_title,
            eb.title AS episode_b_title,
            ea.published_at AS episode_a_date,
            eb.published_at AS episode_b_date,
            sa.start_time AS start_time_a,
            sb.start_time AS start_time_b
          FROM statement_relations sr
          INNER JOIN statements sa ON sa.id = sr.statement_a_id
          INNER JOIN statements sb ON sb.id = sr.statement_b_id
          INNER JOIN episodes ea ON ea.id = sa.episode_id
          INNER JOIN episodes eb ON eb.id = sb.episode_id
          WHERE sr.scope = 'cross_episode'
            AND sr.relation = 'recurrence'
            AND ea.podcast_id = ${podcastId}
        )
        SELECT
          statement_a_id,
          text_a AS representative_text,
          json_agg(json_build_object(
            'relationId', relation_id,
            'confidence', confidence,
            'matchText', text_b,
            'episodeId', episode_b_id,
            'episodeTitle', episode_b_title,
            'publishedAt', episode_b_date,
            'startTime', start_time_b
          ) ORDER BY episode_b_date DESC) AS occurrences,
          count(*) AS occurrence_count,
          count(DISTINCT episode_b_id) AS episode_count,
          min(LEAST(episode_a_date, episode_b_date)) AS first_seen,
          max(GREATEST(episode_a_date, episode_b_date)) AS last_seen,
          avg(confidence) AS avg_confidence
        FROM recurrence_pairs
        GROUP BY statement_a_id, text_a
        HAVING count(*) >= 2
        ORDER BY count(*) DESC, avg(confidence) DESC
        LIMIT 50
      `);

      const patterns = (patternRows.rows as any[]).map(row => {
        const firstSeen = row.first_seen ? new Date(row.first_seen) : null;
        const lastSeen = row.last_seen ? new Date(row.last_seen) : null;
        const daySpan = firstSeen && lastSeen
          ? Math.round((lastSeen.getTime() - firstSeen.getTime()) / (1000 * 60 * 60 * 24))
          : null;

        let frequencyLabel = "";
        if (daySpan !== null && daySpan <= 14) {
          frequencyLabel = `${row.occurrence_count}x in ${daySpan || 1} days`;
        } else if (daySpan !== null && daySpan <= 60) {
          const weeks = Math.round(daySpan / 7);
          frequencyLabel = `${row.occurrence_count}x in ${weeks} week${weeks !== 1 ? "s" : ""}`;
        } else if (daySpan !== null) {
          const months = Math.round(daySpan / 30);
          frequencyLabel = `${row.occurrence_count}x over ${months} month${months !== 1 ? "s" : ""}`;
        }

        return {
          statementId: row.statement_a_id,
          representativeText: row.representative_text,
          occurrenceCount: Number(row.occurrence_count),
          episodeCount: Number(row.episode_count),
          firstSeen: row.first_seen,
          lastSeen: row.last_seen,
          avgConfidence: Number(row.avg_confidence),
          frequencyLabel,
          occurrences: row.occurrences,
        };
      });

      res.json({
        podcastId,
        podcastName: podcast.title || podcast.name,
        patterns,
        meta: {
          totalPatterns: patterns.length,
        },
      });
    } catch (error) {
      console.error("[PATTERNS] Error:", error);
      res.status(500).json({ error: "Failed to fetch patterns" });
    }
  });

  app.get("/api/episodes/:id", async (req, res) => {
    try {
      const episode = await storage.getEpisode(req.params.id);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }
      
      // Add hasTranscript flag and sources
      const [segments, sources] = await Promise.all([
        storage.getSegmentsByEpisode(episode.id),
        storage.getEpisodeSourcesByEpisode(episode.id),
      ]);

      // Find canonical source for easy access
      const canonicalSource = sources.find(s => s.isCanonical);
      
      res.json({
        ...episode,
        hasTranscript: segments.length > 0,
        sources,
        canonicalSourceId: canonicalSource?.id || null,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch episode" });
    }
  });

  // Get episode summary (canonical EpisodeSummary for cards and intro sections)
  app.get("/api/episodes/:id/summary", async (req, res) => {
    try {
      const episode = await storage.getEpisode(req.params.id);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }

      // Return the episodeSummary directly if it exists
      if (episode.episodeSummary) {
        return res.json({
          episodeId: episode.id,
          title: episode.title,
          summary: episode.episodeSummary,
        });
      }

      // No summary available yet
      return res.json({
        episodeId: episode.id,
        title: episode.title,
        summary: null,
        message: "Episode summary not yet generated",
      });
    } catch (error) {
      console.error("[EPISODE-SUMMARY] Error fetching episode summary:", error);
      res.status(500).json({ error: "Failed to fetch episode summary" });
    }
  });

  app.get("/api/episodes/:id/status", async (req, res) => {
    try {
      const episodeId = req.params.id;
      const episode = await storage.getEpisode(episodeId);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }

      const [segments, sources, musicDetections] = await Promise.all([
        storage.getSegmentsByEpisode(episodeId),
        storage.getEpisodeSourcesByEpisode(episodeId),
        storage.getMusicDetectionsByEpisode(episodeId),
      ]);

      const allJobs = (await Promise.all(
        sources.map(s => storage.getJobsByEpisodeSource(s.id))
      )).flat();

      const transcriptJobs = allJobs.filter(j => 
        j.type === "transcribe" || j.type === "youtube_transcript" || j.type === "transcribe_assembly"
      );
      const musicJobs = allJobs.filter(j => j.type === "detect_music");

      const deriveStatus = (
        hasData: boolean,
        episodeStatus: string,
        relevantJobs: typeof allJobs
      ): "none" | "pending" | "processing" | "ready" | "failed" => {
        if (hasData) return "ready";
        
        const pendingJob = relevantJobs.find(j => j.status === "pending");
        const runningJob = relevantJobs.find(j => j.status === "running");
        const failedJob = relevantJobs.find(j => j.status === "error");
        
        if (runningJob) return "processing";
        if (pendingJob) return "pending";
        if (failedJob && !hasData) return "failed";
        if (episodeStatus === "error") return "failed";
        
        return "none";
      };

      const transcriptStatus = deriveStatus(
        segments.length > 0,
        episode.transcriptStatus,
        transcriptJobs
      );

      const musicStatus = deriveStatus(
        musicDetections.length > 0,
        "none",
        musicJobs
      );

      res.json({
        transcriptStatus,
        musicStatus,
        hasTranscript: segments.length > 0,
        hasMusic: musicDetections.length > 0,
        segmentCount: segments.length,
        musicCount: musicDetections.length,
        processingStatus: episode.processingStatus || "new",
        lastError: episode.lastError,
      });
    } catch (error) {
      console.error("[EPISODE_STATUS] Error:", error);
      res.status(500).json({ error: "Failed to fetch episode status" });
    }
  });

  app.post("/api/episodes", async (req, res) => {
    try {
      const payload = {
        ...req.body,
        publishedAt: new Date(req.body.publishedAt),
      };
      const validated = insertEpisodeSchema.parse(payload);
      const episode = await storage.createEpisode(validated);
      
      // Trigger YouTube auto-discovery in background (non-blocking)
      (async () => {
        try {
          // Check if already has video source
          const existingSources = await storage.getEpisodeSourcesByEpisode(episode.id);
          const hasVideo = existingSources.some(s => s.kind === 'video');
          if (hasVideo) {
            console.log(`[YOUTUBE_SEARCH] Episode ${episode.id} already has video source, skipping`);
            return;
          }
          
          // Get podcast for search query
          const podcast = await storage.getPodcast(episode.podcastId);
          if (!podcast) return;
          
          const searchQuery = `${podcast.title} ${episode.title}`;
          console.log(`[YOUTUBE_SEARCH] Auto-searching for: "${searchQuery}"`);
          
          const { Innertube } = await import('youtubei.js');
          const youtube = await Innertube.create();
          const searchResults = await youtube.search(searchQuery, { type: 'video' });
          
          if (!searchResults.results || searchResults.results.length === 0) {
            console.log(`[YOUTUBE_SEARCH] No results found for: "${searchQuery}"`);
            return;
          }
          
          // Get first video result
          const firstVideo = searchResults.results.find((r: any) => r.type === 'Video') as any;
          if (!firstVideo || !firstVideo.id) {
            console.log(`[YOUTUBE_SEARCH] No video results found`);
            return;
          }
          
          const videoId = firstVideo.id;
          const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
          
          console.log(`[YOUTUBE_SEARCH] Found video: ${videoId} - ${firstVideo.title?.text || 'Unknown'}`);
          
          // Create video source
          const source = await storage.createEpisodeSource({
            episodeId: episode.id,
            kind: 'video',
            platform: 'youtube',
            url: videoUrl,
            youtubeVideoId: videoId,
          });
          
          console.log(`[YOUTUBE_SEARCH] Created video source: ${source.id}`);
          
          // Queue youtube_transcript job
          await storage.createJob({
            type: 'youtube_transcript',
            episodeSourceId: source.id,
            status: 'pending',
            attempts: 0,
          });
          
          console.log(`[YOUTUBE_SEARCH] Queued youtube_transcript job for source ${source.id}`);
        } catch (err) {
          console.error(`[YOUTUBE_SEARCH] Background error:`, err);
        }
      })();
      
      res.status(201).json(episode);
    } catch (error) {
      console.error("[ERROR] Episode creation failed:", error);
      res.status(400).json({ error: "Invalid episode data" });
    }
  });

  app.patch("/api/episodes/:id", isAuthenticated, async (req, res) => {
    try {
      const payload = {
        ...req.body,
        publishedAt: req.body.publishedAt ? new Date(req.body.publishedAt) : undefined,
      };
      const episode = await storage.updateEpisode(req.params.id, payload);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }
      res.json(episode);
    } catch (error) {
      res.status(400).json({ error: "Failed to update episode" });
    }
  });

  app.delete("/api/episodes/:id", isAuthenticated, async (req, res) => {
    try {
      const deleted = await storage.deleteEpisode(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Episode not found" });
      }
      res.json({ message: "Episode deleted successfully" });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete episode" });
    }
  });

  // ============ SINGLE-CLICK EPISODE IMPORT ============
  // Idempotent endpoint that creates podcast + episode + sources + queues pipeline
  // Can be called from Explore/Search UI for quick "Add to PodDNA" workflow
  // Admin or Moderator only
  app.post("/api/episodes/import", isAuthenticated, requireAdminOrModerator, async (req, res) => {
    try {
      const { podcast: podcastData, episode: episodeData } = req.body;

      // Validate required fields
      if (!episodeData?.title || !episodeData?.audioUrl) {
        return res.status(400).json({ 
          error: "Episode title and audioUrl are required" 
        });
      }
      if (!podcastData?.title) {
        return res.status(400).json({ 
          error: "Podcast title is required" 
        });
      }

      // 1. Find or create podcast
      let podcast = null;
      
      // Try to find existing podcast by Podcast Index Feed ID first
      if (podcastData.podcastIndexFeedId) {
        const podcasts = await storage.getAllPodcasts();
        podcast = podcasts.find(p => 
          p.podcastIndexFeedId === podcastData.podcastIndexFeedId
        );
      }
      
      // If not found, try by feed URL
      if (!podcast && podcastData.feedUrl) {
        const podcasts = await storage.getAllPodcasts();
        podcast = podcasts.find(p => 
          p.feedUrl && p.feedUrl.toLowerCase() === podcastData.feedUrl.toLowerCase()
        );
      }
      
      // If still not found, try by title (loose match)
      if (!podcast) {
        const podcasts = await storage.getAllPodcasts();
        podcast = podcasts.find(p => 
          p.title.toLowerCase() === podcastData.title.toLowerCase()
        );
      }
      
      // If no existing podcast, create one
      const isNewPodcast = !podcast;
      if (!podcast) {
        podcast = await storage.createPodcast({
          title: podcastData.title,
          description: podcastData.description || null,
          artworkUrl: podcastData.artworkUrl || null,
          feedUrl: podcastData.feedUrl || null,
          host: podcastData.host || null,
          podcastIndexFeedId: podcastData.podcastIndexFeedId || null,
        });
        console.log(`[EPISODE_IMPORT] Created new podcast: ${podcast.title} (${podcast.id})`);
      }

      // 2. Check for duplicate episode by audio URL
      const existingEpisodes = await storage.getEpisodesByPodcast(podcast.id);
      let existingEpisode = existingEpisodes.find(ep => 
        ep.mediaUrl && ep.mediaUrl.toLowerCase() === episodeData.audioUrl.toLowerCase()
      );
      
      // Also check by title as fallback
      if (!existingEpisode) {
        existingEpisode = existingEpisodes.find(ep => 
          ep.title.toLowerCase() === episodeData.title.toLowerCase()
        );
      }

      // If episode already exists, return it with status info
      if (existingEpisode) {
        console.log(`[EPISODE_IMPORT] Episode already exists: ${existingEpisode.title} (${existingEpisode.id})`);
        return res.json({
          success: true,
          isNew: false,
          episode: existingEpisode,
          podcast,
          message: "Episode already exists in PodDNA"
        });
      }

      // 3. Create the episode
      const episode = await storage.createEpisode({
        podcastId: podcast.id,
        title: episodeData.title,
        description: episodeData.description || null,
        type: episodeData.videoUrl ? "video" : "audio",
        mediaUrl: episodeData.audioUrl,
        duration: episodeData.duration || 0,
        publishedAt: episodeData.publishedAt ? new Date(episodeData.publishedAt) : new Date(),
        transcriptUrl: episodeData.transcriptUrl || null,
        transcriptType: episodeData.transcriptType || null,
        chaptersUrl: episodeData.chaptersUrl || null,
        processingStatus: "importing",
      });
      console.log(`[EPISODE_IMPORT] Created new episode: ${episode.title} (${episode.id})`);

      // 4. Create audio source (canonical) from the audio URL
      try {
        await storage.createEpisodeSource({
          episodeId: episode.id,
          kind: "audio",
          platform: "podcast",
          sourceUrl: episodeData.audioUrl,
          isCanonical: true,
          alignmentOffsetSeconds: 0,
        });
        console.log(`[EPISODE_IMPORT] Created audio source for episode: ${episode.title}`);
      } catch (srcError) {
        console.error(`[EPISODE_IMPORT] Failed to create audio source:`, srcError);
      }

      // 5. Create video source if provided
      if (episodeData.videoUrl) {
        try {
          const videoId = getYouTubeVideoId(episodeData.videoUrl);
          const platform = videoId ? "youtube" : "video";
          
          await storage.createEpisodeSource({
            episodeId: episode.id,
            kind: "video",
            platform,
            sourceUrl: episodeData.videoUrl,
            isCanonical: false,
            alignmentOffsetSeconds: 0,
          });
          console.log(`[EPISODE_IMPORT] Created ${platform} video source for episode: ${episode.title}`);
        } catch (srcError) {
          console.error(`[EPISODE_IMPORT] Failed to create video source:`, srcError);
        }
      }

      // 6. Enqueue the processing pipeline
      const pipelineResult = await enqueueEpisodePipelineJob(episode.id);
      if (pipelineResult.queued) {
        console.log(`[EPISODE_IMPORT] Enqueued pipeline job for: ${episode.title}`);
      } else {
        console.log(`[EPISODE_IMPORT] No source found for pipeline, episode: ${episode.title}`);
      }

      res.status(201).json({
        success: true,
        isNew: true,
        isNewPodcast,
        episode,
        podcast,
        pipelineQueued: pipelineResult.queued,
        message: "Episode added to PodDNA and queued for processing"
      });
    } catch (error) {
      console.error("[EPISODE_IMPORT] Import error:", error);
      res.status(500).json({ error: "Failed to import episode" });
    }
  });

  // Helper function to extract YouTube video ID
  function getYouTubeVideoId(url: string): string | null {
    if (!url) return null;
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([^&\s?]+)/,
      /^([a-zA-Z0-9_-]{11})$/
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) return match[1];
    }
    return null;
  }

  app.get("/api/episodes/:id/segments", async (req, res) => {
    try {
      const segments = await storage.getSegmentsByEpisode(req.params.id);
      res.json(segments);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch segments" });
    }
  });

  // ============ EPISODE CHAPTERS (curated navigation chapters, V1 spec) ============
  // Get chapters for an episode (AI-generated topic navigation)
  app.get("/api/episodes/:id/chapters", async (req, res) => {
    try {
      const chapters = await storage.getEpisodeChaptersByEpisode(req.params.id);
      res.json({ chapters });
    } catch (error) {
      console.error("Failed to fetch episode chapters:", error);
      res.status(500).json({ error: "Failed to fetch chapters" });
    }
  });

  // ============ EPISODE HIGHLIGHTS (shareable key moments) ============
  // Get highlights for an episode (AI-generated quotable moments)
  app.get("/api/episodes/:id/highlights", async (req, res) => {
    try {
      const highlights = await storage.getEpisodeHighlightsByEpisode(req.params.id);
      res.json(highlights);
    } catch (error) {
      console.error("Failed to fetch episode highlights:", error);
      res.status(500).json({ error: "Failed to fetch highlights" });
    }
  });

  // ============ VIRAL MOMENTS (TikTok/Reels-worthy clips) ============
  // Get viral moments for an episode (AI-detected high-virality clips)
  app.get("/api/episodes/:id/viral-moments", async (req, res) => {
    try {
      const moments = await storage.getViralMomentsByEpisode(req.params.id);
      res.json(moments);
    } catch (error) {
      console.error("Failed to fetch viral moments:", error);
      res.status(500).json({ error: "Failed to fetch viral moments" });
    }
  });

  // Get top viral moments across all episodes
  app.get("/api/viral-moments/top", async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
      const moments = await storage.getTopViralMoments(limit);
      res.json({ moments });
    } catch (error) {
      console.error("Failed to fetch top viral moments:", error);
      res.status(500).json({ error: "Failed to fetch top viral moments" });
    }
  });

  // Get a specific viral moment
  app.get("/api/viral-moments/:id", async (req, res) => {
    try {
      const moment = await storage.getViralMoment(req.params.id);
      if (!moment) {
        return res.status(404).json({ error: "Viral moment not found" });
      }
      res.json(moment);
    } catch (error) {
      console.error("Failed to fetch viral moment:", error);
      res.status(500).json({ error: "Failed to fetch viral moment" });
    }
  });

  // Extract clip for a viral moment (admin only)
  app.post("/api/viral-moments/:id/extract-clip", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;

      const moment = await storage.getViralMoment(id);
      if (!moment) {
        return res.status(404).json({ error: "Viral moment not found" });
      }

      // Get episode and find YouTube source
      const episode = await storage.getEpisode(moment.episodeId);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }

      const sources = await storage.getEpisodeSourcesByEpisode(moment.episodeId);
      const youtubeSource = sources.find((s: any) => 
        s.platform === "youtube" && s.sourceUrl
      );

      if (!youtubeSource?.sourceUrl) {
        return res.status(400).json({ error: "No YouTube source available for this episode" });
      }

      // Import clip extractor
      const { extractYouTubeClip } = await import("./services/clip-extractor");

      // Update status to extracting
      await storage.updateViralMomentClipStatus(id, "extracting");

      try {
        const result = await extractYouTubeClip(
          youtubeSource.sourceUrl,
          moment.startTime,
          moment.endTime
        );

        await storage.updateViralMomentClipStatus(id, "ready", result.clipPath, null);

        res.json({
          success: true,
          clipPath: result.clipPath,
          duration: result.duration,
          fileSize: result.fileSize,
        });
      } catch (extractError: any) {
        await storage.updateViralMomentClipStatus(id, "failed", null, extractError.message);
        res.status(500).json({ error: `Clip extraction failed: ${extractError.message}` });
      }
    } catch (error) {
      console.error("Failed to extract clip:", error);
      res.status(500).json({ error: "Failed to extract clip" });
    }
  });

  // Burn captions onto a viral moment clip (admin only)
  // Uses real transcript segment timestamps for accurate audio sync
  // Set forceRegenerate: true to regenerate captions
  app.post("/api/viral-moments/:id/burn-captions", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { style, forceRegenerate } = req.body;

      const moment = await storage.getViralMoment(id);
      if (!moment) {
        return res.status(404).json({ error: "Viral moment not found" });
      }

      if (!moment.videoPath) {
        return res.status(400).json({ error: "Clip must be extracted first" });
      }

      if (moment.clipStatus !== "ready") {
        return res.status(400).json({ error: `Clip status is '${moment.clipStatus}', expected 'ready'` });
      }

      // Fetch real transcript segments for accurate timing
      const transcriptSegments = await storage.getTranscriptSegmentsByTimeRange(
        moment.episodeId,
        moment.startTime,
        moment.endTime
      );

      const { addTikTokCaptionsWithSegments, addTikTokCaptions } = await import("./services/caption-generator");

      try {
        let result;
        
        if (transcriptSegments.length > 0) {
          // Use real transcript segments with accurate timing
          console.log(`[CAPTIONS] Using ${transcriptSegments.length} real transcript segments for accurate sync`);
          result = await addTikTokCaptionsWithSegments(
            moment.videoPath,
            transcriptSegments.map(seg => ({
              text: seg.text,
              startTime: seg.startTime,
              endTime: seg.endTime,
            })),
            moment.startTime,
            moment.endTime,
            { ...style, forceRegenerate: forceRegenerate || false }
          );
        } else {
          // Fallback to stored text if no segments found
          console.log(`[CAPTIONS] No transcript segments found, falling back to stored text`);
          result = await addTikTokCaptions(
            moment.videoPath,
            moment.text,
            moment.startTime,
            moment.endTime,
            { ...style, forceRegenerate: forceRegenerate || false }
          );
        }

        await storage.updateViralMomentCaptionedPath(id, result.captionedPath);

        res.json({
          success: true,
          captionedPath: result.captionedPath,
          fileSize: result.fileSize,
          regenerated: forceRegenerate || false,
          segmentsUsed: transcriptSegments.length,
        });
      } catch (captionError: any) {
        res.status(500).json({ error: `Caption burn failed: ${captionError.message}` });
      }
    } catch (error) {
      console.error("Failed to burn captions:", error);
      res.status(500).json({ error: "Failed to burn captions" });
    }
  });

  // Configure multer for video uploads (for manual clip upload workflow)
  const clipUploadDir = "/tmp/clip-uploads";
  const clipUpload = multer({
    dest: clipUploadDir,
    limits: {
      fileSize: 100 * 1024 * 1024, // 100MB max
    },
    fileFilter: (req, file, cb) => {
      const allowedTypes = ["video/mp4", "video/quicktime", "video/x-msvideo", "video/webm", "application/octet-stream"];
      const allowedExtensions = [".mp4", ".mov", ".avi", ".webm"];
      const ext = path.extname(file.originalname).toLowerCase();
      if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
        cb(null, true);
      } else {
        cb(new Error("Only video files are allowed (mp4, mov, avi, webm)"));
      }
    },
  });

  // Upload a clip for a viral moment (hybrid workflow - manual download + server processing)
  // Supports both session auth (browser) and API key auth (local scripts via X-Admin-API-Key header)
  app.post("/api/admin/viral-moments/:id/upload-clip", requireAdminSessionOrKey, clipUpload.single("file"), async (req, res) => {
    try {
      const { id } = req.params;
      
      if (!req.file) {
        return res.status(400).json({ error: "No video file uploaded" });
      }

      const moment = await storage.getViralMoment(id);
      if (!moment) {
        // Clean up uploaded file
        await fs.unlink(req.file.path).catch(() => {});
        return res.status(404).json({ error: "Viral moment not found" });
      }

      console.log(`[CLIP-UPLOAD] Processing uploaded clip for moment ${id}`);
      console.log(`[CLIP-UPLOAD] File: ${req.file.originalname} (${(req.file.size / 1024 / 1024).toFixed(2)} MB)`);

      // Create final destination path
      const clipsDir = "/tmp/clips";
      await fs.mkdir(clipsDir, { recursive: true });
      
      // Preserve the original file extension for compatibility
      const originalExt = path.extname(req.file.originalname).toLowerCase() || ".mp4";
      const tempPath = path.join(clipsDir, `${id}_uploaded_temp${originalExt}`);
      const finalPath = path.join(clipsDir, `${id}_uploaded.mp4`);
      
      // Delete any existing files at finalPath and tempPath to allow retries/overwrites
      await fs.unlink(finalPath).catch(() => {});
      await fs.unlink(tempPath).catch(() => {});
      
      // Move uploaded file from multer temp to our temp location first
      await fs.rename(req.file.path, tempPath);
      console.log(`[CLIP-UPLOAD] Moved uploaded file to ${tempPath}`);
      
      // If not already mp4, transcode to mp4 for compatibility with caption pipeline
      if (originalExt !== ".mp4") {
        console.log(`[CLIP-UPLOAD] Transcoding ${originalExt} to mp4...`);
        const { exec } = await import("child_process");
        const { promisify } = await import("util");
        const execAsync = promisify(exec);
        
        try {
          await execAsync(`ffmpeg -i "${tempPath}" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k "${finalPath}" -y`, {
            timeout: 300000,
          });
          console.log(`[CLIP-UPLOAD] Transcode successful`);
          // Remove temp file only after successful transcoding
          await fs.unlink(tempPath).catch(() => {});
        } catch (transcodeError: any) {
          console.error(`[CLIP-UPLOAD] Transcode failed: ${transcodeError.message}`);
          // Keep temp file for debugging, mark moment as failed
          await storage.updateViralMomentClipStatus(id, "failed", null, `Transcode failed: ${transcodeError.message}`);
          return res.status(500).json({ 
            error: `Transcode failed. Please upload an MP4 file instead.`,
            details: transcodeError.message
          });
        }
      } else {
        // Already mp4, move temp to final destination
        try {
          await fs.rename(tempPath, finalPath);
          console.log(`[CLIP-UPLOAD] Moved MP4 to final location: ${finalPath}`);
        } catch (renameError: any) {
          console.error(`[CLIP-UPLOAD] Rename failed: ${renameError.message}`);
          await storage.updateViralMomentClipStatus(id, "failed", null, `File move failed: ${renameError.message}`);
          return res.status(500).json({ error: "Failed to process uploaded file" });
        }
      }
      
      // Verify the final file exists and has content
      let fileSize: number;
      try {
        const stats = await fs.stat(finalPath);
        fileSize = stats.size;
        if (stats.size < 1000) {
          throw new Error("File too small, likely corrupted");
        }
        console.log(`[CLIP-UPLOAD] Final file verified: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
      } catch (statError: any) {
        console.error(`[CLIP-UPLOAD] Final file verification failed: ${statError.message}`);
        await storage.updateViralMomentClipStatus(id, "failed", null, "File verification failed");
        return res.status(500).json({ error: "Upload verification failed. Please try again." });
      }

      // Upload to Object Storage for persistence
      let objectStoragePath: string | null = null;
      try {
        const objectStorageService = new ObjectStorageService();
        const privateDir = objectStorageService.getPrivateObjectDir();
        const objectPath = `${privateDir}/clips/${id}.mp4`;
        
        // Parse the bucket and object name from the path
        const pathParts = objectPath.split("/").filter(p => p);
        const bucketName = pathParts[0];
        const objectName = pathParts.slice(1).join("/");
        
        const bucket = objectStorageClient.bucket(bucketName);
        const file = bucket.file(objectName);
        
        // Upload the file to Object Storage
        const fileBuffer = await fs.readFile(finalPath);
        await file.save(fileBuffer, {
          contentType: "video/mp4",
          metadata: {
            originalName: req.file!.originalname,
            momentId: id,
            uploadedAt: new Date().toISOString(),
          },
        });
        
        objectStoragePath = objectPath;
        console.log(`[CLIP-UPLOAD] Uploaded to Object Storage: ${objectStoragePath}`);
        
        // Clean up local temp file
        await fs.unlink(finalPath).catch(() => {});
      } catch (objectStorageError: any) {
        console.error(`[CLIP-UPLOAD] Object Storage upload failed, keeping local file: ${objectStorageError.message}`);
        // Fall back to local path if Object Storage fails
        objectStoragePath = finalPath;
      }

      // Update viral moment with the clip path
      const updated = await storage.updateViralMomentClipStatus(id, "ready", objectStoragePath, null);
      if (!updated) {
        console.error(`[CLIP-UPLOAD] Failed to update viral moment status`);
        return res.status(500).json({ error: "Failed to update clip status" });
      }

      console.log(`[CLIP-UPLOAD] Clip saved to ${objectStoragePath}`);

      res.json({
        success: true,
        message: "Clip uploaded successfully",
        videoPath: objectStoragePath,
        fileSize: fileSize,
        nextStep: "You can now burn captions onto this clip using the caption endpoint",
      });

    } catch (error: any) {
      console.error("[CLIP-UPLOAD] Failed to upload clip:", error);
      // Clean up uploaded file on error
      if (req.file) {
        await fs.unlink(req.file.path).catch(() => {});
      }
      res.status(500).json({ error: `Upload failed: ${error.message}` });
    }
  });

  // Reset a clip for a viral moment (for mistimed clips that need re-upload)
  app.post("/api/admin/viral-moments/:id/reset-clip", requireAdminSessionOrKey, async (req, res) => {
    try {
      const { id } = req.params;
      
      const moment = await storage.getViralMoment(id);
      if (!moment) {
        return res.status(404).json({ error: "Viral moment not found" });
      }

      // Delete existing clip from Object Storage if it exists
      if (moment.videoPath && moment.videoPath.includes("replit-objstore")) {
        try {
          const objectStorageService = new ObjectStorageService();
          const pathParts = moment.videoPath.split("/").filter(p => p);
          const bucketName = pathParts[0];
          const objectName = pathParts.slice(1).join("/");
          
          const bucket = objectStorageClient.bucket(bucketName);
          await bucket.file(objectName).delete().catch(() => {});
          console.log(`[CLIP-RESET] Deleted clip from Object Storage: ${moment.videoPath}`);
        } catch (deleteError) {
          console.error(`[CLIP-RESET] Error deleting from Object Storage:`, deleteError);
        }
      }

      // Reset the viral moment clip status
      await storage.updateViralMomentClipStatus(id, "pending", null, null);
      
      console.log(`[CLIP-RESET] Reset clip status for moment ${id}`);

      res.json({
        success: true,
        message: "Clip reset successfully. You can now re-upload.",
        momentId: id,
      });

    } catch (error: any) {
      console.error("[CLIP-RESET] Failed to reset clip:", error);
      res.status(500).json({ error: `Reset failed: ${error.message}` });
    }
  });

  // Delete a viral moment entirely
  app.delete("/api/admin/viral-moments/:id", requireAdminSessionOrKey, async (req, res) => {
    try {
      const { id } = req.params;
      
      const moment = await storage.getViralMoment(id);
      if (!moment) {
        return res.status(404).json({ error: "Viral moment not found" });
      }

      // Delete clip from Object Storage if it exists
      if (moment.videoPath && moment.videoPath.includes("replit-objstore")) {
        try {
          const objectStorageService = new ObjectStorageService();
          const pathParts = moment.videoPath.split("/").filter(p => p);
          const bucketName = pathParts[0];
          const objectName = pathParts.slice(1).join("/");
          
          const bucket = objectStorageClient.bucket(bucketName);
          await bucket.file(objectName).delete().catch(() => {});
          console.log(`[CLIP-DELETE] Deleted clip from Object Storage: ${moment.videoPath}`);
        } catch (deleteError) {
          console.error(`[CLIP-DELETE] Error deleting from Object Storage:`, deleteError);
        }
      }

      // Delete the viral moment from the database
      await storage.deleteViralMoment(id);
      
      console.log(`[CLIP-DELETE] Deleted viral moment ${id}`);

      res.json({
        success: true,
        message: "Viral moment deleted successfully",
        momentId: id,
      });

    } catch (error: any) {
      console.error("[CLIP-DELETE] Failed to delete viral moment:", error);
      res.status(500).json({ error: `Delete failed: ${error.message}` });
    }
  });

  // ============ EPISODE SEGMENTS (AI-generated topic/chapter markers) ============
  // Get AI-generated segments for an episode
  app.get("/api/episodes/:id/episode-segments", async (req, res) => {
    try {
      const segments = await storage.getEpisodeSegmentsByEpisode(req.params.id);
      res.json(segments);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch episode segments" });
    }
  });

  // Get "Most Talked About Moments" - top segments by engagement OR AI-generated content
  app.get("/api/episodes/:id/moments", async (req, res) => {
    try {
      const episodeId = req.params.id;
      const limit = Math.min(parseInt(req.query.limit as string) || 5, 10);

      const segments = await storage.getEpisodeSegmentsByEpisode(episodeId);
      if (!segments || segments.length === 0) {
        return res.json([]);
      }

      // Classify into engagement-based vs AI-based
      const engagementBased: { seg: typeof segments[0]; totalComments: number; summary: any }[] = [];
      const aiBased: { seg: typeof segments[0]; totalComments: number; summary: any }[] = [];

      for (const seg of segments) {
        const summary = seg.sentimentSummary as any;
        const totalComments = summary 
          ? (summary.positive || 0) + (summary.negative || 0) + (summary.neutral || 0) + 
            (summary.debate || 0) + (summary.confused || 0) + (summary.funny || 0)
          : 0;

        const hasEngagement = (seg.engagementScore && seg.engagementScore > 0) || totalComments > 0;
        const hasAIContent = (seg.label && seg.label.length >= 4) || (seg.summary && seg.summary.length >= 12);

        if (hasEngagement) {
          engagementBased.push({ seg, totalComments, summary });
        } else if (hasAIContent) {
          aiBased.push({ seg, totalComments: 0, summary: null });
        }
      }

      // Prefer engagement-based, fallback to AI
      let candidates = engagementBased.length > 0 ? engagementBased : aiBased;

      // Sort appropriately
      if (engagementBased.length > 0) {
        candidates.sort((a, b) => (b.seg.engagementScore || 0) - (a.seg.engagementScore || 0));
      } else {
        candidates.sort((a, b) => {
          const aScore = (a.seg.summary?.length || 0) + (a.seg.label?.length || 0);
          const bScore = (b.seg.summary?.length || 0) + (b.seg.label?.length || 0);
          return bScore - aScore;
        });
      }

      // Transform to expected response format
      const moments = candidates.slice(0, limit).map(({ seg, totalComments, summary }) => ({
        segmentId: seg.id,
        startTime: seg.startTime,
        endTime: seg.endTime,
        title: seg.label,
        summary: seg.summary,
        engagementScore: seg.engagementScore || 0,
        sentimentSummary: {
          totalComments,
          positive: summary?.positive || 0,
          negative: summary?.negative || 0,
          neutral: summary?.neutral || 0,
          debate: summary?.debate || 0,
          funny: summary?.funny || 0,
        },
        topComments: summary?.topComments || [],
      }));

      res.json(moments);
    } catch (error) {
      console.error("Error fetching episode moments:", error);
      res.status(500).json({ error: "Failed to fetch episode moments" });
    }
  });

  // Generate AI segments from transcript (admin only)
  app.post("/api/episodes/:id/generate-segments", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const episodeId = req.params.id;

      // Get episode and podcast info for context
      const episode = await storage.getEpisode(episodeId);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }
      
      const podcast = await storage.getPodcast(episode.podcastId);

      // Get transcript segments
      const transcriptSegments = await storage.getSegmentsByEpisode(episodeId);
      if (transcriptSegments.length === 0) {
        return res.status(400).json({ error: "No transcript segments found for this episode" });
      }

      // Import segment generator
      const { generateTopicSegments, groupTranscriptIntoWindows } = await import("./segment-generator");
      
      // Group transcript into time windows
      const windows = groupTranscriptIntoWindows(transcriptSegments, 120);
      
      // Build episode context for better AI labeling
      const episodeContext = {
        title: episode.title,
        showName: podcast?.title || "Unknown Podcast",
        description: episode.description || "",
      };
      
      // Generate AI topic labels with episode context
      const generatedSegments = await generateTopicSegments(windows, episodeContext);
      
      // Delete existing AI segments for this episode
      await storage.deleteEpisodeSegmentsByEpisode(episodeId);
      
      // Save new AI segments
      const savedSegments = [];
      for (let i = 0; i < generatedSegments.length; i++) {
        const seg = generatedSegments[i];
        const saved = await storage.createEpisodeSegment({
          episodeId,
          startTime: seg.startTime,
          endTime: seg.endTime,
          label: seg.label,
          snippetText: seg.snippetText,
          segmentType: seg.segmentType,
          displayOrder: i,
          isAiGenerated: true,
        });
        savedSegments.push(saved);
      }
      
      res.json({ 
        success: true, 
        segmentsGenerated: savedSegments.length,
        segments: savedSegments 
      });
    } catch (error) {
      console.error("[GENERATE-SEGMENTS ERROR]", error);
      res.status(500).json({ error: "Failed to generate segments" });
    }
  });

  // ============ SNIPPETS API (for snippet-first architecture) ============
  // Get snippets for an episode - returns ~250 char excerpts around annotations/segments
  const MAX_SNIPPET_CHARS = 250;
  
  app.get("/api/episodes/:id/snippets", async (req, res) => {
    try {
      const episodeId = req.params.id;
      const episode = await storage.getEpisode(episodeId);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }

      // Get AI-generated episode segments (if they exist)
      const episodeSegments = await storage.getEpisodeSegmentsByEpisode(episodeId);
      
      // Get transcript segments for context
      const transcriptSegments = await storage.getSegmentsByEpisode(episodeId);
      
      // If we have AI segments, use their snippets
      if (episodeSegments.length > 0) {
        const snippets = episodeSegments.map(seg => ({
          id: seg.id,
          startSeconds: seg.startTime,
          endSeconds: seg.endTime,
          label: seg.label,
          snippetText: seg.snippetText || truncateText(seg.summary || "", MAX_SNIPPET_CHARS),
          segmentType: seg.segmentType,
          isAiGenerated: seg.isAiGenerated,
          engagementScore: seg.engagementScore,
          sentimentSummary: seg.sentimentSummary,
          visualTags: seg.visualTags,
          visualCaption: seg.visualCaption,
        }));
        return res.json({ 
          snippets,
          source: "ai_segments",
          hasFullTranscript: transcriptSegments.length > 0
        });
      }
      
      // Fallback: generate snippets from transcript segments (grouped by time windows)
      if (transcriptSegments.length > 0) {
        const snippets = generateSnippetsFromTranscript(transcriptSegments, MAX_SNIPPET_CHARS);
        return res.json({ 
          snippets,
          source: "transcript_derived",
          hasFullTranscript: true
        });
      }
      
      // No content available
      res.json({ 
        snippets: [],
        source: "none",
        hasFullTranscript: false
      });
    } catch (error) {
      console.error("[SNIPPETS ERROR]", error);
      res.status(500).json({ error: "Failed to fetch snippets" });
    }
  });

  // Get a single snippet by timestamp (for annotation context)
  app.get("/api/episodes/:id/snippet-at/:timestamp", async (req, res) => {
    try {
      const episodeId = req.params.id;
      const timestamp = parseInt(req.params.timestamp, 10);
      
      if (isNaN(timestamp)) {
        return res.status(400).json({ error: "Invalid timestamp" });
      }

      const transcriptSegments = await storage.getSegmentsByEpisode(episodeId);
      
      // Find segments around this timestamp (±30 seconds window)
      const windowStart = Math.max(0, timestamp - 30);
      const windowEnd = timestamp + 30;
      
      const relevantSegments = transcriptSegments.filter(
        seg => seg.startTime >= windowStart && seg.startTime <= windowEnd
      );
      
      if (relevantSegments.length === 0) {
        return res.json({ snippet: null });
      }
      
      // Combine text and truncate to MAX_SNIPPET_CHARS
      const combinedText = relevantSegments.map(seg => seg.text).join(" ");
      const snippet = truncateText(combinedText, MAX_SNIPPET_CHARS);
      
      res.json({
        snippet,
        startSeconds: relevantSegments[0].startTime,
        endSeconds: relevantSegments[relevantSegments.length - 1].endTime,
        segmentCount: relevantSegments.length
      });
    } catch (error) {
      console.error("[SNIPPET-AT ERROR]", error);
      res.status(500).json({ error: "Failed to fetch snippet" });
    }
  });

  // ============ PUBLIC EPISODE INSIGHTS (Phase 7) ============
  // Returns aggregated semantic analysis data for public episode pages
  app.get("/api/episodes/:id/insights", async (req, res) => {
    try {
      const episodeId = req.params.id;
      
      // Check feature flag
      const flag = await storage.getFeatureFlag("featurePublicInsights");
      if (!flag || flag.value !== 'true') {
        return res.status(404).json({ error: "Insights feature not enabled" });
      }
      
      // Verify episode exists
      const episode = await storage.getEpisode(episodeId);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }
      
      const insights = await storage.getEpisodeInsights(episodeId);
      res.json(insights);
    } catch (error) {
      console.error("[EPISODE INSIGHTS ERROR]", error);
      res.status(500).json({ error: "Failed to fetch episode insights" });
    }
  });

  // ============ SEMANTIC SEARCH (Phase 8) ============
  // Public semantic search endpoint for finding statements across episodes
  app.get("/api/search", async (req, res) => {
    try {
      const flag = await storage.getFeatureFlag("featureSemanticSearch");
      if (!flag || flag.value !== 'true') {
        return res.status(404).json({ error: "Semantic search feature not enabled" });
      }
      
      const q = req.query.q as string;
      if (!q || q.trim().length === 0) {
        return res.status(400).json({ error: "Query parameter 'q' is required" });
      }
      
      const topics = req.query.topics ? (req.query.topics as string).split(",").filter(Boolean) : undefined;
      const entities = req.query.entities ? (req.query.entities as string).split(",").filter(Boolean) : undefined;
      const claimOnly = req.query.claimOnly === "true";
      const contradictionsOnly = req.query.contradictionsOnly === "true";
      const supportsOnly = req.query.supportsOnly === "true";
      const polarity = req.query.polarity as "supportive" | "skeptical" | "neutral" | undefined;
      const certaintyMin = req.query.certaintyMin ? parseFloat(req.query.certaintyMin as string) : undefined;
      const sentimentMin = req.query.sentimentMin ? parseFloat(req.query.sentimentMin as string) : undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
      
      const { semanticSearch } = await import("./search/semanticSearch");
      
      const results = await semanticSearch({
        query: q,
        filters: {
          topics,
          entities,
          claimOnly: claimOnly || undefined,
          contradictionsOnly: contradictionsOnly || undefined,
          supportsOnly: supportsOnly || undefined,
          polarity: polarity || undefined,
          certaintyMin,
          sentimentMin,
        },
        limit,
      });
      
      res.json({
        results,
        meta: {
          query: q,
          limit,
          filters: {
            topics,
            entities,
            claimOnly,
            contradictionsOnly,
            supportsOnly,
            polarity,
            certaintyMin,
            sentimentMin,
          },
        },
      });
    } catch (error) {
      console.error("[SEMANTIC SEARCH ERROR]", error);
      res.status(500).json({ error: "Failed to perform semantic search" });
    }
  });

  app.post("/api/episodes/:id/transcript", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { transcript } = transcriptUploadSchema.parse(req.body);
      const episodeId = req.params.id;
      
      let segments: any[] = [];
      
      // Try to parse as JSON first
      try {
        const parsed = JSON.parse(transcript);
        if (Array.isArray(parsed)) {
          segments = parsed;
        } else {
          throw new Error("Not an array");
        }
      } catch {
        // Not JSON - treat as plain text and convert to segments
        // Split by paragraphs or double newlines, or sentences
        const lines = transcript
          .split(/\n\n+|\r\n\r\n+/)
          .map(line => line.trim())
          .filter(line => line.length > 0);
        
        // If no paragraph breaks, try splitting by sentences
        const textBlocks = lines.length > 1 ? lines : transcript
          .split(/(?<=[.!?])\s+/)
          .map(s => s.trim())
          .filter(s => s.length > 0);
        
        // Create segments with estimated timing (10 seconds per segment)
        segments = textBlocks.map((text, index) => ({
          startTime: index * 10,
          endTime: (index + 1) * 10,
          text: text,
          speaker: null,
          type: "speech",
        }));
      }
      
      if (segments.length === 0) {
        return res.status(400).json({ error: "No transcript content found" });
      }

      const validatedSegments = z.array(transcriptSegmentSchema).parse(segments);
      await storage.createTranscriptSegments(episodeId, validatedSegments);
      
      res.status(201).json({ 
        message: "Transcript uploaded successfully",
        segmentCount: validatedSegments.length
      });
    } catch (error) {
      console.error("[TRANSCRIPT UPLOAD ERROR]", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid transcript format", details: error.errors });
      }
      res.status(400).json({ error: "Invalid transcript format" });
    }
  });

  app.post("/api/fetch-subrip", async (req, res) => {
    try {
      const { url } = req.body;
      
      if (!url) {
        return res.status(400).json({ error: "URL is required" });
      }

      const response = await fetch(url);
      if (!response.ok) {
        return res.status(400).json({ error: `Failed to fetch transcript: ${response.statusText}` });
      }

      const content = await response.text();
      res.json({ content });
    } catch (error) {
      console.error("[ERROR] Failed to fetch SubRip transcript:", error);
      res.status(500).json({ error: "Failed to fetch transcript from URL" });
    }
  });

  app.post("/api/episodes/:id/transcript/youtube", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const episodeId = req.params.id;
      const { youtubeVideoId } = req.body;

      if (!youtubeVideoId) {
        return res.status(400).json({ error: "youtubeVideoId is required" });
      }

      // Get episode and podcast for known speakers
      const episode = await storage.getEpisode(episodeId);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }
      
      const podcast = await storage.getPodcast(episode.podcastId);
      const knownSpeakers = podcast?.knownSpeakers || [];
      const podcastTitle = podcast?.title;

      console.log(`[TRANSCRIPT] Starting Gemini transcription for YouTube video: ${youtubeVideoId}`);
      if (knownSpeakers.length > 0) {
        console.log(`[TRANSCRIPT] Using known speakers: ${knownSpeakers.join(", ")}`);
      }
      
      const { transcribeYouTubeVideo } = await import("./transcription");
      const result = await transcribeYouTubeVideo(youtubeVideoId, undefined, { knownSpeakers, podcastTitle });
      
      if (!result.success) {
        throw new Error(result.error || "Transcription failed");
      }
      
      console.log(`[TRANSCRIPT] Gemini transcription completed with ${result.segments.length} segments`);
      if (result.segments.length > 0) {
        console.log(`[TRANSCRIPT] First segment:`, JSON.stringify(result.segments[0], null, 2));
        console.log(`[TRANSCRIPT] Last segment:`, JSON.stringify(result.segments[result.segments.length - 1], null, 2));
      }
      
      const validatedSegments = z.array(transcriptSegmentSchema).parse(result.segments);

      await storage.createTranscriptSegments(episodeId, validatedSegments);
      
      // Run entity extraction in the background (don't block response)
      const fullText = validatedSegments.map((s: { text: string }) => s.text).join(" ");
      import("./entity-extraction").then(({ extractAndStoreEntitiesForEpisode }) => {
        extractAndStoreEntitiesForEpisode(episodeId, fullText)
          .then(result => {
            console.log(`[ENTITY EXTRACTION] Completed for episode ${episodeId}: ${result.created} entities created, ${result.linked} mentions linked`);
          })
          .catch(err => {
            console.error(`[ENTITY EXTRACTION] Error for episode ${episodeId}:`, err);
          });
      });
      
      res.status(201).json({ 
        message: "YouTube transcript transcribed with Gemini AI and uploaded successfully",
        segmentCount: validatedSegments.length,
        provider: result.provider
      });
    } catch (error) {
      console.error(`[TRANSCRIPT ERROR]`, error);
      if (error instanceof Error) {
        return res.status(400).json({ error: error.message });
      }
      res.status(400).json({ error: "Failed to transcribe YouTube video" });
    }
  });

  app.get("/api/episodes/:id/transcript/progress", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const episodeId = req.params.id;
    const connectionId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const progressKey = `transcription-${episodeId}`;
    
    let closed = false;
    const sendProgress = (data: any) => {
      if (closed) return;
      res.write(`data: ${JSON.stringify(data)}\n\n`);
      if (data.stage === "complete" || data.stage === "error") {
        closed = true;
        res.end();
      }
    };

    (global as any)[progressKey] = sendProgress;

    req.on("close", () => {
      closed = true;
      delete (global as any)[progressKey];
    });
  });

  // Get all active transcription jobs (for global status indicator)
  app.get("/api/transcription-jobs", (req, res) => {
    const jobs = transcriptionJobManager.getAllJobs();
    res.json(jobs);
  });

  // Get active transcription jobs only
  app.get("/api/transcription-jobs/active", (req, res) => {
    const jobs = transcriptionJobManager.getActiveJobs();
    res.json(jobs);
  });

  // Get specific transcription job status
  app.get("/api/transcription-jobs/:episodeId", (req, res) => {
    const job = transcriptionJobManager.getJob(req.params.episodeId);
    if (!job) {
      return res.status(404).json({ error: "No active job for this episode" });
    }
    res.json(job);
  });

  // Clear completed jobs
  app.delete("/api/transcription-jobs/completed", (req, res) => {
    transcriptionJobManager.clearCompletedJobs();
    res.json({ message: "Cleared completed jobs" });
  });

  // Clear all jobs (completed and running) - must come before :episodeId route
  app.delete("/api/transcription-jobs/all", (req, res) => {
    const jobs = transcriptionJobManager.getAllJobs();
    jobs.forEach(job => transcriptionJobManager.removeJob(job.episodeId));
    console.log(`[TRANSCRIPTION] Cleared all ${jobs.length} jobs`);
    res.json({ message: `Cleared ${jobs.length} jobs` });
  });

  // Cancel/remove a specific job (for stale jobs)
  app.delete("/api/transcription-jobs/:episodeId", (req, res) => {
    const job = transcriptionJobManager.getJob(req.params.episodeId);
    if (!job) {
      return res.status(404).json({ error: "No job found for this episode" });
    }
    transcriptionJobManager.removeJob(req.params.episodeId);
    console.log(`[TRANSCRIPTION] Job cancelled for episode: ${req.params.episodeId}`);
    res.json({ message: "Job cancelled", episodeId: req.params.episodeId });
  });

  // SSE endpoint for real-time job updates across all active jobs
  app.get("/api/transcription-jobs/stream", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    // Send initial state
    const jobs = transcriptionJobManager.getAllJobs();
    res.write(`data: ${JSON.stringify({ type: "initial", jobs })}\n\n`);

    // Set up polling interval since we're tracking multiple jobs
    const intervalId = setInterval(() => {
      const currentJobs = transcriptionJobManager.getAllJobs();
      res.write(`data: ${JSON.stringify({ type: "update", jobs: currentJobs })}\n\n`);
    }, 1000);

    req.on("close", () => {
      clearInterval(intervalId);
    });
  });

  app.post("/api/episodes/:id/transcript/custom-url", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const episodeId = req.params.id;
      const { audioUrl, speakersExpected } = req.body;
      
      if (!audioUrl) {
        return res.status(400).json({ error: "audioUrl is required" });
      }
      
      const episode = await storage.getEpisode(episodeId);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }

      // Get podcast title and known speakers for the job
      const podcast = episode.podcastId ? await storage.getPodcast(episode.podcastId) : null;
      const podcastTitle = podcast?.title || "Unknown Podcast";
      const knownSpeakers = podcast?.knownSpeakers || [];

      console.log(`[TRANSCRIPT] Starting AssemblyAI transcription from custom URL for episode: ${episode.title}`);
      console.log(`[TRANSCRIPT] URL: ${audioUrl.substring(0, 100)}...`);
      if (knownSpeakers.length > 0) {
        console.log(`[TRANSCRIPT] Using known speakers: ${knownSpeakers.join(", ")}`);
      }
      
      // Create job in the job manager for global tracking
      transcriptionJobManager.createJob(episodeId, episode.title, podcastTitle, audioUrl);
      
      const progressKey = `transcription-${episodeId}`;
      const sendProgress = (global as any)[progressKey];
      
      // Use AssemblyAI for transcription (better speaker diarization + Audio Intelligence)
      const { submitTranscriptionJob } = await import("./assembly-transcription");
      
      // Update progress to show we're starting
      if (sendProgress) {
        sendProgress({ stage: "processing", percentage: 5, message: "Submitting to AssemblyAI..." });
      }
      transcriptionJobManager.updateProgress(episodeId, { stage: "processing", percentage: 5, message: "Submitting to AssemblyAI..." });
      
      const jobResult = await submitTranscriptionJob(audioUrl, { 
        speakersExpected: speakersExpected || 4,
        speakerLabels: true,
      });
      
      if (!jobResult.jobId) {
        const errorMsg = "Failed to submit transcription job";
        if (sendProgress) {
          sendProgress({ stage: "error", percentage: 0, message: errorMsg });
        }
        transcriptionJobManager.failJob(episodeId, errorMsg);
        delete (global as any)[progressKey];
        throw new Error(errorMsg);
      }
      
      // Store the job ID in the episode
      await storage.updateEpisode(episodeId, {
        assemblyJobId: jobResult.jobId,
        transcriptStatus: "pending",
      });
      
      console.log(`[TRANSCRIPT] AssemblyAI job submitted: ${jobResult.jobId}`);
      
      if (sendProgress) {
        sendProgress({ stage: "processing", percentage: 10, message: "AssemblyAI processing audio..." });
      }
      transcriptionJobManager.updateProgress(episodeId, { stage: "processing", percentage: 10, message: "AssemblyAI processing audio..." });
      
      // Return immediately - the job will be completed via the /complete endpoint
      res.status(201).json({ 
        message: "AssemblyAI transcription job submitted",
        jobId: jobResult.jobId,
        status: "pending",
      });
    } catch (error) {
      console.error(`[TRANSCRIPT ERROR]`, error);
      const errorProgressKey = `transcription-${req.params.id}`;
      const sendProgress = (global as any)[errorProgressKey];
      const errorMsg = error instanceof Error ? error.message : "Transcription failed";
      if (sendProgress) {
        sendProgress({ stage: "error", percentage: 0, message: errorMsg });
      }
      transcriptionJobManager.failJob(req.params.id, errorMsg);
      delete (global as any)[errorProgressKey];
      if (error instanceof Error) {
        return res.status(400).json({ error: error.message });
      }
      res.status(400).json({ error: "Failed to submit transcription job" });
    }
  });

  app.delete("/api/episodes/:id/transcript", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const episodeId = req.params.id;
      const deletedCount = await storage.deleteAllSegmentsForEpisode(episodeId);
      res.json({ 
        message: "Transcript deleted successfully",
        deletedCount 
      });
    } catch (error) {
      console.error(`[TRANSCRIPT DELETE ERROR]`, error);
      res.status(500).json({ error: "Failed to delete transcript" });
    }
  });

  // Fetch transcript from embedded URL (Podcasting 2.0 feature)
  // Supports: JSON, VTT, SRT, Omny FM (timestamp + speaker format), and plain text
  app.post("/api/episodes/:id/transcript/fetch-embedded", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const episodeId = req.params.id;
      const { transcriptUrl } = req.body;
      
      if (!transcriptUrl) {
        return res.status(400).json({ error: "transcriptUrl is required" });
      }
      
      console.log(`[TRANSCRIPT] Fetching embedded transcript from: ${transcriptUrl}`);
      
      // Get episode to check transcript type hint and duration
      const episode = await storage.getEpisode(episodeId);
      const transcriptType = episode?.transcriptType || undefined;
      const maxDuration = episode?.duration || undefined;
      
      // Use the improved transcript importer that handles multiple formats
      const { importExternalTranscript } = await import("./transcription");
      const result = await importExternalTranscript(transcriptUrl, {
        transcriptType,
        maxDuration,
      });
      
      if (!result.success) {
        throw new Error(result.error || "Failed to parse transcript");
      }
      
      if (result.segments.length === 0) {
        throw new Error("No transcript segments could be parsed from the file");
      }
      
      console.log(`[TRANSCRIPT] Parsed ${result.segments.length} segments from ${result.source} format`);
      
      // Clear existing transcript before importing new one
      await storage.deleteAllSegmentsForEpisode(episodeId);
      
      const validatedSegments = z.array(transcriptSegmentSchema).parse(result.segments);
      await storage.createTranscriptSegments(episodeId, validatedSegments);
      
      // Update episode transcript status to indicate host transcript
      await storage.updateEpisode(episodeId, {
        transcriptSource: "host",
        transcriptStatus: "ready",
      });
      
      // Run entity extraction in the background (don't block response)
      const fullText = validatedSegments.map((s: { text: string }) => s.text).join(" ");
      import("./entity-extraction").then(({ extractAndStoreEntitiesForEpisode }) => {
        extractAndStoreEntitiesForEpisode(episodeId, fullText)
          .then(extractResult => {
            console.log(`[ENTITY EXTRACTION] Completed for episode ${episodeId}: ${extractResult.created} entities created, ${extractResult.linked} mentions linked`);
          })
          .catch(err => {
            console.error(`[ENTITY EXTRACTION] Error for episode ${episodeId}:`, err);
          });
      });
      
      res.status(201).json({
        message: `Transcript imported from ${result.source} format`,
        segmentCount: validatedSegments.length,
        source: result.source,
      });
    } catch (error) {
      console.error(`[TRANSCRIPT FETCH ERROR]`, error);
      if (error instanceof Error) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to fetch embedded transcript" });
    }
  });

  // ============ AssemblyAI Transcription Routes ============
  // Start AssemblyAI transcription (fallback when no host transcript)
  // Accepts optional sourceUrl and sourceId to transcribe from a specific source
  app.post("/api/episodes/:id/transcript/assembly", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const episodeId = req.params.id;
      const { speakersExpected, sourceUrl, sourceId } = req.body || {};
      const episode = await storage.getEpisode(episodeId);
      
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }

      // Determine transcription URL: prefer source record URL if sourceId provided
      let transcriptionUrl: string | null = null;
      if (sourceId) {
        // Get URL from the source record directly
        const sourceRecord = await storage.getEpisodeSource(sourceId);
        if (sourceRecord && sourceRecord.episodeId === episodeId) {
          transcriptionUrl = sourceRecord.sourceUrl || sourceRecord.storageUrl || null;
        }
      }
      // Fall back to provided sourceUrl or episode.mediaUrl
      if (!transcriptionUrl) {
        transcriptionUrl = sourceUrl || episode.mediaUrl || null;
      }
      
      if (!transcriptionUrl) {
        return res.status(400).json({ error: "No audio/video URL available for transcription" });
      }

      // Check if already has a transcript
      const existingSegments = await storage.getSegmentsByEpisode(episodeId);
      if (existingSegments.length > 0 && episode.transcriptStatus === "ready") {
        return res.status(400).json({ 
          error: "Episode already has a transcript",
          hint: "Delete existing transcript first if you want to re-transcribe"
        });
      }

      // Get source for job tracking - use provided sourceId or canonical source
      let canonicalSource = await storage.getCanonicalSource(episodeId);
      let targetSource = canonicalSource;
      
      if (sourceId) {
        // Use the specified source
        const specifiedSource = await storage.getEpisodeSource(sourceId);
        if (!specifiedSource || specifiedSource.episodeId !== episodeId) {
          return res.status(400).json({ error: "Invalid source ID" });
        }
        targetSource = specifiedSource;
      } else if (!targetSource) {
        // Create canonical audio source if none exists
        targetSource = await storage.createEpisodeSource({
          episodeId,
          kind: "audio",
          platform: "podcast_host",
          sourceUrl: episode.mediaUrl || transcriptionUrl,
          isCanonical: true,
        });
        console.log(`[ASSEMBLY] Created canonical audio source ${targetSource.id} for episode ${episodeId}`);
      }

      // DUAL-WRITE: Create a pending job FIRST for tracking in Jobs Monitor
      const newJob = await storage.createJob({
        episodeSourceId: targetSource.id,
        type: "transcribe",
        status: "pending",
        attempts: 1,
        result: JSON.stringify({ speakersExpected, sourceUrl: transcriptionUrl }),
      });
      console.log(`[ASSEMBLY] Created job ${newJob.id} for episode source ${targetSource.id} using URL: ${transcriptionUrl}`);

      try {
        // Import AssemblyAI service
        const { submitTranscriptionJob } = await import("./assembly-transcription");
        
        // Get podcast for known speakers
        const podcast = await storage.getPodcast(episode.podcastId);
        
        // Submit the job with the transcription URL (could be from any source)
        const { jobId } = await submitTranscriptionJob(transcriptionUrl, {
          speakerLabels: true,
          knownSpeakers: podcast?.knownSpeakers || [],
          podcastTitle: podcast?.title,
          speakersExpected: speakersExpected ? parseInt(speakersExpected) : undefined,
        });

        // Update episode with job ID and pending status
        await storage.updateEpisode(episodeId, {
          assemblyJobId: jobId,
          transcriptStatus: "pending",
          transcriptSource: "assembly",
        });

        // Update job with assemblyJobId and mark as running
        await storage.updateJob(newJob.id, {
          status: "running",
          result: JSON.stringify({ assemblyJobId: jobId, speakersExpected }),
        });

        console.log(`[ASSEMBLY] Started transcription job ${jobId} for episode ${episodeId}`);

        res.json({
          message: "AssemblyAI transcription started",
          jobId,
          newJobId: newJob.id,
          status: "pending",
        });
      } catch (submissionError) {
        // AssemblyAI submission failed - update job to error state
        const errorMessage = submissionError instanceof Error ? submissionError.message : "Unknown error";
        console.error(`[ASSEMBLY] AssemblyAI submission failed:`, errorMessage);
        
        await storage.updateJob(newJob.id, {
          status: "error",
          lastError: errorMessage,
        });
        
        await storage.updateEpisode(episodeId, {
          transcriptStatus: "error",
        });
        
        return res.status(400).json({ error: errorMessage });
      }
    } catch (error) {
      console.error(`[ASSEMBLY] Error starting transcription:`, error);
      
      // Update episode status to error
      try {
        await storage.updateEpisode(req.params.id, {
          transcriptStatus: "error",
        });
      } catch (updateError) {
        console.error(`[ASSEMBLY] Failed to update episode status:`, updateError);
      }

      if (error instanceof Error) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to start transcription" });
    }
  });

  // Check AssemblyAI job status
  app.get("/api/episodes/:id/transcript/assembly/status", async (req, res) => {
    try {
      const episodeId = req.params.id;
      const episode = await storage.getEpisode(episodeId);
      
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }

      if (!episode.assemblyJobId) {
        return res.json({
          status: episode.transcriptStatus || "none",
          hasJob: false,
        });
      }

      const { checkJobStatus } = await import("./assembly-transcription");
      const status = await checkJobStatus(episode.assemblyJobId);

      res.json({
        jobId: episode.assemblyJobId,
        status: status.status,
        hasJob: true,
        error: status.error,
      });
    } catch (error) {
      console.error(`[ASSEMBLY] Error checking status:`, error);
      res.status(500).json({ error: "Failed to check job status" });
    }
  });

  // Complete AssemblyAI transcription (fetch results and store segments)
  app.post("/api/episodes/:id/transcript/assembly/complete", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const episodeId = req.params.id;
      const episode = await storage.getEpisode(episodeId);
      
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }

      // Prevent duplicate processing - if transcript is already ready from AssemblyAI, skip
      if (episode.transcriptStatus === "ready" && episode.transcriptSource === "assembly") {
        console.log(`[ASSEMBLY] Skipping duplicate completion request for episode ${episodeId} - already processed`);
        return res.json({ 
          message: "Transcript already processed",
          alreadyComplete: true,
        });
      }

      if (!episode.assemblyJobId) {
        return res.status(400).json({ error: "No AssemblyAI job found for this episode" });
      }

      const { checkJobStatus, convertToSegmentsAsync, extractAudioIntelligence } = await import("./assembly-transcription");
      const status = await checkJobStatus(episode.assemblyJobId);

      if (status.status === "error") {
        await storage.updateEpisode(episodeId, { transcriptStatus: "error" });
        return res.status(400).json({ error: status.error || "Transcription failed" });
      }

      if (status.status !== "completed" || !status.transcript) {
        return res.status(400).json({ 
          error: "Transcription not yet complete",
          status: status.status,
        });
      }

      // Get podcast for known speakers
      const podcast = await storage.getPodcast(episode.podcastId);
      
      // Convert to segments (uses AssemblyAI sentences endpoint when diarization fails)
      const segments = await convertToSegmentsAsync(
        status.transcript, 
        episode.assemblyJobId,
        podcast?.knownSpeakers || []
      );

      if (segments.length === 0) {
        await storage.updateEpisode(episodeId, { transcriptStatus: "error" });
        return res.status(400).json({ error: "No segments could be extracted from transcript" });
      }

      // Extract Audio Intelligence data (chapters, entities, topics, key phrases)
      const audioIntelligence = extractAudioIntelligence(status.transcript);

      // Clear existing transcript and store new segments
      await storage.deleteAllSegmentsForEpisode(episodeId);
      
      const validatedSegments = z.array(transcriptSegmentSchema).parse(segments);
      await storage.createTranscriptSegments(episodeId, validatedSegments);

      // Store chapters as episode segments
      if (audioIntelligence.chapters.length > 0) {
        console.log(`[ASSEMBLY] Storing ${audioIntelligence.chapters.length} chapters for episode ${episodeId}`);
        
        // Delete existing AI-generated segments for this episode
        await storage.deleteEpisodeSegmentsByEpisode(episodeId);
        
        // Insert chapters as episode segments
        for (let i = 0; i < audioIntelligence.chapters.length; i++) {
          const chapter = audioIntelligence.chapters[i];
          await storage.createEpisodeSegment({
            episodeId,
            startTime: chapter.startTime,
            endTime: chapter.endTime,
            label: chapter.headline || chapter.gist,
            summary: chapter.summary,
            segmentType: "topic",
            displayOrder: i,
            isAiGenerated: true,
          });
        }
      }

      // Update episode status
      await storage.updateEpisode(episodeId, {
        transcriptStatus: "ready",
        transcriptSource: "assembly",
      });

      // DUAL-WRITE: Also update any jobs in the new jobs table
      const canonicalSource = await storage.getCanonicalSource(episodeId);
      if (canonicalSource) {
        const sourceJobs = await storage.getJobsByEpisodeSource(canonicalSource.id);
        for (const job of sourceJobs) {
          if (job.type === "transcribe" && job.status === "running") {
            await storage.updateJob(job.id, {
              status: "done",
              result: JSON.stringify({
                assemblyJobId: episode.assemblyJobId,
                segmentCount: segments.length,
                chapterCount: audioIntelligence.chapters.length,
              }),
            });
            console.log(`[ASSEMBLY] Marked job ${job.id} as done`);
          }
        }
      }

      console.log(`[ASSEMBLY] Completed transcription for episode ${episodeId}: ${segments.length} segments, ${audioIntelligence.chapters.length} chapters`);

      // Log Audio Intelligence summary
      if (audioIntelligence.topics.length > 0) {
        const topTopics = audioIntelligence.topics.slice(0, 5).map(t => t.label).join(", ");
        console.log(`[ASSEMBLY] Top topics: ${topTopics}`);
      }
      if (audioIntelligence.keyPhrases.length > 0) {
        const topPhrases = audioIntelligence.keyPhrases.slice(0, 5).map(p => p.text).join(", ");
        console.log(`[ASSEMBLY] Key phrases: ${topPhrases}`);
      }
      if (audioIntelligence.entities.length > 0) {
        console.log(`[ASSEMBLY] Detected ${audioIntelligence.entities.length} entities`);
      }

      // Run Gemini entity extraction in background (for monetization entities)
      const fullText = validatedSegments.map((s: { text: string }) => s.text).join(" ");
      import("./entity-extraction").then(({ extractAndStoreEntitiesForEpisode }) => {
        extractAndStoreEntitiesForEpisode(episodeId, fullText)
          .then(extractResult => {
            console.log(`[ENTITY EXTRACTION] Completed for episode ${episodeId}: ${extractResult.created} entities created`);
          })
          .catch(err => {
            console.error(`[ENTITY EXTRACTION] Error for episode ${episodeId}:`, err);
          });
      });

      res.json({
        message: "Transcript imported from AssemblyAI",
        segmentCount: segments.length,
        chapterCount: audioIntelligence.chapters.length,
        entityCount: audioIntelligence.entities.length,
        topicCount: audioIntelligence.topics.length,
        keyPhraseCount: audioIntelligence.keyPhrases.length,
        source: "assembly",
      });
    } catch (error) {
      console.error(`[ASSEMBLY] Error completing transcription:`, error);
      
      try {
        await storage.updateEpisode(req.params.id, { transcriptStatus: "error" });
      } catch (updateError) {
        console.error(`[ASSEMBLY] Failed to update episode status:`, updateError);
      }

      if (error instanceof Error) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to complete transcription" });
    }
  });

  app.get("/api/episodes/:id/speakers", async (req, res) => {
    try {
      const episodeId = req.params.id;
      const segments = await storage.getSegmentsByEpisode(episodeId);
      
      // Group segments by speaker first
      const segmentsBySpeaker = new Map<string, Array<typeof segments[0]>>();
      
      for (const segment of segments) {
        if (segment.speaker) {
          const existing = segmentsBySpeaker.get(segment.speaker);
          if (existing) {
            existing.push(segment);
          } else {
            segmentsBySpeaker.set(segment.speaker, [segment]);
          }
        }
      }
      
      // Build speaker data with best samples (longest segments for that speaker)
      const speakers = Array.from(segmentsBySpeaker.entries()).map(([name, speakerSegments]) => {
        // Filter out invalid segments (must have positive duration)
        const validSegments = speakerSegments.filter(seg => 
          typeof seg.startTime === 'number' && 
          typeof seg.endTime === 'number' && 
          seg.endTime > seg.startTime &&
          seg.text && seg.text.trim().length > 0
        );
        
        // Sort this speaker's valid segments by duration (longest first)
        const sortedByDuration = [...validSegments].sort((a, b) => 
          (b.endTime - b.startTime) - (a.endTime - a.startTime)
        );
        
        // Take up to 3 longest segments as samples
        const samples = sortedByDuration.slice(0, 3).map(seg => ({
          startTime: seg.startTime,
          endTime: seg.endTime,
          text: seg.text.substring(0, 100) + (seg.text.length > 100 ? '...' : '')
        }));
        
        return {
          name,
          segmentCount: speakerSegments.length,
          samples
        };
      }).sort((a, b) => b.segmentCount - a.segmentCount);
      
      res.json(speakers);
    } catch (error) {
      console.error(`[SPEAKERS ERROR]`, error);
      res.status(500).json({ error: "Failed to get speakers" });
    }
  });

  app.patch("/api/episodes/:id/speakers/rename", async (req, res) => {
    try {
      const episodeId = req.params.id;
      const { oldName, newName } = req.body;
      
      if (!oldName || !newName) {
        return res.status(400).json({ error: "oldName and newName are required" });
      }
      
      const updatedCount = await storage.renameSpeaker(episodeId, oldName, newName);
      
      // Learn the speaker name: add to podcast's knownSpeakers if not already there
      try {
        const episode = await storage.getEpisode(episodeId);
        if (episode?.podcastId) {
          const podcast = await storage.getPodcast(episode.podcastId);
          if (podcast) {
            const knownSpeakers = podcast.knownSpeakers || [];
            // Only add if it's a real name (not generic like "Host", "Guest 1", "Speaker 2", etc.)
            const genericPatterns = [
              /^host$/i,
              /^guest\s*\d*$/i,
              /^speaker\s*\d*$/i,
              /^unknown$/i,
              /^person\s*\d*$/i,
              /^interviewer$/i,
              /^interviewee\s*\d*$/i,
              /^narrator$/i,
              /^voice\s*\d*$/i,
            ];
            const trimmedName = newName.trim();
            const isGenericName = genericPatterns.some(pattern => pattern.test(trimmedName));
            
            if (!isGenericName && trimmedName.length > 1 && !knownSpeakers.includes(trimmedName)) {
              const updatedSpeakers = [...knownSpeakers, trimmedName];
              await storage.updatePodcast(podcast.id, { knownSpeakers: updatedSpeakers });
              console.log(`[SPEAKER LEARNING] Added "${trimmedName}" to known speakers for podcast "${podcast.title}"`);
            }
          }
        }
      } catch (learnError) {
        console.error(`[SPEAKER LEARNING ERROR]`, learnError);
        // Don't fail the rename if learning fails
      }
      
      res.json({ 
        message: `Renamed "${oldName}" to "${newName}"`,
        updatedCount 
      });
    } catch (error) {
      console.error(`[SPEAKER RENAME ERROR]`, error);
      res.status(500).json({ error: "Failed to rename speaker" });
    }
  });

  app.get("/api/episodes/:id/annotations", async (req: any, res) => {
    try {
      // Pass userId if logged in so users can see their own pending annotations
      const userId = req.user?.claims?.sub;
      const sort = (req.query.sort as "top" | "new" | "ai") || "top";
      const aiOnly = req.query.aiOnly === "true";
      const annotations = await storage.getAnnotationsByEpisode(req.params.id, { userId, sort, aiOnly });
      
      // Add userVote to each annotation if user is logged in
      if (userId) {
        const annotationsWithVotes = await Promise.all(
          annotations.map(async (annotation) => {
            const vote = await storage.getUserVote(userId, annotation.id);
            return {
              ...annotation,
              userVote: vote ? (vote.type as "up" | "down") : null,
            };
          })
        );
        return res.json(annotationsWithVotes);
      }
      
      // For non-authenticated users, return annotations with null userVote
      res.json(annotations.map(a => ({ ...a, userVote: null })));
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch annotations" });
    }
  });

  app.get("/api/profile/annotations", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const annotations = await storage.getAnnotationsByUser(userId);
      res.json(annotations);
    } catch (error) {
      console.error("[ERROR] Failed to fetch user annotations:", error);
      res.status(500).json({ error: "Failed to fetch annotations" });
    }
  });

  // Update user profile
  app.patch("/api/profile", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { firstName, lastName, profileImageUrl } = req.body;
      
      const updatedUser = await storage.updateUserProfile(userId, {
        firstName,
        lastName,
        profileImageUrl,
      });

      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json(updatedUser);
    } catch (error) {
      console.error("[ERROR] Failed to update profile:", error);
      res.status(500).json({ error: "Failed to update profile" });
    }
  });

  // Get presigned upload URL for profile image
  app.post("/api/profile/upload-url", isAuthenticated, async (req, res) => {
    try {
      const { ObjectStorageService } = await import("./objectStorage");
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      console.error("[ERROR] Failed to get upload URL:", error);
      res.status(500).json({ error: "Failed to get upload URL" });
    }
  });

  // Set ACL policy for uploaded profile image
  app.put("/api/profile/image", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { imageURL } = req.body;
      if (!imageURL) {
        return res.status(400).json({ error: "imageURL is required" });
      }

      const { ObjectStorageService } = await import("./objectStorage");
      const objectStorageService = new ObjectStorageService();
      const objectPath = await objectStorageService.trySetObjectEntityAclPolicy(
        imageURL,
        {
          owner: userId,
          visibility: "public",
        },
      );

      // Update user profile with new image URL
      const updatedUser = await storage.updateUserProfile(userId, {
        profileImageUrl: objectPath,
      });

      res.json({ objectPath, user: updatedUser });
    } catch (error) {
      console.error("[ERROR] Failed to set profile image:", error);
      res.status(500).json({ error: "Failed to set profile image" });
    }
  });

  // ==================== USER MANAGEMENT (ADMIN) ====================
  
  // Get all users (admin only)
  app.get("/api/admin/users", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      // Check if user is admin
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      console.error("[ERROR] Failed to fetch users:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  // Update user role (admin only)
  app.patch("/api/admin/users/:id/role", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const { role } = req.body;
      if (!userRoles.includes(role)) {
        return res.status(400).json({ error: `Invalid role. Must be one of: ${userRoles.join(", ")}` });
      }
      
      // Prevent removing own admin role
      if (req.params.id === userId && role !== "admin") {
        return res.status(400).json({ error: "Cannot remove your own admin role" });
      }
      
      const updatedUser = await storage.updateUserRole(req.params.id, role);
      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      res.json(updatedUser);
    } catch (error) {
      console.error("[ERROR] Failed to update user role:", error);
      res.status(500).json({ error: "Failed to update user role" });
    }
  });

  // Update user certifications (admin only)
  app.patch("/api/admin/users/:id/certifications", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const { certifications } = req.body;
      if (!Array.isArray(certifications) || !certifications.every(c => userCertifications.includes(c as any))) {
        return res.status(400).json({ error: `Invalid certifications. Must be one of: ${userCertifications.join(", ")}` });
      }
      
      const updatedUser = await storage.updateUserCertifications(req.params.id, certifications);
      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      res.json(updatedUser);
    } catch (error) {
      console.error("[ERROR] Failed to update certifications:", error);
      res.status(500).json({ error: "Failed to update certifications" });
    }
  });

  // Ban user (admin only)
  app.post("/api/admin/users/:id/ban", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      // Prevent self-ban
      if (req.params.id === userId) {
        return res.status(400).json({ error: "Cannot ban yourself" });
      }
      
      const { reason } = req.body;
      if (!reason || typeof reason !== "string") {
        return res.status(400).json({ error: "Ban reason is required" });
      }
      
      const bannedUser = await storage.banUser(req.params.id, reason, userId);
      if (!bannedUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      res.json(bannedUser);
    } catch (error) {
      console.error("[ERROR] Failed to ban user:", error);
      res.status(500).json({ error: "Failed to ban user" });
    }
  });

  // Unban user (admin only)
  app.post("/api/admin/users/:id/unban", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const unbannedUser = await storage.unbanUser(req.params.id);
      if (!unbannedUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      res.json(unbannedUser);
    } catch (error) {
      console.error("[ERROR] Failed to unban user:", error);
      res.status(500).json({ error: "Failed to unban user" });
    }
  });

  // Delete single user (admin only)
  app.delete("/api/admin/users/:id", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const targetUserId = req.params.id;
      
      // Prevent self-deletion
      if (targetUserId === userId) {
        return res.status(400).json({ error: "Cannot delete yourself" });
      }
      
      // Check if trying to delete an admin
      const targetUser = await storage.getUser(targetUserId);
      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      if (targetUser.role === "admin") {
        return res.status(400).json({ error: "Cannot delete admin users" });
      }
      
      const deletedCount = await storage.bulkDeleteUsers([targetUserId]);
      res.json({ deleted: deletedCount, message: "User deleted successfully" });
    } catch (error) {
      console.error("[ERROR] Failed to delete user:", error);
      res.status(500).json({ error: "Failed to delete user" });
    }
  });

  // Bulk delete users (admin only)
  app.post("/api/admin/users/bulk-delete", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const { userIds } = req.body;
      if (!Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({ error: "userIds array is required" });
      }
      
      // Prevent self-deletion
      if (userIds.includes(userId)) {
        return res.status(400).json({ error: "Cannot delete yourself" });
      }
      
      // Check if trying to delete any admins
      const usersToDelete = await Promise.all(userIds.map(id => storage.getUser(id)));
      const hasAdmins = usersToDelete.some(u => u?.role === "admin");
      if (hasAdmins) {
        return res.status(400).json({ error: "Cannot delete admin users" });
      }
      
      const deletedCount = await storage.bulkDeleteUsers(userIds);
      res.json({ deleted: deletedCount });
    } catch (error) {
      console.error("[ERROR] Failed to bulk delete users:", error);
      res.status(500).json({ error: "Failed to delete users" });
    }
  });

  // Generic image upload - get presigned URL
  app.post("/api/upload/image", isAuthenticated, async (req, res) => {
    try {
      const { ObjectStorageService } = await import("./objectStorage");
      const objectStorageService = new ObjectStorageService();
      const uploadUrl = await objectStorageService.getObjectEntityUploadURL();
      
      // Extract the object path from the presigned URL
      const url = new URL(uploadUrl);
      const objectPath = url.pathname;
      
      res.json({ uploadUrl, objectPath });
    } catch (error) {
      console.error("[ERROR] Failed to get upload URL:", error);
      res.status(500).json({ error: "Failed to get upload URL. Make sure object storage is configured." });
    }
  });

  // Confirm image upload and get final URL
  app.post("/api/upload/confirm", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { objectPath } = req.body;
      if (!objectPath) {
        return res.status(400).json({ error: "objectPath is required" });
      }

      const { ObjectStorageService } = await import("./objectStorage");
      const objectStorageService = new ObjectStorageService();
      
      // Set ACL policy for the uploaded image (public visibility for thumbnails)
      const normalizedPath = await objectStorageService.trySetObjectEntityAclPolicy(
        objectPath,
        {
          owner: userId,
          visibility: "public",
        },
      );

      // Return the path that can be used to serve the image
      res.json({ imageUrl: normalizedPath });
    } catch (error) {
      console.error("[ERROR] Failed to confirm upload:", error);
      res.status(500).json({ error: "Failed to confirm upload" });
    }
  });

  // Serve uploaded objects
  app.get("/objects/:objectPath(*)", async (req, res) => {
    try {
      const { ObjectStorageService, ObjectNotFoundError } = await import("./objectStorage");
      const { ObjectPermission } = await import("./objectAcl");
      const objectStorageService = new ObjectStorageService();
      
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      const canAccess = await objectStorageService.canAccessObjectEntity({
        objectFile,
        requestedPermission: ObjectPermission.READ,
      });
      
      if (!canAccess) {
        return res.sendStatus(401);
      }
      
      objectStorageService.downloadObject(objectFile, res);
    } catch (error: any) {
      if (error?.name === "ObjectNotFoundError") {
        return res.sendStatus(404);
      }
      console.error("Error serving object:", error);
      return res.sendStatus(500);
    }
  });

  app.get("/api/annotations/featured", async (_req, res) => {
    try {
      const featured = await storage.getFeaturedAnnotations();
      res.json(featured);
    } catch (error) {
      console.error("Error fetching featured annotations:", error);
      res.status(500).json({ error: "Failed to fetch featured annotations" });
    }
  });

  app.patch("/api/annotations/:id/featured", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { featured } = req.body;
      const userId = req.user?.claims?.sub;

      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ error: "Only admins can feature annotations" });
      }

      if (typeof featured !== "boolean") {
        return res.status(400).json({ error: "Featured must be a boolean" });
      }

      const annotation = await storage.setAnnotationFeatured(id, featured);
      if (!annotation) {
        return res.status(404).json({ error: "Annotation not found" });
      }

      res.json(annotation);
    } catch (error) {
      console.error("Error setting featured status:", error);
      res.status(500).json({ error: "Failed to update annotation" });
    }
  });

  app.patch("/api/annotations/:id/hero", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { isHero } = req.body;
      const userId = req.user?.claims?.sub;

      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ error: "Only admins can set hero annotations" });
      }

      if (typeof isHero !== "boolean") {
        return res.status(400).json({ error: "isHero must be a boolean" });
      }

      const annotation = await storage.setAnnotationHero(id, isHero);
      if (!annotation) {
        return res.status(404).json({ error: "Annotation not found" });
      }

      res.json(annotation);
    } catch (error) {
      console.error("Error setting hero status:", error);
      res.status(500).json({ error: "Failed to update annotation" });
    }
  });

  app.get("/api/annotations/hero", async (_req, res) => {
    try {
      const hero = await storage.getHeroAnnotation();
      res.json(hero || null);
    } catch (error) {
      console.error("Error fetching hero annotation:", error);
      res.status(500).json({ error: "Failed to fetch hero annotation" });
    }
  });

  // GET /api/annotations/:id/share-summary - Get annotation with episode/podcast info for sharing
  app.get("/api/annotations/:id/share-summary", async (req, res) => {
    try {
      const { id } = req.params;
      
      if (!id) {
        return res.status(400).json({ error: "Annotation ID is required" });
      }
      
      // Get the annotation
      const annotation = await storage.getAnnotation(id);
      if (!annotation) {
        return res.status(404).json({ error: "Annotation not found" });
      }
      
      // Only allow sharing of approved annotations
      if (annotation.status !== "approved") {
        return res.status(404).json({ error: "Annotation not available" });
      }
      
      // Get episode info
      const episode = await storage.getEpisode(annotation.episodeId);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }
      
      // Get podcast info
      const podcast = await storage.getPodcast(episode.podcastId);
      if (!podcast) {
        return res.status(404).json({ error: "Podcast not found" });
      }
      
      // Build share summary response
      const shareSummary = {
        id: annotation.id,
        text: annotation.text,
        content: annotation.content,
        timestamp: annotation.timestamp,
        authorName: annotation.authorName,
        authorAvatar: annotation.authorAvatar,
        upvotes: annotation.upvotes,
        createdAt: annotation.createdAt,
        episode: {
          id: episode.id,
          title: episode.title,
          artworkUrl: episode.artworkUrl || podcast.artworkUrl,
        },
        podcast: {
          id: podcast.id,
          title: podcast.title,
          artworkUrl: podcast.artworkUrl,
        },
      };
      
      res.json(shareSummary);
    } catch (error) {
      console.error("[SHARE] Error fetching annotation share summary:", error);
      res.status(500).json({ error: "Failed to fetch annotation share data" });
    }
  });

  // ============ MODERATION QUEUE ENDPOINTS ============
  
  // Get pending annotations for moderation
  app.get("/api/admin/annotations/pending", isAuthenticated, requireAdminOrModerator, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const offset = parseInt(req.query.offset as string) || 0;

      const items = await storage.getPendingAnnotations({ limit, offset });
      res.json({ items, limit, offset });
    } catch (error) {
      console.error("Error fetching pending annotations:", error);
      res.status(500).json({ error: "Failed to fetch pending annotations" });
    }
  });

  // Approve an annotation
  app.post("/api/admin/annotations/:id/approve", isAuthenticated, requireAdminOrModerator, async (req, res) => {
    try {
      const { id } = req.params;

      const annotation = await storage.updateAnnotationStatus(id, {
        status: "approved",
        rejectionReason: null,
      });

      if (!annotation) {
        return res.status(404).json({ error: "Annotation not found" });
      }

      res.json(annotation);
    } catch (error) {
      console.error("Error approving annotation:", error);
      res.status(500).json({ error: "Failed to approve annotation" });
    }
  });

  // Reject an annotation
  app.post("/api/admin/annotations/:id/reject", isAuthenticated, requireAdminOrModerator, async (req, res) => {
    try {
      const { id } = req.params;
      const reason = ((req.body?.reason ?? "") as string).slice(0, 500);

      const annotation = await storage.updateAnnotationStatus(id, {
        status: "rejected",
        rejectionReason: reason || null,
      });

      if (!annotation) {
        return res.status(404).json({ error: "Annotation not found" });
      }

      res.json(annotation);
    } catch (error) {
      console.error("Error rejecting annotation:", error);
      res.status(500).json({ error: "Failed to reject annotation" });
    }
  });

  // ============ EPISODE IDENTITY RESOLUTION QUEUE ============
  
  // Get episodes awaiting review with their candidates
  app.get("/api/admin/resolution-queue", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      
      const awaitingEpisodes = await storage.getEpisodesAwaitingReview(limit);
      
      // Fetch candidates and podcast info for each episode
      const results = await Promise.all(
        awaitingEpisodes.map(async (episode) => {
          const candidates = await storage.getEpisodeCandidatesByEpisode(episode.id);
          const podcast = await storage.getPodcast(episode.podcastId);
          
          return {
            episode: {
              id: episode.id,
              title: episode.title,
              duration: episode.duration,
              publishedAt: episode.publishedAt,
              resolutionStatus: episode.resolutionStatus,
              resolutionFallbackAt: episode.resolutionFallbackAt,
            },
            podcast: podcast ? {
              id: podcast.id,
              title: podcast.title,
              youtubeChannelId: podcast.youtubeChannelId,
            } : null,
            candidates: candidates.filter(c => c.status === "pending"),
          };
        })
      );
      
      res.json({ 
        items: results,
        total: results.length,
      });
    } catch (error) {
      console.error("Error fetching resolution queue:", error);
      res.status(500).json({ error: "Failed to fetch resolution queue" });
    }
  });
  
  // Accept a candidate - creates video source and queues transcript job
  app.post("/api/admin/candidates/:id/accept", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const userId = (req.user as any)?.id;
      
      const candidate = await storage.getEpisodeCandidate(id);
      if (!candidate) {
        return res.status(404).json({ error: "Candidate not found" });
      }
      
      if (candidate.status !== "pending") {
        return res.status(400).json({ error: `Candidate already ${candidate.status}` });
      }
      
      // Check for existing video sources to avoid duplicates
      const existingSources = await storage.getEpisodeSourcesByEpisode(candidate.episodeId);
      const existingVideoSource = existingSources.find(s => s.kind === "video" && s.platform === "youtube");
      
      if (existingVideoSource) {
        return res.status(400).json({ 
          error: "Episode already has a YouTube video source",
          existingSourceId: existingVideoSource.id
        });
      }
      
      // Accept the candidate
      const acceptedCandidate = await storage.acceptCandidate(id, userId);
      
      // Create video source from candidate
      const videoSource = await storage.createEpisodeSource({
        episodeId: candidate.episodeId,
        kind: "video",
        platform: "youtube",
        sourceUrl: candidate.youtubeVideoUrl,
        isCanonical: false,
      });
      
      // Update episode to resolved AND clear fallback deadline
      await storage.updateEpisode(candidate.episodeId, { 
        resolutionStatus: "resolved",
        resolutionFallbackAt: null,
      });
      
      // Queue youtube transcript job
      await storage.createJob({
        episodeSourceId: videoSource.id,
        type: "youtube_transcript",
        status: "pending",
      });
      
      console.log(`[RESOLUTION] Admin ${userId} accepted candidate ${id} for episode ${candidate.episodeId}`);
      
      res.json({ 
        success: true,
        candidate: acceptedCandidate,
        sourceId: videoSource.id,
      });
    } catch (error) {
      console.error("Error accepting candidate:", error);
      res.status(500).json({ error: "Failed to accept candidate" });
    }
  });
  
  // Reject a candidate
  app.post("/api/admin/candidates/:id/reject", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const userId = (req.user as any)?.id;
      const reason = ((req.body?.reason ?? "") as string).slice(0, 500);
      
      const candidate = await storage.getEpisodeCandidate(id);
      if (!candidate) {
        return res.status(404).json({ error: "Candidate not found" });
      }
      
      if (candidate.status !== "pending") {
        return res.status(400).json({ error: `Candidate already ${candidate.status}` });
      }
      
      const rejectedCandidate = await storage.rejectCandidate(id, userId, reason);
      
      // Check if there are remaining pending candidates for this episode
      const remainingCandidates = await storage.getEpisodeCandidatesByEpisode(candidate.episodeId);
      const pendingCandidates = remainingCandidates.filter(c => c.status === "pending");
      
      // If no more pending candidates, mark episode as unresolved with a fresh fallback deadline
      if (pendingCandidates.length === 0) {
        const fallbackDeadline = new Date();
        fallbackDeadline.setHours(fallbackDeadline.getHours() + 24); // 24h fallback after all rejected
        
        await storage.updateEpisode(candidate.episodeId, { 
          resolutionStatus: "unresolved",
          resolutionFallbackAt: fallbackDeadline,
        });
        
        console.log(`[RESOLUTION] All candidates rejected for episode ${candidate.episodeId}, fallback at ${fallbackDeadline.toISOString()}`);
      }
      
      console.log(`[RESOLUTION] Admin ${userId} rejected candidate ${id} for episode ${candidate.episodeId}`);
      
      res.json({ 
        success: true,
        candidate: rejectedCandidate,
        remainingPendingCandidates: pendingCandidates.length,
      });
    } catch (error) {
      console.error("Error rejecting candidate:", error);
      res.status(500).json({ error: "Failed to reject candidate" });
    }
  });
  
  // Request paid transcription for episode (AssemblyAI) - admin action with audit logging
  app.post("/api/admin/episodes/:id/request-paid-transcription", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const userId = (req.user as any)?.id || "unknown";
      
      const episode = await storage.getEpisode(id);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }
      
      // Check if episode already has a transcript
      if (episode.transcriptStatus === "ready") {
        const segments = await storage.getSegmentsByEpisode(id);
        if (segments.length > 0) {
          return res.status(400).json({ 
            error: "Episode already has a transcript",
            segmentCount: segments.length
          });
        }
      }
      
      // Only allow from specific states
      const allowedStates = ["awaiting_review", "unresolved", "fallback_pending"];
      if (!allowedStates.includes(episode.resolutionStatus || "")) {
        return res.status(400).json({ 
          error: `Episode is ${episode.resolutionStatus}, cannot request paid transcription`,
          hint: "Episode must be in awaiting_review, unresolved, or fallback_pending state"
        });
      }
      
      // Get or create canonical audio source
      let source = await storage.getCanonicalSource(id);
      if (!source) {
        const transcriptionUrl = episode.mediaUrl || episode.enclosureUrl;
        if (!transcriptionUrl) {
          return res.status(400).json({ error: "No audio URL available for transcription" });
        }
        
        source = await storage.createEpisodeSource({
          episodeId: id,
          kind: "audio",
          platform: "podcast_host",
          sourceUrl: transcriptionUrl,
          isCanonical: true,
        });
      }
      
      // Create AssemblyAI transcription job
      const transcribeJob = await storage.createJob({
        episodeSourceId: source.id,
        type: "transcribe",
        status: "pending",
      });
      
      // Update episode status
      await storage.updateEpisode(id, { 
        resolutionStatus: "fallback_requested",
        transcriptStatus: "pending",
        resolutionFallbackAt: null,
      });
      
      // AUDIT LOG: Record paid transcription request
      console.log(`[AUDIT:PAID-TRANSCRIPTION] Admin ${userId} requested AssemblyAI transcription for episode ${id} at ${new Date().toISOString()}`);
      console.log(`[AUDIT:PAID-TRANSCRIPTION] Job ${transcribeJob.id} created for source ${source.id}`);
      
      res.json({ 
        success: true,
        jobId: transcribeJob.id,
        message: "Paid transcription (AssemblyAI) job enqueued",
        auditInfo: {
          adminId: userId,
          episodeId: id,
          timestamp: new Date().toISOString(),
        }
      });
    } catch (error) {
      console.error("Error requesting paid transcription:", error);
      res.status(500).json({ error: "Failed to request paid transcription" });
    }
  });
  
  // Legacy fallback trigger (deprecated - use request-paid-transcription)
  app.post("/api/admin/episodes/:id/trigger-fallback", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      
      const episode = await storage.getEpisode(id);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }
      
      if (!["awaiting_review", "unresolved", "fallback_pending"].includes(episode.resolutionStatus || "")) {
        return res.status(400).json({ error: `Episode is ${episode.resolutionStatus}, cannot trigger fallback` });
      }
      
      await storage.updateEpisode(id, { resolutionStatus: "fallback_pending" });
      
      console.log(`[RESOLUTION] Admin triggered fallback_pending for episode ${id}`);
      
      res.json({ 
        success: true,
        message: "Episode marked as fallback_pending. Use 'Request paid transcription' to enqueue AssemblyAI job."
      });
    } catch (error) {
      console.error("Error triggering fallback:", error);
      res.status(500).json({ error: "Failed to trigger fallback" });
    }
  });

  // Search YouTube for an episode and add video source
  app.post("/api/admin/episodes/:id/youtube-search", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      
      const episode = await storage.getEpisode(id);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }
      
      // Check if already has video source
      const existingSources = await storage.getEpisodeSourcesByEpisode(id);
      const existingVideoSource = existingSources.find(s => s.kind === "video");
      if (existingVideoSource) {
        return res.status(400).json({ 
          error: "Episode already has a video source",
          source: existingVideoSource
        });
      }
      
      // Search YouTube
      const { Innertube } = await import("youtubei.js");
      const yt = await Innertube.create();
      
      const podcast = await storage.getPodcast(episode.podcastId);
      const searchQuery = `${podcast?.title || ""} ${episode.title}`;
      
      console.log(`[YOUTUBE-SEARCH] Admin searching: "${searchQuery}"`);
      const search = await yt.search(searchQuery);
      
      if (!search.videos || search.videos.length === 0) {
        return res.status(404).json({ error: "No YouTube videos found" });
      }
      
      const video = search.videos[0] as any;
      const videoId = video.id || video.video_id;
      const videoTitle = video.title?.text || video.title || "Unknown";
      
      if (!videoId) {
        return res.status(404).json({ error: "First result has no video ID" });
      }
      
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
      
      // Use centralized transcript guard
      const guardResult = await shouldGenerateTranscript(id);
      logTranscriptGuardDecision("YOUTUBE-SEARCH-ADMIN", id, guardResult);
      
      // Create video source
      const videoSource = await storage.createEpisodeSource({
        episodeId: id,
        kind: "video",
        platform: "youtube",
        sourceUrl: videoUrl,
        isCanonical: false,
      });
      
      // Only queue YouTube transcript job if guard allows
      let transcriptJob = null;
      if (guardResult.shouldGenerate) {
        transcriptJob = await storage.createJob({
          episodeSourceId: videoSource.id,
          type: "youtube_transcript",
          status: "pending",
        });
      }
      
      console.log(`[YOUTUBE-SEARCH] Created source ${videoSource.id}${transcriptJob ? ` and job ${transcriptJob.id}` : ' (no job - transcript already exists)'}`);
      
      res.json({
        success: true,
        videoId,
        videoUrl,
        videoTitle,
        sourceId: videoSource.id,
        jobId: transcriptJob?.id || null,
        skippedTranscriptJob: !guardResult.shouldGenerate,
      });
    } catch (error: any) {
      console.error("Error searching YouTube:", error);
      res.status(500).json({ error: error.message || "YouTube search failed" });
    }
  });

  // T-8: Promote an AI-generated annotation (convert to regular annotation)
  app.patch("/api/annotations/:id/promote", isAuthenticated, requireAdminOrModerator, async (req, res) => {
    try {
      const { id } = req.params;

      const annotation = await storage.getAnnotation(id);
      if (!annotation) {
        return res.status(404).json({ error: "Annotation not found" });
      }

      if (!annotation.isAiGenerated) {
        return res.status(400).json({ error: "Annotation is not AI-generated" });
      }

      const updated = await storage.promoteAiAnnotation(id);
      if (!updated) {
        return res.status(500).json({ error: "Failed to promote annotation" });
      }

      res.json(updated);
    } catch (error) {
      console.error("Error promoting annotation:", error);
      res.status(500).json({ error: "Failed to promote annotation" });
    }
  });

  app.get("/api/annotations/trending", async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize as string) || 20));
      
      const allAnnotations = await storage.getAllAnnotations();
      const allEpisodes = new Map<string, any>();
      const allPodcasts = new Map<string, any>();
      const allSegments = new Map<string, any>();

      for (const podcast of await storage.getAllPodcasts()) {
        allPodcasts.set(podcast.id, podcast);
      }

      // Filter for approved annotations only
      const approvedAnnotations = allAnnotations.filter(ann => ann.status === 'approved');

      for (const annotation of approvedAnnotations) {
        if (!allEpisodes.has(annotation.episodeId)) {
          const episode = await storage.getEpisode(annotation.episodeId);
          if (episode) {
            allEpisodes.set(episode.id, episode);
          }
        }
        
        if (!allSegments.has(annotation.segmentId)) {
          const segment = await storage.getSegment(annotation.segmentId);
          if (segment) {
            allSegments.set(segment.id, segment);
          }
        }
      }

      // Calculate trending score with recency boost
      const now = Date.now();
      const ONE_DAY = 24 * 60 * 60 * 1000;
      const SEVEN_DAYS = 7 * ONE_DAY;

      const calculateRecencyBoost = (createdAt: Date | string) => {
        const age = now - new Date(createdAt).getTime();
        if (age < ONE_DAY) return 5;
        if (age < SEVEN_DAYS) return 2;
        return 0;
      };

      const trending = approvedAnnotations
        .map((ann) => {
          const episode = allEpisodes.get(ann.episodeId);
          const podcast = episode ? allPodcasts.get(episode.podcastId) : undefined;
          const segment = allSegments.get(ann.segmentId);
          const text = segment?.text?.substring(ann.startOffset, ann.endOffset) || "";
          const recencyBoost = calculateRecencyBoost(ann.createdAt);
          const score = ann.upvotes * 1.0 + recencyBoost;
          
          return {
            ...ann,
            episodeTitle: episode?.title || "Unknown Episode",
            podcastTitle: podcast?.title || "Unknown Podcast",
            artworkUrl: podcast?.artworkUrl,
            text,
            score,
          };
        })
        .sort((a, b) => b.score - a.score);

      const totalCount = trending.length;
      const offset = (page - 1) * pageSize;
      const paginatedResults = trending.slice(offset, offset + pageSize);

      res.json({
        annotations: paginatedResults,
        pagination: {
          page,
          pageSize,
          totalCount,
          totalPages: Math.ceil(totalCount / pageSize),
        },
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch trending annotations" });
    }
  });

  app.get("/api/search", async (req, res) => {
    try {
      const query = (req.query.q as string || "").toLowerCase().trim();
      
      if (!query) {
        return res.json({ podcasts: [], episodes: [] });
      }

      const allPodcasts = await storage.getAllPodcasts();
      const allEpisodes = await storage.getAllEpisodes();

      const matchingPodcasts = allPodcasts.filter(podcast =>
        podcast.title.toLowerCase().includes(query) ||
        podcast.host.toLowerCase().includes(query) ||
        (podcast.description && podcast.description.toLowerCase().includes(query))
      ).slice(0, 5);

      const matchingEpisodes = allEpisodes.filter(episode =>
        episode.title.toLowerCase().includes(query) ||
        (episode.description && episode.description.toLowerCase().includes(query))
      ).slice(0, 10);

      const episodesWithPodcast = await Promise.all(
        matchingEpisodes.map(async (episode) => {
          const podcast = await storage.getPodcast(episode.podcastId);
          return {
            ...episode,
            podcastTitle: podcast?.title || "Unknown Podcast",
            artworkUrl: podcast?.artworkUrl,
          };
        })
      );

      res.json({
        podcasts: matchingPodcasts,
        episodes: episodesWithPodcast,
      });
    } catch (error) {
      res.status(500).json({ error: "Search failed" });
    }
  });

  // Annotation character limit constant
  const MAX_ANNOTATION_CHARS = 300;

  // Get annotation limits (public - for frontend config)
  app.get("/api/config/annotation-limits", async (_req, res) => {
    res.json({
      maxAnnotationChars: MAX_ANNOTATION_CHARS,
      maxSnippetChars: MAX_SNIPPET_CHARS,
    });
  });

  app.post("/api/annotations", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Check if user is banned
      const user = await storage.getUser(userId);
      if (user?.isBanned) {
        return res.status(403).json({ error: "Your account has been suspended from creating annotations" });
      }
      
      // Enforce character limit on annotation content
      const content = req.body.content;
      if (content && content.length > MAX_ANNOTATION_CHARS) {
        return res.status(400).json({ 
          error: `Annotation content exceeds maximum length of ${MAX_ANNOTATION_CHARS} characters`,
          maxLength: MAX_ANNOTATION_CHARS,
          currentLength: content.length
        });
      }

      const validated = insertAnnotationSchema.parse({
        ...req.body,
        userId,
      });
      const annotation = await storage.createAnnotation(validated);
      res.status(201).json(annotation);
    } catch (error) {
      console.error("Error creating annotation:", error);
      res.status(400).json({ error: "Invalid annotation data" });
    }
  });

  app.patch("/api/annotations/:id", isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const { content } = req.body;
      const userId = req.user?.claims?.sub;

      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      if (!content || typeof content !== "string") {
        return res.status(400).json({ error: "Content is required" });
      }

      // Enforce character limit on annotation content
      if (content.length > MAX_ANNOTATION_CHARS) {
        return res.status(400).json({ 
          error: `Annotation content exceeds maximum length of ${MAX_ANNOTATION_CHARS} characters`,
          maxLength: MAX_ANNOTATION_CHARS,
          currentLength: content.length
        });
      }

      const annotation = await storage.getAnnotation(id);
      if (!annotation) {
        return res.status(404).json({ error: "Annotation not found" });
      }

      // Allow owner or admin/moderator to edit
      const user = await storage.getUser(userId);
      const isAdminOrMod = user?.role === "admin" || user?.role === "moderator";
      if (annotation.userId !== userId && !isAdminOrMod) {
        return res.status(403).json({ error: "Not authorized to edit this annotation" });
      }

      const updated = await storage.updateAnnotation(id, content);
      res.json(updated);
    } catch (error) {
      console.error("[ERROR] Failed to update annotation:", error);
      res.status(500).json({ error: "Failed to update annotation" });
    }
  });

  app.delete("/api/annotations/:id", isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user?.claims?.sub;

      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const annotation = await storage.getAnnotation(id);
      if (!annotation) {
        return res.status(404).json({ error: "Annotation not found" });
      }

      // Allow owner or admin/moderator to delete
      const user = await storage.getUser(userId);
      const isAdminOrMod = user?.role === "admin" || user?.role === "moderator";
      if (annotation.userId !== userId && !isAdminOrMod) {
        return res.status(403).json({ error: "Not authorized to delete this annotation" });
      }

      const deleted = await storage.deleteAnnotation(id);
      if (!deleted) {
        return res.status(500).json({ error: "Failed to delete annotation" });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("[ERROR] Failed to delete annotation:", error);
      res.status(500).json({ error: "Failed to delete annotation" });
    }
  });

  // Vote on annotations (rate limited, requires auth)
  app.post("/api/annotations/:id/vote", voteRateLimiter, isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const annotationId = req.params.id;
      const { type } = req.body;
      
      if (type !== "up" && type !== "down") {
        return res.status(400).json({ error: "Invalid vote type. Must be 'up' or 'down'" });
      }

      // Check if user is banned
      const user = await storage.getUser(userId);
      if (user?.isBanned) {
        return res.status(403).json({ error: "You are banned from voting" });
      }

      // Check if annotation exists
      const annotation = await storage.getAnnotation(annotationId);
      if (!annotation) {
        return res.status(404).json({ error: "Annotation not found" });
      }

      // Get existing vote for toggle logic
      const existingVote = await storage.getUserVote(userId, annotationId);

      let updatedAnnotation;
      let userVote: "up" | "down" | null;

      if (!existingVote) {
        // No existing vote - create new
        updatedAnnotation = await storage.insertVote(userId, annotationId, type);
        userVote = type;
      } else if (existingVote.type === type) {
        // Same vote type - toggle off (remove vote)
        updatedAnnotation = await storage.deleteVote(userId, annotationId);
        userVote = null;
      } else {
        // Different vote type - switch
        updatedAnnotation = await storage.updateVote(userId, annotationId, type);
        userVote = type;
      }

      res.json({
        ...updatedAnnotation,
        userVote,
      });
    } catch (error) {
      console.error("[ERROR] Failed to vote on annotation:", error);
      res.status(500).json({ error: "Failed to vote on annotation" });
    }
  });

  // Report an annotation (authenticated users)
  app.post("/api/annotations/:id/report", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const annotationId = req.params.id;
      const { reason, details } = req.body;

      // Validate reason
      if (!reason || !reportReasons.includes(reason)) {
        return res.status(400).json({ 
          error: `Invalid reason. Must be one of: ${reportReasons.join(", ")}` 
        });
      }

      // Check if user is banned
      const user = await storage.getUser(userId);
      if (user?.isBanned) {
        return res.status(403).json({ error: "You are banned from reporting" });
      }

      // Check if annotation exists
      const annotation = await storage.getAnnotation(annotationId);
      if (!annotation) {
        return res.status(404).json({ error: "Annotation not found" });
      }

      // Prevent self-reporting
      if (annotation.userId === userId) {
        return res.status(400).json({ error: "You cannot report your own annotation" });
      }

      // Check if user already reported this annotation
      const alreadyReported = await storage.hasUserReportedAnnotation(userId, annotationId);
      if (alreadyReported) {
        return res.status(400).json({ error: "You have already reported this annotation" });
      }

      const report = await storage.createAnnotationReport({
        annotationId,
        reporterId: userId,
        reason,
        details: details || null,
        status: "pending",
      });

      res.status(201).json(report);
    } catch (error) {
      console.error("[ERROR] Failed to report annotation:", error);
      res.status(500).json({ error: "Failed to report annotation" });
    }
  });

  // Admin: Get annotation reports
  app.get("/api/admin/reports", isAuthenticated, requireAdminOrModerator, async (req, res) => {
    try {
      const { status, limit = "50", offset = "0" } = req.query;
      
      const statusFilter = status && status !== "all" && reportStatuses.includes(status as any) 
        ? status as string 
        : undefined;

      const limitNum = parseInt(limit as string, 10);
      const offsetNum = parseInt(offset as string, 10);

      const reports = await storage.getAnnotationReports({
        status: statusFilter,
        limit: limitNum,
        offset: offsetNum,
      });

      const counts = await storage.getAnnotationReportCountByStatus();
      
      const total = statusFilter 
        ? counts.find(c => c.status === statusFilter)?.count || 0
        : counts.reduce((sum, c) => sum + c.count, 0);

      res.json({ 
        reports, 
        counts,
        pagination: {
          limit: limitNum,
          offset: offsetNum,
          total,
        }
      });
    } catch (error) {
      console.error("[ERROR] Failed to get annotation reports:", error);
      res.status(500).json({ error: "Failed to get annotation reports" });
    }
  });

  // Admin: Update report status
  app.patch("/api/admin/reports/:id", isAuthenticated, requireAdminOrModerator, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.claims.sub;
      const { status, resolution } = req.body;

      if (!status || !reportStatuses.includes(status)) {
        return res.status(400).json({ 
          error: `Invalid status. Must be one of: ${reportStatuses.join(", ")}` 
        });
      }

      const report = await storage.updateAnnotationReportStatus(id, {
        status,
        reviewedBy: userId,
        resolution: resolution || undefined,
      });

      if (!report) {
        return res.status(404).json({ error: "Report not found" });
      }

      res.json(report);
    } catch (error) {
      console.error("[ERROR] Failed to update report status:", error);
      res.status(500).json({ error: "Failed to update report status" });
    }
  });

  app.post("/api/episodes/:id/generate-annotations", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { count = 5, podcastContext } = req.body;
      const userId = req.user.claims.sub;

      console.log(`[AI_ANNOTATIONS] Request received for episode: ${id}, count: ${count}, user: ${userId}`);

      const episode = await storage.getEpisode(id);
      if (!episode) {
        console.log(`[AI_ANNOTATIONS] Episode not found: ${id}`);
        return res.status(404).json({ error: "Episode not found" });
      }

      const segments = await storage.getSegmentsByEpisode(id);
      console.log(`[AI_ANNOTATIONS] Found ${segments?.length || 0} segments for episode`);
      
      if (!segments || segments.length === 0) {
        return res.status(400).json({ error: "Episode has no transcript. Generate a transcript first." });
      }

      const { annotationGenerator } = await import("./annotation-generator");
      
      console.log(`[AI_ANNOTATIONS] Generating ${count} annotations for episode: ${episode.title}`);
      
      const generatedAnnotations = await annotationGenerator.generateAnnotations(
        segments,
        episode,
        { maxAnnotations: Math.min(count, 10), podcastContext }
      );

      console.log(`[AI_ANNOTATIONS] Gemini returned ${generatedAnnotations.length} annotations`);
      
      const createdAnnotations = [];
      for (const ann of generatedAnnotations) {
        try {
          console.log(`[AI_ANNOTATIONS] Creating annotation for segment: ${ann.segmentId}, text: "${ann.text.slice(0, 50)}..."`);
          const annotation = await storage.createAnnotation({
            episodeId: id,
            segmentId: ann.segmentId,
            userId,
            text: ann.text,
            startOffset: ann.startOffset,
            endOffset: ann.endOffset,
            content: `[${ann.category}] ${ann.content}`,
            isAiGenerated: true,
            status: "approved",
          });
          console.log(`[AI_ANNOTATIONS] Created annotation: ${annotation.id}`);
          createdAnnotations.push(annotation);
        } catch (err) {
          console.error(`[AI_ANNOTATIONS] Failed to create annotation: ${err}`);
        }
      }

      console.log(`[AI_ANNOTATIONS] Successfully created ${createdAnnotations.length} annotations`);
      
      res.json({
        success: true,
        count: createdAnnotations.length,
        annotations: createdAnnotations,
      });
    } catch (error) {
      console.error("[AI_ANNOTATIONS] Error generating annotations:", error);
      res.status(500).json({ error: "Failed to generate annotations" });
    }
  });

  // Music detection endpoints
  app.get("/api/episodes/:id/music", async (req, res) => {
    try {
      const music = await storage.getMusicDetectionsByEpisode(req.params.id);
      res.json(music);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch music detections" });
    }
  });

  // Get trending/recent music across all episodes
  app.get("/api/music/trending", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const music = await storage.getTrendingMusic(Math.min(limit, 50));
      res.json(music);
    } catch (error) {
      console.error("[MUSIC_TRENDING] Error fetching trending music:", error);
      res.status(500).json({ error: "Failed to fetch trending music" });
    }
  });

  app.post("/api/episodes/:id/detect-music", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;

      const episode = await storage.getEpisode(id);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }

      if (!episode.mediaUrl) {
        return res.status(400).json({ error: "Episode has no media URL" });
      }

      // Check for existing music data
      const existingMusic = await storage.getMusicDetectionsByEpisode(id);
      const forceRedetect = req.query.force === "true";
      if (existingMusic.length > 0 && !forceRedetect) {
        return res.status(400).json({ 
          error: "Music already detected for this episode. Use ?force=true to re-detect." 
        });
      }

      // Get or create an audio source for this episode
      const sources = await storage.getEpisodeSourcesByEpisode(id);
      let audioSource = sources.find((s: { kind: string }) => s.kind === "audio");
      
      if (!audioSource) {
        // Check if a source with this URL already exists (avoid unique constraint)
        const existingByUrl = await storage.getEpisodeSourceByUrl(id, episode.mediaUrl);
        if (existingByUrl) {
          audioSource = existingByUrl;
        } else {
          // Create an audio source from the episode's mediaUrl
          audioSource = await storage.createEpisodeSource({
            episodeId: id,
            kind: "audio",
            platform: "podcast_host",
            sourceUrl: episode.mediaUrl,
            isCanonical: sources.length === 0,
            alignmentOffsetSeconds: 0,
            manuallyEdited: false,
          });
        }
      }

      // Check for existing pending/running job
      const existingJobs = await storage.getJobsByEpisodeSource(audioSource.id);
      const activeJob = existingJobs.find(
        (j: { type: string; status: string }) => j.type === "detect_music" && (j.status === "pending" || j.status === "running")
      );
      
      if (activeJob) {
        return res.json({
          success: true,
          message: "Music detection job already in progress",
          jobId: activeJob.id,
          status: activeJob.status,
        });
      }

      // Create a new music detection job
      const job = await storage.createJob({
        episodeSourceId: audioSource.id,
        type: "detect_music",
        status: "pending",
        attempts: 0,
      });
      
      console.log(`[MUSIC_DETECT] Created job ${job.id} for episode: ${episode.title}`);
      
      res.json({
        success: true,
        message: "Music detection job queued",
        jobId: job.id,
        status: "pending",
      });
    } catch (error) {
      console.error("[MUSIC_DETECT] Error queueing music detection:", error);
      res.status(500).json({ error: "Failed to queue music detection" });
    }
  });

  app.delete("/api/episodes/:id/music", isAuthenticated, async (req, res) => {
    try {
      const count = await storage.deleteMusicDetectionsForEpisode(req.params.id);
      res.json({ success: true, deleted: count });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete music detections" });
    }
  });

  // =====================
  // Sponsor Detection (Admin Only)
  // =====================
  
  // Admin: Enqueue sponsor detection job
  app.post("/api/admin/episodes/:id/detect-sponsors", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;

      const episode = await storage.getEpisode(id);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }

      // Check if episode has a transcript
      const segments = await storage.getSegmentsByEpisode(id);
      if (segments.length === 0) {
        return res.status(400).json({ error: "Episode has no transcript. Transcribe first before detecting sponsors." });
      }

      // Check for existing sponsor data
      const existingSponsors = await storage.getSponsorSegmentsByEpisode(id);
      const forceRedetect = req.query.force === "true";
      if (existingSponsors.length > 0 && !forceRedetect) {
        return res.status(400).json({ 
          error: "Sponsors already detected for this episode. Use ?force=true to re-detect." 
        });
      }

      // Get or create a source for this episode (use canonical or create one)
      const sources = await storage.getEpisodeSourcesByEpisode(id);
      let sourceForJob = sources.find((s: { isCanonical: boolean }) => s.isCanonical) || sources[0];
      
      if (!sourceForJob) {
        // Create a source from the episode's mediaUrl if available
        if (episode.mediaUrl) {
          sourceForJob = await storage.createEpisodeSource({
            episodeId: id,
            kind: "audio",
            platform: "podcast_host",
            sourceUrl: episode.mediaUrl,
            isCanonical: true,
            alignmentOffsetSeconds: 0,
            manuallyEdited: false,
          });
        } else {
          return res.status(400).json({ error: "Episode has no media source for job tracking" });
        }
      }

      // Check for existing pending/running job
      const existingJobs = await storage.getJobsByEpisodeSource(sourceForJob.id);
      const activeJob = existingJobs.find(
        (j: { type: string; status: string }) => j.type === "detect_sponsors" && (j.status === "pending" || j.status === "running")
      );
      
      if (activeJob) {
        return res.json({
          success: true,
          message: "Sponsor detection job already in progress",
          jobId: activeJob.id,
          status: activeJob.status,
        });
      }

      // Create a new sponsor detection job
      const job = await storage.createJob({
        episodeSourceId: sourceForJob.id,
        type: "detect_sponsors",
        status: "pending",
        attempts: 0,
      });
      
      console.log(`[SPONSOR_DETECT] Created job ${job.id} for episode: ${episode.title}`);
      
      res.json({
        success: true,
        message: "Sponsor detection job queued",
        jobId: job.id,
        status: "pending",
      });
    } catch (error) {
      console.error("[SPONSOR_DETECT] Error queueing sponsor detection:", error);
      res.status(500).json({ error: "Failed to queue sponsor detection" });
    }
  });

  // Admin: Enqueue narrative segment generation job
  app.post("/api/admin/episodes/:id/generate-narrative", requireAdminSessionOrKey, async (req, res) => {
    try {
      const { id } = req.params;

      const episode = await storage.getEpisode(id);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }

      // Check if episode has a transcript
      const segments = await storage.getSegmentsByEpisode(id);
      if (segments.length === 0) {
        return res.status(400).json({ error: "Episode has no transcript. Transcribe first before generating narrative." });
      }

      // Check for existing narrative segments
      const existingSegments = await storage.getEpisodeSegmentsByEpisode(id);
      const narrativeSegments = existingSegments.filter((s: any) => s.segmentType === "narrative");
      const forceRegenerate = req.query.force === "true";
      if (narrativeSegments.length > 0 && !forceRegenerate) {
        return res.status(400).json({ 
          error: `Narrative already exists (${narrativeSegments.length} segments). Use ?force=true to regenerate.`,
          existingSegments: narrativeSegments.length,
        });
      }

      // Get or create a source for this episode
      const sources = await storage.getEpisodeSourcesByEpisode(id);
      let sourceForJob = sources.find((s: { isCanonical: boolean }) => s.isCanonical) || sources[0];
      
      if (!sourceForJob) {
        if (episode.mediaUrl) {
          sourceForJob = await storage.createEpisodeSource({
            episodeId: id,
            kind: "audio",
            platform: "podcast_host",
            sourceUrl: episode.mediaUrl,
            isCanonical: true,
            alignmentOffsetSeconds: 0,
            manuallyEdited: false,
          });
        } else {
          return res.status(400).json({ error: "Episode has no media source for job tracking" });
        }
      }

      // Check for existing pending/running job
      const existingJobs = await storage.getJobsByEpisodeSource(sourceForJob.id);
      const activeJob = existingJobs.find(
        (j: { type: string; status: string }) => j.type === "generate_narrative_segments" && (j.status === "pending" || j.status === "running")
      );
      
      if (activeJob) {
        return res.json({
          success: true,
          message: "Narrative generation job already in progress",
          jobId: activeJob.id,
          status: activeJob.status,
        });
      }

      // Create a new narrative generation job
      const job = await storage.createJob({
        episodeSourceId: sourceForJob.id,
        type: "generate_narrative_segments",
        status: "pending",
        attempts: 0,
      });
      
      console.log(`[NARRATIVE_GEN] Created job ${job.id} for episode: ${episode.title}`);
      
      res.json({
        success: true,
        message: "Narrative generation job queued",
        jobId: job.id,
        status: "pending",
      });
    } catch (error) {
      console.error("[NARRATIVE_GEN] Error queueing narrative generation:", error);
      res.status(500).json({ error: "Failed to queue narrative generation" });
    }
  });

  // Public: Get sponsor segments for an episode
  app.get("/api/episodes/:id/sponsors", async (req, res) => {
    try {
      const { id } = req.params;
      
      const episode = await storage.getEpisode(id);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }

      const sponsors = await storage.getSponsorSegmentsByEpisode(id);
      
      res.json({
        sponsors: sponsors.map(s => ({
          id: s.id,
          startTime: s.startTime,
          endTime: s.endTime,
          brand: s.brand,
          confidence: s.confidence,
          excerpt: s.excerpt,
        })),
      });
    } catch (error) {
      console.error("[SPONSORS] Error fetching sponsors:", error);
      res.status(500).json({ error: "Failed to fetch sponsor segments" });
    }
  });

  // =====================
  // Claims Detection (Admin Only)
  // =====================
  
  // Admin: Enqueue claims detection job
  app.post("/api/admin/episodes/:id/detect-claims", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;

      const episode = await storage.getEpisode(id);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }

      // Check if episode has a transcript
      const segments = await storage.getSegmentsByEpisode(id);
      if (segments.length === 0) {
        return res.status(400).json({ error: "Episode has no transcript. Transcribe first before detecting claims." });
      }

      // Check for existing claims data
      const existingClaims = await storage.getClaimsByEpisodeId(id);
      const forceRedetect = req.query.force === "true";
      if (existingClaims.length > 0 && !forceRedetect) {
        return res.status(400).json({ 
          error: "Claims already detected for this episode. Use ?force=true to re-detect." 
        });
      }

      // Get or create a source for this episode (use canonical or create one)
      const sources = await storage.getEpisodeSourcesByEpisode(id);
      let sourceForJob = sources.find((s: { isCanonical: boolean }) => s.isCanonical) || sources[0];
      
      if (!sourceForJob) {
        // Create a source from the episode's mediaUrl if available
        if (episode.mediaUrl) {
          sourceForJob = await storage.createEpisodeSource({
            episodeId: id,
            kind: "audio",
            platform: "podcast_host",
            sourceUrl: episode.mediaUrl,
            isCanonical: true,
            alignmentOffsetSeconds: 0,
            manuallyEdited: false,
          });
        } else {
          return res.status(400).json({ error: "Episode has no media source for job tracking" });
        }
      }

      // Check for existing pending/running job
      const existingJobs = await storage.getJobsByEpisodeSource(sourceForJob.id);
      const activeJob = existingJobs.find(
        (j: { type: string; status: string }) => j.type === "detect_claims" && (j.status === "pending" || j.status === "running")
      );
      
      if (activeJob) {
        return res.json({
          success: true,
          message: "Claims detection job already in progress",
          jobId: activeJob.id,
          status: activeJob.status,
        });
      }

      // Create a new claims detection job
      const job = await storage.createJob({
        episodeSourceId: sourceForJob.id,
        type: "detect_claims",
        status: "pending",
        attempts: 0,
      });
      
      console.log(`[CLAIMS_DETECT] Created job ${job.id} for episode: ${episode.title}`);
      
      res.json({
        success: true,
        message: "Claims detection job queued",
        jobId: job.id,
        status: "pending",
      });
    } catch (error) {
      console.error("[CLAIMS_DETECT] Error queueing claims detection:", error);
      res.status(500).json({ error: "Failed to queue claims detection" });
    }
  });

  // Public: Get claims for an episode
  app.get("/api/episodes/:id/claims", async (req, res) => {
    try {
      const { id } = req.params;
      
      const episode = await storage.getEpisode(id);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }

      const claims = await storage.getClaimsByEpisodeId(id);
      
      res.json({
        claims: claims.map(c => ({
          id: c.id,
          startTime: c.startTime,
          endTime: c.endTime,
          claimText: c.claimText,
          claimType: c.claimType,
          confidence: c.confidence,
        })),
      });
    } catch (error) {
      console.error("[CLAIMS] Error fetching claims:", error);
      res.status(500).json({ error: "Failed to fetch claims" });
    }
  });

  // =====================
  // Semantic Analysis (Admin Only)
  // =====================
  
  // Admin: Enqueue semantic analysis job
  app.post("/api/admin/episodes/:id/semantic-analyze", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;

      const episode = await storage.getEpisode(id);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }

      // Check if episode has a transcript
      const segments = await storage.getSegmentsByEpisode(id);
      if (segments.length === 0) {
        return res.status(400).json({ error: "Episode has no transcript. Transcribe first before semantic analysis." });
      }

      // Check for existing semantic segments
      const existingSegments = await storage.getSemanticSegmentsByEpisode(id);
      const forceReanalyze = req.query.force === "true";
      if (existingSegments.length > 0 && !forceReanalyze) {
        return res.status(400).json({ 
          error: "Semantic segments already exist for this episode. Use ?force=true to re-analyze." 
        });
      }

      // Get or create a source for this episode (use canonical or create one)
      const sources = await storage.getEpisodeSourcesByEpisode(id);
      let sourceForJob = sources.find((s: { isCanonical: boolean }) => s.isCanonical) || sources[0];
      
      if (!sourceForJob) {
        // Create a source from the episode's mediaUrl if available
        if (episode.mediaUrl) {
          sourceForJob = await storage.createEpisodeSource({
            episodeId: id,
            kind: "audio",
            platform: "podcast_host",
            sourceUrl: episode.mediaUrl,
            isCanonical: true,
            alignmentOffsetSeconds: 0,
            manuallyEdited: false,
          });
        } else {
          return res.status(400).json({ error: "Episode has no media source for job tracking" });
        }
      }

      // Check for existing pending/running job
      const existingJobs = await storage.getJobsByEpisodeSource(sourceForJob.id);
      const activeJob = existingJobs.find(
        (j: { type: string; status: string }) => j.type === "semantic_analyze" && (j.status === "pending" || j.status === "running")
      );
      
      if (activeJob) {
        return res.json({
          success: true,
          message: "Semantic analysis job already in progress",
          jobId: activeJob.id,
          status: activeJob.status,
        });
      }

      // Create a new semantic analysis job
      const job = await storage.createJob({
        episodeSourceId: sourceForJob.id,
        type: "semantic_analyze",
        status: "pending",
        attempts: 0,
      });
      
      console.log(`[SEMANTIC_ANALYZE] Created job ${job.id} for episode: ${episode.title}`);
      
      res.json({
        success: true,
        message: "Semantic analysis job queued",
        jobId: job.id,
        status: "pending",
      });
    } catch (error) {
      console.error("[SEMANTIC_ANALYZE] Error queueing semantic analysis:", error);
      res.status(500).json({ error: "Failed to queue semantic analysis" });
    }
  });

  // Admin: Detect viral moments for an episode
  app.post("/api/admin/episodes/:id/detect-viral-moments", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const forceRerun = req.query.force === "true";

      const episode = await storage.getEpisode(id);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }

      // Check if episode has a transcript
      const segments = await storage.getSegmentsByEpisode(id);
      if (segments.length === 0) {
        return res.status(400).json({ error: "Episode has no transcript. Transcribe first before viral moment detection." });
      }

      // Check for existing viral moments
      const existingMoments = await storage.getViralMomentsByEpisode(id);
      if (existingMoments.length > 0 && !forceRerun) {
        return res.status(400).json({ 
          error: "Viral moments already exist for this episode. Use ?force=true to re-detect.",
          existingCount: existingMoments.length
        });
      }

      // If forcing, delete existing moments
      if (forceRerun && existingMoments.length > 0) {
        await storage.deleteViralMomentsByEpisode(id);
        console.log(`[VIRAL] Deleted ${existingMoments.length} existing moments for re-detection`);
      }

      // Sort segments for detection
      const sortedSegments = segments.sort((a, b) => a.startTime - b.startTime);

      // Get podcast info for better context
      const podcast = episode.podcastId ? await storage.getPodcast(episode.podcastId) : null;

      // Import and run viral moment detection using Claude (with Gemini fallback)
      const { findViralMomentsWithClaude, convertToInsertMoments } = await import("./services/claude-viral-service");
      const { findViralMoments, convertToInsertViralMoment } = await import("./services/viral-moment-service");
      const { ClaudeError } = await import("./ai/claudeClient");

      let insertMoments: any[];
      try {
        console.log(`[VIRAL] Using Claude for viral moment detection`);
        const claudeMoments = await findViralMomentsWithClaude(sortedSegments, {
          title: episode.title || "Untitled",
          podcastTitle: podcast?.title,
        });
        insertMoments = convertToInsertMoments(id, claudeMoments);
        console.log(`[VIRAL] Claude detected ${insertMoments.length} viral moments`);
      } catch (error) {
        const isTransient = error instanceof ClaudeError && error.transient;
        if (isTransient) {
          console.log(`[VIRAL] Claude transient error, falling back to Gemini`);
          const geminiMoments = await findViralMoments(sortedSegments, { title: episode.title || "Untitled" });
          insertMoments = geminiMoments.map((m, idx) => convertToInsertViralMoment(id, m, idx));
          console.log(`[VIRAL] Gemini detected ${insertMoments.length} viral moments`);
        } else {
          throw error;
        }
      }

      const savedMoments = await storage.createViralMoments(insertMoments);
      console.log(`[VIRAL] Saved ${savedMoments.length} viral moments for: ${episode.title}`);

      res.json({
        success: true,
        message: `Detected ${savedMoments.length} viral moments`,
        moments: savedMoments,
      });
    } catch (error) {
      console.error("[VIRAL] Error detecting viral moments:", error);
      res.status(500).json({ error: "Failed to detect viral moments" });
    }
  });

  // Admin: Queue clip extraction jobs for viral moments
  app.post("/api/admin/viral-moments/extract-clips", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { momentIds, limit = 10 } = req.body;

      let momentsToProcess: any[] = [];

      if (momentIds && Array.isArray(momentIds)) {
        // Extract specific moments
        for (const id of momentIds) {
          const moment = await storage.getViralMoment(id);
          if (moment && moment.clipStatus === "pending") {
            momentsToProcess.push(moment);
          }
        }
      } else {
        // Get top pending moments
        momentsToProcess = await storage.getViralMomentsPendingExtraction(Math.min(limit, 50));
      }

      if (momentsToProcess.length === 0) {
        return res.json({ 
          success: true, 
          message: "No pending viral moments to process",
          jobsCreated: 0 
        });
      }

      // Create jobs for each moment
      const jobsCreated: string[] = [];
      const skippedNoSource: string[] = [];
      
      for (const moment of momentsToProcess) {
        // Check if episode has YouTube source
        const sources = await storage.getEpisodeSourcesByEpisode(moment.episodeId);
        const youtubeSource = sources.find((s: any) => s.platform === "youtube" && s.sourceUrl);
        
        if (!youtubeSource) {
          // Mark as failed so it doesn't get requeued
          await storage.updateViralMomentClipStatus(moment.id, "failed", null, "No YouTube source available");
          skippedNoSource.push(moment.id);
          console.log(`[CLIP] Marked moment ${moment.id} as failed - no YouTube source`);
          continue;
        }

        // Create the extraction job with payload as object (Drizzle handles JSONB)
        const job = await storage.createJob({
          type: "extract_clip",
          episodeSourceId: youtubeSource.id,
          pipelineStage: "INTEL",
          result: { viralMomentId: moment.id },
        });

        jobsCreated.push(job.id);
        console.log(`[CLIP] Created extraction job ${job.id} for moment ${moment.id}`);
      }

      res.json({
        success: true,
        message: `Created ${jobsCreated.length} clip extraction jobs`,
        jobsCreated: jobsCreated.length,
        jobIds: jobsCreated,
      });
    } catch (error) {
      console.error("[CLIP] Error queueing clip extraction:", error);
      res.status(500).json({ error: "Failed to queue clip extraction jobs" });
    }
  });

  // Admin: Queue caption burning jobs for viral moments with extracted clips
  app.post("/api/admin/viral-moments/burn-captions", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { momentIds, limit = 10, style } = req.body;

      let momentsToProcess: any[] = [];

      if (momentIds && Array.isArray(momentIds)) {
        for (const id of momentIds) {
          const moment = await storage.getViralMoment(id);
          if (moment && moment.clipStatus === "ready" && !moment.captionedPath) {
            momentsToProcess.push(moment);
          }
        }
      } else {
        momentsToProcess = await storage.getViralMomentsPendingCaptions(Math.min(limit, 50));
      }

      if (momentsToProcess.length === 0) {
        return res.json({ 
          success: true, 
          message: "No moments pending caption burn",
          jobsCreated: 0 
        });
      }

      const jobsCreated: string[] = [];
      
      for (const moment of momentsToProcess) {
        const sources = await storage.getEpisodeSourcesByEpisode(moment.episodeId);
        const youtubeSource = sources.find((s: any) => s.platform === "youtube" && s.sourceUrl);

        const job = await storage.createJob({
          type: "burn_captions",
          episodeSourceId: youtubeSource?.id || null,
          pipelineStage: "INTEL",
          result: { viralMomentId: moment.id, style: style || {} },
        });

        jobsCreated.push(job.id);
        console.log(`[CAPTIONS] Created caption burn job ${job.id} for moment ${moment.id}`);
      }

      res.json({
        success: true,
        message: `Created ${jobsCreated.length} caption burn jobs`,
        jobsCreated: jobsCreated.length,
        jobIds: jobsCreated,
      });
    } catch (error) {
      console.error("[CAPTIONS] Error queueing caption burn:", error);
      res.status(500).json({ error: "Failed to queue caption burn jobs" });
    }
  });

  // Admin: Queue optimization jobs for viral moments with captions
  app.post("/api/admin/viral-moments/optimize-clips", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { momentIds, limit = 10, platform = "tiktok" } = req.body;

      let momentsToProcess: any[] = [];

      if (momentIds && Array.isArray(momentIds)) {
        for (const id of momentIds) {
          const moment = await storage.getViralMoment(id);
          if (moment && moment.captionedPath && !moment.optimizedPath) {
            momentsToProcess.push(moment);
          }
        }
      } else {
        const allMoments = await storage.getViralMomentsReadyForPosting(Math.min(limit, 50));
        momentsToProcess = allMoments.filter(m => m.captionedPath && !m.optimizedPath);
      }

      if (momentsToProcess.length === 0) {
        return res.json({ 
          success: true, 
          message: "No moments pending optimization",
          jobsCreated: 0 
        });
      }

      const jobsCreated: string[] = [];
      
      for (const moment of momentsToProcess) {
        const job = await storage.createJob({
          type: "optimize_clip",
          episodeSourceId: null,
          pipelineStage: "INTEL",
          result: { viralMomentId: moment.id, platform },
        });

        jobsCreated.push(job.id);
        console.log(`[OPTIMIZE] Created optimize job ${job.id} for moment ${moment.id}`);
      }

      res.json({
        success: true,
        message: `Created ${jobsCreated.length} optimization jobs`,
        jobsCreated: jobsCreated.length,
        jobIds: jobsCreated,
      });
    } catch (error) {
      console.error("[OPTIMIZE] Error queueing optimization:", error);
      res.status(500).json({ error: "Failed to queue optimization jobs" });
    }
  });

  // Admin: Run full clip pipeline for an episode
  app.post("/api/admin/episodes/:id/run-clip-pipeline", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { maxClips = 10, platform = "tiktok", skipOptimize = false } = req.body;

      const episode = await storage.getEpisode(id);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }

      const sources = await storage.getEpisodeSourcesByEpisode(id);
      const youtubeSource = sources.find((s: any) => s.platform === "youtube" && s.sourceUrl);

      const job = await storage.createJob({
        type: "run_clip_pipeline",
        episodeSourceId: youtubeSource?.id || null,
        pipelineStage: "INTEL",
        result: { episodeId: id, maxClips, platform, skipOptimize },
      });

      console.log(`[PIPELINE] Created clip pipeline job ${job.id} for episode ${id}`);

      res.json({
        success: true,
        message: "Clip pipeline job created",
        jobId: job.id,
      });
    } catch (error) {
      console.error("[PIPELINE] Error creating pipeline job:", error);
      res.status(500).json({ error: "Failed to create pipeline job" });
    }
  });

  // Admin: Run clip pipeline for multiple episodes
  app.post("/api/admin/clip-pipeline/batch", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { episodeIds, maxClipsPerEpisode = 5, platform = "tiktok" } = req.body;

      if (!episodeIds || !Array.isArray(episodeIds) || episodeIds.length === 0) {
        return res.status(400).json({ error: "episodeIds array required" });
      }

      const jobsCreated: string[] = [];

      for (const episodeId of episodeIds.slice(0, 20)) {
        const episode = await storage.getEpisode(episodeId);
        if (!episode) continue;

        const sources = await storage.getEpisodeSourcesByEpisode(episodeId);
        const youtubeSource = sources.find((s: any) => s.platform === "youtube" && s.sourceUrl);

        const job = await storage.createJob({
          type: "run_clip_pipeline",
          episodeSourceId: youtubeSource?.id || null,
          pipelineStage: "INTEL",
          result: { episodeId, maxClips: maxClipsPerEpisode, platform },
        });

        jobsCreated.push(job.id);
        console.log(`[PIPELINE] Created batch pipeline job ${job.id} for episode ${episodeId}`);
      }

      res.json({
        success: true,
        message: `Created ${jobsCreated.length} pipeline jobs`,
        jobsCreated: jobsCreated.length,
        jobIds: jobsCreated,
      });
    } catch (error) {
      console.error("[PIPELINE] Error creating batch pipeline jobs:", error);
      res.status(500).json({ error: "Failed to create batch pipeline jobs" });
    }
  });

  // Admin: Get clip generation run history
  app.get("/api/admin/clip-generation-runs", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const runs = await storage.getClipGenerationRuns(limit);
      res.json(runs);
    } catch (error) {
      console.error("[PIPELINE] Error fetching generation runs:", error);
      res.status(500).json({ error: "Failed to fetch generation runs" });
    }
  });

  // Admin: Get viral moments ready for posting
  // Admin: Get clips that are ready for caption burning (has video, no captions yet)
  app.get("/api/admin/viral-moments/pending-captions", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const moments = await storage.getViralMomentsPendingCaptions(limit);
      // Enrich with episode data
      const enrichedMoments = await Promise.all(
        moments.map(async (moment) => {
          const episode = await storage.getEpisode(moment.episodeId);
          return {
            ...moment,
            episodeTitle: episode?.title || "Unknown Episode",
          };
        })
      );
      res.json(enrichedMoments);
    } catch (error) {
      console.error("[PIPELINE] Error fetching moments pending captions:", error);
      res.status(500).json({ error: "Failed to fetch moments" });
    }
  });

  app.get("/api/admin/viral-moments/ready-for-posting", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const moments = await storage.getViralMomentsReadyForPosting(limit);
      res.json(moments);
    } catch (error) {
      console.error("[PIPELINE] Error fetching moments ready for posting:", error);
      res.status(500).json({ error: "Failed to fetch moments" });
    }
  });

  // Admin: Get posted viral moments (already marked as posted)
  app.get("/api/admin/viral-moments/posted", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const moments = await storage.getViralMomentsPosted(limit);
      res.json(moments);
    } catch (error) {
      console.error("[PIPELINE] Error fetching posted moments:", error);
      res.status(500).json({ error: "Failed to fetch posted moments" });
    }
  });

  // Admin: Serve video preview for clips (captioned or raw)
  app.get("/api/admin/viral-moments/:id/preview", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const moment = await storage.getViralMoment(req.params.id);
      if (!moment) {
        return res.status(404).json({ error: "Moment not found" });
      }

      const videoPath = moment.captionedPath || moment.videoPath;
      if (!videoPath) {
        return res.status(404).json({ error: "No video available for this moment" });
      }

      const fs = await import("fs");

      if (!fs.existsSync(videoPath)) {
        return res.status(404).json({ error: "Video file not found on disk" });
      }

      const stat = fs.statSync(videoPath);
      const fileSize = stat.size;
      const range = req.headers.range;

      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = end - start + 1;
        const file = fs.createReadStream(videoPath, { start, end });
        res.writeHead(206, {
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunksize,
          "Content-Type": "video/mp4",
        });
        file.pipe(res);
      } else {
        res.writeHead(200, {
          "Content-Length": fileSize,
          "Content-Type": "video/mp4",
        });
        fs.createReadStream(videoPath).pipe(res);
      }
    } catch (error) {
      console.error("[PREVIEW] Error serving video:", error);
      res.status(500).json({ error: "Failed to serve video" });
    }
  });

  // Admin API health check - validates API key and returns server status
  // Used by local scripts to verify connectivity and authentication
  app.get("/api/admin/health", requireAdminSessionOrKey, async (req, res) => {
    res.json({ 
      status: "ok", 
      timestamp: new Date().toISOString(),
      authMethod: (req as any).authMethod || "unknown"
    });
  });

  // Admin: Get all viral moments including pending clips (for upload workflow)
  // Includes both pending AND failed clips so users can retry uploads
  // Supports both session auth (browser) and API key auth (local scripts via X-Admin-API-Key header)
  app.get("/api/admin/viral-moments/pending-clips", requireAdminSessionOrKey, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      // Get all moments needing clips (pending AND failed for retry)
      const allMoments = await storage.getAllViralMomentsNeedingClips(limit);
      
      // Enrich with episode data (especially YouTube URL from episode_sources)
      const enrichedMoments = await Promise.all(
        allMoments.map(async (moment) => {
          const episode = await storage.getEpisode(moment.episodeId);
          
          // Get video URL from episode_sources (where YouTube URLs are stored)
          let videoUrl = null;
          if (episode) {
            const sources = await storage.getEpisodeSourcesByEpisode(episode.id);
            const videoSource = sources.find(s => s.kind === "video" && s.platform === "youtube");
            videoUrl = videoSource?.sourceUrl || null;
          }
          
          return {
            ...moment,
            episodeTitle: episode?.title || "Unknown Episode",
            videoUrl,
            podcastId: episode?.podcastId || null,
          };
        })
      );
      
      res.json(enrichedMoments);
    } catch (error) {
      console.error("[PIPELINE] Error fetching moments pending clips:", error);
      res.status(500).json({ error: "Failed to fetch moments" });
    }
  });

  // Admin: Update viral moment posting status (mark as posted)
  app.patch("/api/admin/viral-moments/:id/posting", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { postingStatus, postUrl, description, hashtags } = req.body;

      const moment = await storage.getViralMoment(id);
      if (!moment) {
        return res.status(404).json({ error: "Viral moment not found" });
      }

      const updates: any = {};
      if (postingStatus) updates.postingStatus = postingStatus;
      if (postUrl) updates.postUrl = postUrl;
      if (description) updates.description = description;
      if (hashtags) updates.hashtags = hashtags;
      if (postingStatus === "posted") updates.postedAt = new Date();

      const updated = await storage.updateViralMomentPosting(id, updates);
      res.json(updated);
    } catch (error) {
      console.error("[PIPELINE] Error updating posting status:", error);
      res.status(500).json({ error: "Failed to update posting status" });
    }
  });

  // Admin: Update viral moment performance metrics
  app.patch("/api/admin/viral-moments/:id/metrics", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { views, likes, comments, shares } = req.body;

      const moment = await storage.getViralMoment(id);
      if (!moment) {
        return res.status(404).json({ error: "Viral moment not found" });
      }

      const updated = await storage.updateViralMomentMetrics(id, { views, likes, comments, shares });
      res.json(updated);
    } catch (error) {
      console.error("[PIPELINE] Error updating metrics:", error);
      res.status(500).json({ error: "Failed to update metrics" });
    }
  });

  // Admin: Get semantic analysis status for an episode
  app.get("/api/admin/episodes/:id/semantic-status", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;

      const episode = await storage.getEpisode(id);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }

      // Get semantic segment count
      const semanticSegments = await storage.getSemanticSegmentsByEpisode(id);
      const semanticSegmentCount = semanticSegments.length;
      const hasSemanticSegments = semanticSegmentCount > 0;

      // Check for active job
      const sources = await storage.getEpisodeSourcesByEpisode(id);
      let jobStatus: "none" | "pending" | "running" = "none";
      
      for (const source of sources) {
        const jobs = await storage.getJobsByEpisodeSource(source.id);
        const activeJob = jobs.find(
          (j: { type: string; status: string }) => 
            j.type === "semantic_analyze" && (j.status === "pending" || j.status === "running")
        );
        if (activeJob) {
          jobStatus = activeJob.status as "pending" | "running";
          break;
        }
      }

      // Check if episode has transcript (required for semantic analysis)
      const transcriptSegments = await storage.getSegmentsByEpisode(id);
      const hasTranscript = transcriptSegments.length > 0;

      res.json({
        hasSemanticSegments,
        semanticSegmentCount,
        jobStatus,
        hasTranscript,
      });
    } catch (error) {
      console.error("[SEMANTIC_STATUS] Error fetching semantic status:", error);
      res.status(500).json({ error: "Failed to fetch semantic status" });
    }
  });

  // Admin: Get AI pipeline health status for an episode
  app.get("/api/admin/episodes/:id/ai-health", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;

      const episode = await storage.getEpisode(id);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }

      // Get all sources for this episode
      const sources = await storage.getEpisodeSourcesByEpisode(id);
      
      // Define the AI pipeline tasks we want to track
      const pipelineJobs = [
        { type: "episode_import", label: "Episode Import", stage: "INGEST" },
        { type: "episode_transcript", label: "Transcription", stage: "INGEST" },
        { type: "youtube_transcript", label: "YouTube Captions", stage: "INGEST" },
        { type: "transcribe", label: "AssemblyAI Transcription", stage: "INGEST" },
        { type: "episode_annotate", label: "AI Annotations", stage: "INTEL" },
        { type: "detect_sponsors", label: "Sponsor Detection", stage: "INTEL" },
        { type: "detect_claims", label: "Claims Detection", stage: "INTEL" },
        { type: "extract_statements", label: "Statement Extraction", stage: "INTEL" },
        { type: "classify_statements", label: "Statement Classification", stage: "INTEL" },
        { type: "link_entities", label: "Entity Linking", stage: "INTEL" },
        { type: "integrity_score", label: "Integrity Scoring", stage: "INTEL" },
        { type: "embed_statements", label: "Semantic Embeddings", stage: "INTEL" },
      ];

      // Collect all jobs from all sources
      const allJobs: Array<{
        id: string;
        type: string;
        status: string;
        attempts: number;
        lastError: string | null;
        pipelineStage: string | null;
        createdAt: Date;
        updatedAt: Date;
      }> = [];
      
      for (const source of sources) {
        const jobs = await storage.getJobsByEpisodeSource(source.id);
        allJobs.push(...jobs);
      }

      // Build status for each pipeline task
      const healthTasks = pipelineJobs.map(task => {
        const relatedJobs = allJobs.filter(j => j.type === task.type);
        
        // Find the most relevant job (latest, or prioritize running/pending)
        const latestJob = relatedJobs.sort((a, b) => {
          // Running/pending first
          if (a.status === "running" || a.status === "pending") return -1;
          if (b.status === "running" || b.status === "pending") return 1;
          // Then by most recent
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        })[0];

        let status: "not_started" | "pending" | "running" | "done" | "error" = "not_started";
        let lastError: string | null = null;
        let attempts = 0;

        if (latestJob) {
          status = latestJob.status as typeof status;
          lastError = latestJob.lastError;
          attempts = latestJob.attempts;
        }

        return {
          type: task.type,
          label: task.label,
          stage: task.stage,
          status,
          lastError,
          attempts,
          jobCount: relatedJobs.length,
        };
      });

      // Calculate summary
      const summary = {
        total: healthTasks.length,
        done: healthTasks.filter(t => t.status === "done").length,
        pending: healthTasks.filter(t => t.status === "pending").length,
        running: healthTasks.filter(t => t.status === "running").length,
        error: healthTasks.filter(t => t.status === "error").length,
        notStarted: healthTasks.filter(t => t.status === "not_started").length,
      };

      res.json({
        episodeId: id,
        episodeTitle: episode.title,
        tasks: healthTasks,
        summary,
      });
    } catch (error) {
      console.error("[AI_HEALTH] Error fetching AI health status:", error);
      res.status(500).json({ error: "Failed to fetch AI health status" });
    }
  });

  // Admin: Bulk enqueue semantic analysis for multiple episodes (max 100)
  app.post("/api/admin/episodes/semantic-analyze-bulk", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const bodySchema = z.object({
        episodeIds: z.array(z.string()).min(1).max(100),
        force: z.boolean().optional().default(false),
      });
      
      const { episodeIds, force } = bodySchema.parse(req.body);
      
      const results: Array<{ episodeId: string; success: boolean; message: string; jobId?: string }> = [];
      
      for (const episodeId of episodeIds) {
        try {
          const episode = await storage.getEpisode(episodeId);
          if (!episode) {
            results.push({ episodeId, success: false, message: "Episode not found" });
            continue;
          }

          // Check for transcript
          const segments = await storage.getSegmentsByEpisode(episodeId);
          if (segments.length === 0) {
            results.push({ episodeId, success: false, message: "No transcript" });
            continue;
          }

          // Check for existing semantic segments
          const existingSegments = await storage.getSemanticSegmentsByEpisode(episodeId);
          if (existingSegments.length > 0 && !force) {
            results.push({ episodeId, success: false, message: "Already has segments (use force)" });
            continue;
          }

          // Get or create a source for this episode
          const sources = await storage.getEpisodeSourcesByEpisode(episodeId);
          let sourceForJob = sources.find((s: { isCanonical: boolean }) => s.isCanonical) || sources[0];
          
          if (!sourceForJob && episode.mediaUrl) {
            sourceForJob = await storage.createEpisodeSource({
              episodeId,
              kind: "audio",
              platform: "podcast_host",
              sourceUrl: episode.mediaUrl,
              isCanonical: true,
              alignmentOffsetSeconds: 0,
              manuallyEdited: false,
            });
          }
          
          if (!sourceForJob) {
            results.push({ episodeId, success: false, message: "No media source" });
            continue;
          }

          // Check for existing active job
          const existingJobs = await storage.getJobsByEpisodeSource(sourceForJob.id);
          const activeJob = existingJobs.find(
            (j: { type: string; status: string }) => j.type === "semantic_analyze" && (j.status === "pending" || j.status === "running")
          );
          
          if (activeJob) {
            results.push({ episodeId, success: true, message: "Job already in progress", jobId: activeJob.id });
            continue;
          }

          // Create new job
          const job = await storage.createJob({
            episodeSourceId: sourceForJob.id,
            type: "semantic_analyze",
            status: "pending",
            attempts: 0,
          });
          
          results.push({ episodeId, success: true, message: "Job queued", jobId: job.id });
        } catch (err: any) {
          results.push({ episodeId, success: false, message: err.message || "Unknown error" });
        }
      }

      const successCount = results.filter(r => r.success).length;
      console.log(`[SEMANTIC_ANALYZE_BULK] Queued ${successCount}/${episodeIds.length} jobs`);
      
      res.json({
        success: true,
        totalRequested: episodeIds.length,
        successCount,
        failedCount: episodeIds.length - successCount,
        results,
      });
    } catch (error) {
      console.error("[SEMANTIC_ANALYZE_BULK] Error:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: "Failed to bulk queue semantic analysis" });
    }
  });

  // =====================
  // Episode Visibility & Batch Jobs
  // =====================

  // Admin: Get episode inventory with counts
  app.get("/api/admin/episodes/inventory", requireAdminSessionOrKey, async (req, res) => {
    try {
      const inventory = await storage.getEpisodeInventory();
      res.json({
        episodes: inventory,
        count: inventory.length,
      });
    } catch (error) {
      console.error("[INVENTORY] Error fetching episode inventory:", error);
      res.status(500).json({ error: "Failed to fetch episode inventory" });
    }
  });

  // Admin: Update episode visibility tier
  app.patch("/api/admin/episodes/:id/visibility", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const bodySchema = z.object({
        visibility: z.enum(["featured", "supporting", "backlog"]),
      });
      
      const { visibility } = bodySchema.parse(req.body);
      
      const episode = await storage.getEpisode(id);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }

      await storage.updateEpisodeVisibility(id, visibility);
      
      console.log(`[VISIBILITY] Updated episode ${id} to ${visibility}`);
      
      res.json({
        success: true,
        episodeId: id,
        visibility,
      });
    } catch (error) {
      console.error("[VISIBILITY] Error updating visibility:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: "Failed to update episode visibility" });
    }
  });

  // Admin: Bulk update episode visibility
  app.post("/api/admin/episodes/batch-visibility", requireAdminSessionOrKey, async (req, res) => {
    try {
      const bodySchema = z.object({
        episodeIds: z.array(z.string()).min(1).max(100),
        visibility: z.enum(["featured", "supporting", "backlog"]),
      });
      
      const { episodeIds, visibility } = bodySchema.parse(req.body);
      
      let successCount = 0;
      for (const episodeId of episodeIds) {
        try {
          await storage.updateEpisodeVisibility(episodeId, visibility);
          successCount++;
        } catch {
          // Skip failed updates
        }
      }
      
      console.log(`[BATCH_VISIBILITY] Updated ${successCount}/${episodeIds.length} episodes to ${visibility}`);
      
      res.json({
        success: true,
        visibility,
        updated: successCount,
        total: episodeIds.length,
      });
    } catch (error) {
      console.error("[BATCH_VISIBILITY] Error:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: "Failed to batch update visibility" });
    }
  });

  // Admin: Batch enqueue key moments jobs for eligible episodes
  app.post("/api/admin/episodes/batch-key-moments", requireAdminSessionOrKey, async (req, res) => {
    try {
      const bodySchema = z.object({
        visibility: z.enum(["featured", "supporting"]).optional(),
        limit: z.number().int().min(1).max(100).optional().default(50),
      });
      
      const { visibility, limit } = bodySchema.parse(req.body);
      
      // Get eligible episodes: transcriptStatus=ready, claim_count>=10, no moments yet
      const eligible = await storage.getEpisodesForKeyMoments(visibility, limit);
      
      const results: Array<{ episodeId: string; success: boolean; message: string; jobId?: string }> = [];
      
      for (const ep of eligible) {
        try {
          // Get or create a source for this episode
          const sources = await storage.getEpisodeSourcesByEpisode(ep.id);
          let sourceForJob = sources.find((s: { isCanonical: boolean }) => s.isCanonical) || sources[0];
          
          if (!sourceForJob && ep.mediaUrl) {
            sourceForJob = await storage.createEpisodeSource({
              episodeId: ep.id,
              kind: "audio",
              platform: "podcast_host",
              sourceUrl: ep.mediaUrl,
              isCanonical: true,
              alignmentOffsetSeconds: 0,
              manuallyEdited: false,
            });
          }
          
          if (!sourceForJob) {
            results.push({ episodeId: ep.id, success: false, message: "No media source" });
            continue;
          }

          // Check for existing active job
          const existingJobs = await storage.getJobsByEpisodeSource(sourceForJob.id);
          const activeJob = existingJobs.find(
            (j: { type: string; status: string }) => j.type === "generate_key_moments" && (j.status === "pending" || j.status === "running")
          );
          
          if (activeJob) {
            results.push({ episodeId: ep.id, success: true, message: "Job already in progress", jobId: activeJob.id });
            continue;
          }

          // Create new job
          const job = await storage.createJob({
            episodeSourceId: sourceForJob.id,
            type: "generate_key_moments",
            status: "pending",
            attempts: 0,
          });
          
          results.push({ episodeId: ep.id, success: true, message: "Job queued", jobId: job.id });
        } catch (err: any) {
          results.push({ episodeId: ep.id, success: false, message: err.message || "Unknown error" });
        }
      }

      const successCount = results.filter(r => r.success).length;
      console.log(`[BATCH_KEY_MOMENTS] Queued ${successCount}/${eligible.length} jobs`);
      
      res.json({
        success: true,
        eligibleCount: eligible.length,
        successCount,
        failedCount: eligible.length - successCount,
        results,
      });
    } catch (error) {
      console.error("[BATCH_KEY_MOMENTS] Error:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: "Failed to batch queue key moments jobs" });
    }
  });

  // Admin: Batch enqueue narrative segment jobs for featured episodes
  app.post("/api/admin/episodes/batch-narratives", requireAdminSessionOrKey, async (req, res) => {
    try {
      const bodySchema = z.object({
        limit: z.number().int().min(1).max(50).optional().default(20),
        minClaims: z.number().int().min(1).optional().default(30),
      });
      
      const { limit, minClaims } = bodySchema.parse(req.body);
      
      // Get eligible episodes: featured, transcriptStatus=ready, claim_count>=minClaims, no narrative segments
      const eligible = await storage.getEpisodesForNarratives(limit, minClaims);
      
      const results: Array<{ episodeId: string; success: boolean; message: string; jobId?: string }> = [];
      
      for (const ep of eligible) {
        try {
          // Get or create a source for this episode
          const sources = await storage.getEpisodeSourcesByEpisode(ep.id);
          let sourceForJob = sources.find((s: { isCanonical: boolean }) => s.isCanonical) || sources[0];
          
          if (!sourceForJob && ep.mediaUrl) {
            sourceForJob = await storage.createEpisodeSource({
              episodeId: ep.id,
              kind: "audio",
              platform: "podcast_host",
              sourceUrl: ep.mediaUrl,
              isCanonical: true,
              alignmentOffsetSeconds: 0,
              manuallyEdited: false,
            });
          }
          
          if (!sourceForJob) {
            results.push({ episodeId: ep.id, success: false, message: "No media source" });
            continue;
          }

          // Check for existing active job
          const existingJobs = await storage.getJobsByEpisodeSource(sourceForJob.id);
          const activeJob = existingJobs.find(
            (j: { type: string; status: string }) => j.type === "generate_narrative_segments" && (j.status === "pending" || j.status === "running")
          );
          
          if (activeJob) {
            results.push({ episodeId: ep.id, success: true, message: "Job already in progress", jobId: activeJob.id });
            continue;
          }

          // Create new job
          const job = await storage.createJob({
            episodeSourceId: sourceForJob.id,
            type: "generate_narrative_segments",
            status: "pending",
            attempts: 0,
          });
          
          results.push({ episodeId: ep.id, success: true, message: "Job queued", jobId: job.id });
        } catch (err: any) {
          results.push({ episodeId: ep.id, success: false, message: err.message || "Unknown error" });
        }
      }

      const successCount = results.filter(r => r.success).length;
      console.log(`[BATCH_NARRATIVES] Queued ${successCount}/${eligible.length} jobs`);
      
      res.json({
        success: true,
        eligibleCount: eligible.length,
        successCount,
        failedCount: eligible.length - successCount,
        results,
      });
    } catch (error) {
      console.error("[BATCH_NARRATIVES] Error:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: "Failed to batch queue narrative jobs" });
    }
  });

  // =====================
  // Statement Extraction (Semantic Engine)
  // =====================

  // Admin: Get statements for an episode
  app.get("/api/admin/episodes/:id/statements", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      
      const episode = await storage.getEpisode(id);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }

      const statements = await storage.getStatementsByEpisode(id);
      
      res.json({
        statements: statements.map(s => ({
          id: s.id,
          startTime: s.startTime,
          endTime: s.endTime,
          speaker: s.speaker,
          text: s.text,
          confidence: s.confidence,
          hasEmbedding: s.embedding !== null,
        })),
        count: statements.length,
      });
    } catch (error) {
      console.error("[STATEMENTS] Error fetching statements:", error);
      res.status(500).json({ error: "Failed to fetch statements" });
    }
  });

  // Admin: Enqueue statement extraction job
  app.post("/api/admin/episodes/:id/extract-statements", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;

      const episode = await storage.getEpisode(id);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }

      const segments = await storage.getSegmentsByEpisode(id);
      if (segments.length === 0) {
        return res.status(400).json({ error: "Episode has no transcript. Transcribe first." });
      }

      const existingStatements = await storage.getStatementsByEpisode(id);
      const forceReextract = req.query.force === "true";
      if (existingStatements.length > 0 && !forceReextract) {
        return res.status(400).json({ 
          error: "Statements already extracted. Use ?force=true to re-extract." 
        });
      }

      const sources = await storage.getEpisodeSourcesByEpisode(id);
      let sourceForJob = sources.find((s: { isCanonical: boolean }) => s.isCanonical) || sources[0];
      
      if (!sourceForJob) {
        if (episode.mediaUrl) {
          sourceForJob = await storage.createEpisodeSource({
            episodeId: id,
            kind: "audio",
            platform: "podcast_host",
            sourceUrl: episode.mediaUrl,
            isCanonical: true,
            alignmentOffsetSeconds: 0,
            manuallyEdited: false,
          });
        } else {
          return res.status(400).json({ error: "Episode has no media source" });
        }
      }

      const existingJobs = await storage.getJobsByEpisodeSource(sourceForJob.id);
      const activeJob = existingJobs.find(
        (j: { type: string; status: string }) => j.type === "extract_statements" && (j.status === "pending" || j.status === "running")
      );
      
      if (activeJob) {
        return res.json({
          success: true,
          message: "Statement extraction job already in progress",
          jobId: activeJob.id,
          status: activeJob.status,
        });
      }

      const job = await storage.createJob({
        episodeSourceId: sourceForJob.id,
        type: "extract_statements",
        status: "pending",
        attempts: 0,
      });
      
      console.log(`[EXTRACT_STATEMENTS] Created job ${job.id} for episode: ${episode.title}`);
      
      res.json({
        success: true,
        message: "Statement extraction job queued",
        jobId: job.id,
        status: "pending",
      });
    } catch (error) {
      console.error("[EXTRACT_STATEMENTS] Error queueing job:", error);
      res.status(500).json({ error: "Failed to queue statement extraction" });
    }
  });

  // Admin: Enqueue statement classification job
  app.post("/api/admin/episodes/:id/statements/classify", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;

      const episode = await storage.getEpisode(id);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }

      const statements = await storage.getStatementsByEpisode(id);
      if (statements.length === 0) {
        return res.status(400).json({ error: "Episode has no statements. Extract statements first." });
      }

      const forceReclassify = req.query.force === "true";
      const existingClassifications = await storage.getClassificationsByEpisode(id);
      if (existingClassifications.length > 0 && !forceReclassify) {
        return res.status(400).json({ 
          error: "Statements already classified. Use ?force=true to re-classify." 
        });
      }

      const sources = await storage.getEpisodeSourcesByEpisode(id);
      let sourceForJob = sources.find((s: { isCanonical: boolean }) => s.isCanonical) || sources[0];
      
      if (!sourceForJob) {
        if (episode.mediaUrl) {
          sourceForJob = await storage.createEpisodeSource({
            episodeId: id,
            kind: "audio",
            platform: "podcast_host",
            sourceUrl: episode.mediaUrl,
            isCanonical: true,
            alignmentOffsetSeconds: 0,
            manuallyEdited: false,
          });
        } else {
          return res.status(400).json({ error: "Episode has no media source" });
        }
      }

      const existingJobs = await storage.getJobsByEpisodeSource(sourceForJob.id);
      const activeJob = existingJobs.find(
        (j: { type: string; status: string }) => j.type === "classify_statements" && (j.status === "pending" || j.status === "running")
      );
      
      if (activeJob) {
        return res.json({
          success: true,
          message: "Statement classification job already in progress",
          jobId: activeJob.id,
          status: activeJob.status,
        });
      }

      const job = await storage.createJob({
        episodeSourceId: sourceForJob.id,
        type: "classify_statements",
        status: "pending",
        attempts: 0,
      });
      
      console.log(`[CLASSIFY_STATEMENTS] Created job ${job.id} for episode: ${episode.title}`);
      
      res.json({
        success: true,
        message: "Statement classification job queued",
        jobId: job.id,
        status: "pending",
      });
    } catch (error) {
      console.error("[CLASSIFY_STATEMENTS] Error queueing job:", error);
      res.status(500).json({ error: "Failed to queue statement classification" });
    }
  });

  // Admin: Get classified statements (claims) for an episode
  app.get("/api/admin/episodes/:id/claims", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const claimsOnly = req.query.claimsOnly === "true";

      const episode = await storage.getEpisode(id);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }

      const statementsWithClassifications = await storage.getClassificationsWithStatementsByEpisode(id);
      
      let results = statementsWithClassifications;
      if (claimsOnly) {
        results = results.filter(s => s.classification?.claimFlag === true);
      }

      res.json({
        claims: results.map(s => ({
          id: s.id,
          startTime: s.startTime,
          endTime: s.endTime,
          speaker: s.speaker,
          text: s.text,
          confidence: s.confidence,
          classification: s.classification ? {
            claimFlag: s.classification.claimFlag,
            claimType: s.classification.claimType,
            certainty: s.classification.certainty,
            polarity: s.classification.polarity,
            modality: s.classification.modality,
            sentiment: s.classification.sentiment,
            emotionalTone: s.classification.emotionalTone,
          } : null,
        })),
        count: results.length,
        totalStatements: statementsWithClassifications.length,
      });
    } catch (error) {
      console.error("[CLAIMS] Error fetching claims:", error);
      res.status(500).json({ error: "Failed to fetch claims" });
    }
  });

  // Admin: Get integrity score for an episode
  app.get("/api/admin/episodes/:id/integrity", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      
      const episode = await storage.getEpisode(id);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }

      const integrityScore = await storage.getIntegrityScore(id);
      
      if (!integrityScore) {
        return res.json({
          hasScore: false,
          message: "No integrity score calculated yet",
        });
      }

      res.json({
        hasScore: true,
        score: integrityScore.score,
        band: integrityScore.band,
        version: integrityScore.version,
        components: integrityScore.components,
        summary: integrityScore.summary,
        updatedAt: integrityScore.updatedAt,
      });
    } catch (error) {
      console.error("[INTEGRITY] Error fetching integrity score:", error);
      res.status(500).json({ error: "Failed to fetch integrity score" });
    }
  });

  // Admin: Recalculate integrity score for an episode
  app.post("/api/admin/episodes/:id/integrity/recalculate", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      
      const episode = await storage.getEpisode(id);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }

      const sources = await storage.getEpisodeSourcesByEpisode(id);
      if (sources.length === 0) {
        return res.status(400).json({ error: "No sources found for episode. Cannot queue integrity job." });
      }

      const sourceForJob = sources.find(s => s.isCanonical) || sources[0];

      const existingJobs = await storage.getJobsByEpisodeSource(sourceForJob.id);
      const activeJob = existingJobs.find(
        j => j.type === "integrity_score" && (j.status === "pending" || j.status === "running")
      );

      if (activeJob) {
        return res.json({
          success: true,
          message: "Integrity score job already in progress",
          jobId: activeJob.id,
          status: activeJob.status,
        });
      }

      const job = await storage.createJob({
        episodeSourceId: sourceForJob.id,
        type: "integrity_score",
        status: "pending",
        attempts: 0,
      });
      
      console.log(`[INTEGRITY_SCORE] Created job ${job.id} for episode: ${episode.title}`);
      
      res.json({
        success: true,
        message: "Integrity score calculation job queued",
        jobId: job.id,
        status: "pending",
      });
    } catch (error) {
      console.error("[INTEGRITY_SCORE] Error queueing job:", error);
      res.status(500).json({ error: "Failed to queue integrity score calculation" });
    }
  });

  // =====================
  // Statement Relations (Admin Only)
  // =====================

  // Admin: Get statement relations for an episode
  app.get("/api/admin/episodes/:id/relations", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      
      const episode = await storage.getEpisode(id);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }

      const relations = await storage.getRelationsByEpisode(id);
      
      // Group by relation type for easier display
      const grouped = {
        supports: relations.filter(r => r.relation === "supports"),
        contradicts: relations.filter(r => r.relation === "contradicts"),
        extends: relations.filter(r => r.relation === "extends"),
      };

      res.json({
        episodeId: id,
        total: relations.length,
        byType: {
          supports: grouped.supports.length,
          contradicts: grouped.contradicts.length,
          extends: grouped.extends.length,
        },
        relations,
      });
    } catch (error) {
      console.error("[RELATIONS] Error fetching relations:", error);
      res.status(500).json({ error: "Failed to fetch relations" });
    }
  });

  // Admin: Trigger relation discovery for an episode
  app.post("/api/admin/episodes/:id/relations/discover", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      
      const episode = await storage.getEpisode(id);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }

      const sources = await storage.getEpisodeSourcesByEpisode(id);
      if (sources.length === 0) {
        return res.status(400).json({ error: "No sources found for episode" });
      }

      const sourceForJob = sources.find(s => s.isCanonical) || sources[0];

      // Check for existing active job
      const existingJobs = await storage.getJobsByEpisodeSource(sourceForJob.id);
      const activeJob = existingJobs.find(
        j => j.type === "discover_relations_episode" && (j.status === "pending" || j.status === "running")
      );

      if (activeJob) {
        return res.json({
          success: true,
          message: "Relation discovery job already in progress",
          jobId: activeJob.id,
          status: activeJob.status,
        });
      }

      const job = await storage.createJob({
        episodeSourceId: sourceForJob.id,
        type: "discover_relations_episode",
        status: "pending",
        attempts: 0,
        result: { episodeId: id },
      });
      
      console.log(`[RELATIONS] Created discovery job ${job.id} for episode: ${episode.title}`);
      
      res.json({
        success: true,
        message: "Relation discovery job queued",
        jobId: job.id,
        status: "pending",
      });
    } catch (error) {
      console.error("[RELATIONS] Error queueing discovery job:", error);
      res.status(500).json({ error: "Failed to queue relation discovery" });
    }
  });

  // Public: Get semantic segments for an episode
  app.get("/api/episodes/:id/semantic-segments", async (req, res) => {
    try {
      const { id } = req.params;
      
      const episode = await storage.getEpisode(id);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }

      const semanticSegments = await storage.getSemanticSegmentsByEpisode(id);
      
      res.json({
        segments: semanticSegments.map(s => ({
          id: s.id,
          segmentId: s.segmentId,
          startTime: s.startTime,
          endTime: s.endTime,
          topicCategory: s.topicCategory,
          subTopic: s.subTopic,
          intent: s.intent,
          importanceScore: s.importanceScore,
          noveltyScore: s.noveltyScore,
          emotionIntensity: s.emotionIntensity,
          clipabilityScore: s.clipabilityScore,
        })),
      });
    } catch (error) {
      console.error("[SEMANTIC] Error fetching semantic segments:", error);
      res.status(500).json({ error: "Failed to fetch semantic segments" });
    }
  });

  // Public: Get aggregated knowledge map (key ideas) for an episode
  app.get("/api/episodes/:id/knowledge", async (req, res) => {
    try {
      const episodeId = req.params.id;
      const result = await episodeKnowledgeService.getEpisodeKnowledge(episodeId);
      res.json(result);
    } catch (error: any) {
      if (error.message?.includes("not found")) {
        return res.status(404).json({ error: error.message });
      }
      console.error("[KNOWLEDGE] Error fetching episode knowledge:", error);
      res.status(500).json({ error: "Failed to fetch episode knowledge" });
    }
  });

  // =====================
  // Integrity Report (Public, aggregated data)
  // =====================
  
  // Public: Get aggregated integrity report for an episode
  // Returns episode/podcast info + diff + sponsors + claims in one request
  app.get("/api/episodes/:id/integrity-report", async (req, res) => {
    try {
      const episodeId = req.params.id;
      
      const episode = await storage.getEpisode(episodeId);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }

      // Fetch related data in parallel
      const [podcast, latestDiff, sponsors, claims] = await Promise.all([
        episode.podcastId ? storage.getPodcast(episode.podcastId) : null,
        storage.getLatestEpisodeDiff(episodeId),
        storage.getSponsorSegmentsByEpisode(episodeId),
        storage.getClaimsByEpisodeId(episodeId),
      ]);

      // Build diff payload with proper typing
      type DiffMetrics = {
        similarity: number;
        addedCount: number;
        removedCount: number;
        modifiedCount: number;
      };
      
      type DiffSample = {
        type: "added" | "removed" | "modified";
        timestampSeconds: number | null;
        primaryText: string | null;
        secondaryText: string | null;
      };

      let diffPayload: {
        similarity: number;
        addedCount: number;
        removedCount: number;
        modifiedCount: number;
        primarySourceLabel: string;
        secondarySourceLabel: string;
        samples: DiffSample[];
      } | null = null;

      // Helper to safely convert to number with fallback (strict parsing)
      function safeNumber(val: unknown, fallback: number = 0): number {
        if (typeof val === 'number' && !isNaN(val) && isFinite(val)) return val;
        if (typeof val === 'string') {
          // Only accept strings that are purely numeric (with optional decimal point)
          const trimmed = val.trim();
          if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
            const parsed = parseFloat(trimmed);
            return isNaN(parsed) || !isFinite(parsed) ? fallback : parsed;
          }
        }
        return fallback;
      }
      
      // Helper to ensure a string or return null
      function safeString(val: unknown): string | null {
        return typeof val === 'string' ? val : null;
      }

      if (latestDiff) {
        // Defensive access to metrics object with safe number conversion
        const rawMetrics = latestDiff.metrics;
        const metrics: DiffMetrics = (rawMetrics && typeof rawMetrics === 'object') ? {
          similarity: safeNumber((rawMetrics as any).similarity, 0),
          addedCount: safeNumber((rawMetrics as any).addedCount, 0),
          removedCount: safeNumber((rawMetrics as any).removedCount, 0),
          modifiedCount: safeNumber((rawMetrics as any).modifiedCount, 0),
        } : { similarity: 0, addedCount: 0, removedCount: 0, modifiedCount: 0 };
        
        // Defensive access to samples object
        const rawSamples = latestDiff.samples;
        const samples = (rawSamples && typeof rawSamples === 'object') 
          ? rawSamples as { added?: any[]; removed?: any[]; modified?: any[] }
          : { added: [], removed: [], modified: [] };
        
        // Flatten samples into a unified format with defensive array checks
        const flatSamples: DiffSample[] = [];
        
        // Helper to get timestamp - returns number or null (preserves 0)
        function safeTimestamp(val: unknown): number | null {
          if (typeof val === 'number' && !isNaN(val) && isFinite(val)) return val;
          if (typeof val === 'string') {
            const trimmed = val.trim();
            if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
              const parsed = parseFloat(trimmed);
              if (!isNaN(parsed) && isFinite(parsed)) return parsed;
            }
          }
          return null;
        }
        
        const addedArr = Array.isArray(samples?.added) ? samples.added : [];
        addedArr.slice(0, 3).forEach((s: any) => {
          if (s && typeof s === 'object') {
            flatSamples.push({
              type: "added",
              timestampSeconds: safeTimestamp(s.approxStartTime),
              primaryText: null,
              secondaryText: safeString(s.text),
            });
          }
        });
        
        const removedArr = Array.isArray(samples?.removed) ? samples.removed : [];
        removedArr.slice(0, 3).forEach((s: any) => {
          if (s && typeof s === 'object') {
            flatSamples.push({
              type: "removed",
              timestampSeconds: safeTimestamp(s.approxStartTime),
              primaryText: safeString(s.text),
              secondaryText: null,
            });
          }
        });
        
        const modifiedArr = Array.isArray(samples?.modified) ? samples.modified : [];
        modifiedArr.slice(0, 3).forEach((s: any) => {
          if (s && typeof s === 'object') {
            flatSamples.push({
              type: "modified",
              timestampSeconds: safeTimestamp(s.approxStartTime),
              primaryText: safeString(s.before),
              secondaryText: safeString(s.after),
            });
          }
        });

        // Map source types to readable labels with safe string access
        const sourceLabels: Record<string, string> = {
          assembly: "AssemblyAI",
          youtube: "YouTube Captions",
          host: "Host Transcript",
          rss: "RSS Feed",
        };

        // Safely get source label with fallbacks
        const primarySrc = typeof latestDiff.primarySource === 'string' ? latestDiff.primarySource : null;
        const secondarySrc = typeof latestDiff.secondarySource === 'string' ? latestDiff.secondarySource : null;
        
        const primaryLabel = primarySrc ? (sourceLabels[primarySrc] ?? primarySrc) : "Unknown Source";
        const secondaryLabel = secondarySrc ? (sourceLabels[secondarySrc] ?? secondarySrc) : "Unknown Source";

        diffPayload = {
          similarity: Math.round(metrics.similarity * 100),
          addedCount: metrics.addedCount,
          removedCount: metrics.removedCount,
          modifiedCount: metrics.modifiedCount,
          primarySourceLabel: primaryLabel,
          secondarySourceLabel: secondaryLabel,
          samples: flatSamples,
        };
      }

      // Build sponsors payload with defensive null checks
      const validSponsors = Array.isArray(sponsors) ? sponsors.filter(s => s != null) : [];
      const sponsorsPayload = validSponsors.length > 0 ? {
        totalCount: validSponsors.length,
        segments: validSponsors.map((s) => ({
          brand: s.brand ?? null,
          timestampSeconds: s.startTime ?? null,
          confidence: s.confidence != null ? s.confidence / 100 : null, // Convert 0-100 to 0-1
          excerpt: s.excerpt ?? null,
        })),
      } : null;

      // Build claims payload with type breakdown and defensive null checks
      type ClaimType = "financial" | "medical" | "sensitive" | "other";
      const validClaims = Array.isArray(claims) ? claims.filter(c => c != null) : [];
      
      const claimsPayload = validClaims.length > 0 ? {
        totalCount: validClaims.length,
        byType: {
          financial: validClaims.filter((c) => c.claimType === "financial").length,
          medical: validClaims.filter((c) => c.claimType === "medical").length,
          sensitive: validClaims.filter((c) => c.claimType === "sensitive").length,
          other: validClaims.filter((c) => c.claimType === "other").length,
        },
        items: validClaims.map((c) => ({
          claimType: (c.claimType as ClaimType) ?? "other",
          text: c.claimText ?? "",
          timestampSeconds: c.startTime ?? null,
          severity: null as "low" | "medium" | "high" | null, // Not stored currently
        })),
      } : null;

      // Build response payload
      const payload = {
        episode: {
          id: episode.id,
          title: episode.title,
          description: episode.description ?? null,
          publishedAt: episode.publishedAt?.toISOString?.() ?? episode.publishedAt ?? null,
          duration: episode.duration ?? null,
          mediaUrl: episode.mediaUrl ?? null,
          videoUrl: episode.videoUrl ?? null,
        },
        podcast: podcast ? {
          id: podcast.id,
          title: podcast.title,
          host: podcast.host ?? null,
          artworkUrl: podcast.artworkUrl ?? null,
        } : null,
        diff: diffPayload,
        sponsors: sponsorsPayload,
        claims: claimsPayload,
        generatedAt: new Date().toISOString(),
      };

      res.json(payload);
    } catch (error) {
      console.error("[INTEGRITY_REPORT] Error generating integrity report:", error);
      res.status(500).json({ error: "Failed to generate integrity report" });
    }
  });

  // Public: Get integrity summary for share cards
  // Returns simplified metrics for social sharing
  app.get("/api/episodes/:id/integrity-summary", async (req, res) => {
    try {
      const episodeId = req.params.id;

      const episode = await storage.getEpisode(episodeId);
      if (!episode) {
        return res.status(404).json({ message: "Episode not found" });
      }

      // Fetch related data in parallel
      const [podcast, latestDiff, sponsors, claims] = await Promise.all([
        episode.podcastId ? storage.getPodcast(episode.podcastId) : null,
        storage.getLatestEpisodeDiff(episodeId),
        storage.getSponsorSegmentsByEpisode(episodeId),
        storage.getClaimsByEpisodeId(episodeId),
      ]);

      // Safe number helper
      function safeNumber(val: unknown, fallback: number = 0): number {
        if (typeof val === 'number' && !isNaN(val) && isFinite(val)) return val;
        return fallback;
      }

      // Extract diff metrics
      const rawMetrics = latestDiff?.metrics as any;
      const transcriptConsistency = rawMetrics?.similarity != null 
        ? Math.round(safeNumber(rawMetrics.similarity, 0) * 100) 
        : null;
      const addedCount = safeNumber(rawMetrics?.addedCount, 0);
      const removedCount = safeNumber(rawMetrics?.removedCount, 0);
      const modifiedCount = safeNumber(rawMetrics?.modifiedCount, 0);

      const sponsorCount = sponsors?.length ?? 0;
      const validClaims = Array.isArray(claims) ? claims : [];

      // Categorize claims by type
      const financialClaims = validClaims.filter(c => c.claimType === "financial");
      const medicalClaims = validClaims.filter(c => c.claimType === "medical");
      const sensitiveClaims = validClaims.filter(c => c.claimType === "sensitive");
      // High risk = medical or sensitive claims with high confidence (>= 70)
      const highRiskClaims = validClaims.filter(c => 
        (c.claimType === "medical" || c.claimType === "sensitive") && 
        (c.confidence ?? 0) >= 70
      );

      // v1 scoring heuristic
      const baseScore = transcriptConsistency ?? 50;
      const sponsorPenalty = Math.min(sponsorCount * 3, 15);
      const highRiskPenalty = Math.min(highRiskClaims.length * 10, 30);

      let integrityScore = Math.round(baseScore - sponsorPenalty - highRiskPenalty);
      if (integrityScore < 0) integrityScore = 0;
      if (integrityScore > 100) integrityScore = 100;

      // Determine claims risk level
      let claimsRiskLevel: "low" | "medium" | "high" = "low";
      if (highRiskClaims.length >= 2 || medicalClaims.length >= 3) {
        claimsRiskLevel = "high";
      } else if (
        highRiskClaims.length === 1 ||
        financialClaims.length + medicalClaims.length >= 3
      ) {
        claimsRiskLevel = "medium";
      }

      return res.json({
        episodeId,
        episodeTitle: episode.title,
        podcastTitle: podcast?.title ?? null,
        artworkUrl: podcast?.artworkUrl ?? null,
        integrityScore,
        transcriptConsistency,
        addedCount,
        removedCount,
        modifiedCount,
        sponsorCount,
        claims: {
          total: validClaims.length,
          financial: financialClaims.length,
          medical: medicalClaims.length,
          sensitive: sensitiveClaims.length,
          highRisk: highRiskClaims.length,
          riskLevel: claimsRiskLevel,
        },
      });
    } catch (err) {
      console.error("Error in /api/episodes/:id/integrity-summary", err);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // =====================
  // Podcast Index Integration (Admin Only)
  // =====================
  
  // Initialize Podcast Index client - always create fresh to pick up credential changes
  const getPodcastIndexClient = async () => {
    // Trim whitespace from credentials (common copy-paste issue)
    const apiKey = process.env.PODCAST_INDEX_API_KEY?.trim();
    const apiSecret = process.env.PODCAST_INDEX_API_SECRET?.trim();
    
    if (!apiKey || !apiSecret) {
      throw new Error("Podcast Index API credentials not configured. Add PODCAST_INDEX_API_KEY and PODCAST_INDEX_API_SECRET.");
    }
    
    // Use dynamic import for ESM compatibility
    const podcastIndexModule = await import("podcast-index-api");
    const PodcastIndexApi = podcastIndexModule.default;
    return PodcastIndexApi(apiKey, apiSecret, "PODDNA/1.0");
  };
  
  // Search podcasts via Podcast Index
  app.get("/api/admin/podcast-index/search", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { q } = req.query;
      if (!q || typeof q !== "string") {
        return res.status(400).json({ error: "Search query 'q' is required" });
      }

      const podcastIndexApi = await getPodcastIndexClient();

      console.log(`[PODCAST_INDEX] Searching for: "${q}"`);
      
      // Try searchByTitle first for exact title matches (better for multi-word queries)
      // Then fall back to searchByTerm for broader results
      // Parameters: (query, val, clean, fullText)
      // fullText=true gets complete descriptions (default truncates to 100 words)
      let results = await podcastIndexApi.searchByTitle(q, '', false, true);
      console.log(`[PODCAST_INDEX] searchByTitle results: ${results.count || 0}`);
      
      // If no results from title search, try term search
      if (!results.feeds || results.feeds.length === 0) {
        results = await podcastIndexApi.searchByTerm(q, '', false, true);
        console.log(`[PODCAST_INDEX] searchByTerm results: ${results.count || 0}`);
      }
      
      // Combine results from both for multi-word queries (dedupe by id)
      if (q.includes(" ")) {
        const termResults = await podcastIndexApi.searchByTerm(q, '', false, true);
        const existingIds = new Set((results.feeds || []).map((f: any) => f.id));
        const additionalFeeds = (termResults.feeds || []).filter((f: any) => !existingIds.has(f.id));
        results.feeds = [...(results.feeds || []), ...additionalFeeds];
        results.count = results.feeds.length;
        console.log(`[PODCAST_INDEX] Combined results: ${results.count}`);
      }
      
      res.json({
        count: results.count || 0,
        podcasts: (results.feeds || []).map((feed: any) => ({
          id: feed.id,
          title: feed.title,
          author: feed.author,
          description: feed.description,
          artworkUrl: feed.artwork || feed.image,
          feedUrl: feed.url,
          itunesId: feed.itunesId,
          episodeCount: feed.episodeCount,
          lastUpdateTime: feed.lastUpdateTime,
        })),
      });
    } catch (error) {
      console.error("[PODCAST_INDEX] Search error:", error);
      res.status(500).json({ error: "Failed to search podcasts" });
    }
  });

  // Get episodes for a podcast from Podcast Index
  app.get("/api/admin/podcast-index/episodes/:feedId", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { feedId } = req.params;
      const max = parseInt(req.query.max as string) || 50;

      const podcastIndexApi = await getPodcastIndexClient();

      // Parameters: feedId, since, max, fullText
      // fullText=true gets complete descriptions (default truncates to 100 words)
      const results = await podcastIndexApi.episodesByFeedId(feedId, null, max, true);
      
      // Map episodes with enhanced transcript and media info
      const episodes = (results.items || []).map((ep: any) => {
        // Extract transcript info if available (Podcasting 2.0 feature)
        const transcripts = ep.transcripts || [];
        const hasTranscript = transcripts.length > 0;
        const transcriptUrl = transcripts.length > 0 ? transcripts[0].url : null;
        const transcriptType = transcripts.length > 0 ? transcripts[0].type : null;
        
        // Format duration from seconds to readable format
        const durationSeconds = ep.duration || 0;
        const hours = Math.floor(durationSeconds / 3600);
        const minutes = Math.floor((durationSeconds % 3600) / 60);
        const durationFormatted = hours > 0 
          ? `${hours}h ${minutes}m` 
          : `${minutes}m`;
        
        // Extract soundbites if available (Podcasting 2.0 feature)
        const soundbites = ep.soundbites || [];
        
        // Extract persons/guests if available (Podcasting 2.0 feature)
        const persons = ep.persons || [];
        
        return {
          id: ep.id,
          guid: ep.guid,
          title: ep.title,
          description: ep.description,
          datePublished: ep.datePublished,
          datePublishedFormatted: ep.datePublished 
            ? new Date(ep.datePublished * 1000).toLocaleDateString() 
            : null,
          duration: durationSeconds,
          durationFormatted,
          enclosureUrl: ep.enclosureUrl,
          enclosureType: ep.enclosureType,
          enclosureLength: ep.enclosureLength,
          image: ep.image || ep.feedImage,
          // Transcript availability
          hasTranscript,
          transcriptUrl,
          transcriptType,
          transcripts: transcripts.map((t: any) => ({
            url: t.url,
            type: t.type,
            language: t.language || 'en',
          })),
          // Additional Podcasting 2.0 metadata
          chaptersUrl: ep.chaptersUrl,
          link: ep.link,
          // Soundbites - short audio clips highlighted by the creator
          soundbites: soundbites.map((sb: any) => ({
            startTime: sb.startTime,
            duration: sb.duration,
            title: sb.title,
          })),
          hasSoundbites: soundbites.length > 0,
          // Persons/Guests - people featured in this episode
          persons: persons.map((p: any) => ({
            name: p.name,
            role: p.role,
            group: p.group,
            img: p.img,
            href: p.href,
          })),
          hasPersons: persons.length > 0,
          // Season/Episode info
          season: ep.season || null,
          episode: ep.episode || null,
          episodeType: ep.episodeType || null,
        };
      });
      
      res.json({
        count: results.count || 0,
        episodes,
      });
    } catch (error) {
      console.error("[PODCAST_INDEX] Episodes fetch error:", error);
      res.status(500).json({ error: "Failed to fetch episodes" });
    }
  });

  // Import a podcast from Podcast Index
  app.post("/api/admin/podcast-index/import", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { feedId, importEpisodes = true, maxEpisodes = 20 } = req.body;
      if (!feedId) {
        return res.status(400).json({ error: "feedId is required" });
      }

      const podcastIndexApi = await getPodcastIndexClient();

      // Get podcast details
      const podcastResult = await podcastIndexApi.podcastsByFeedId(feedId);
      const feed = podcastResult.feed;
      
      if (!feed) {
        return res.status(404).json({ error: "Podcast not found" });
      }

      // Find-or-create podcast using Podcast Index feedId as stable identifier
      const existingPodcasts = await storage.getAllPodcasts();
      
      // First lookup by Podcast Index feedId (most reliable)
      let podcast = existingPodcasts.find(p => 
        p.podcastIndexFeedId === feedId.toString()
      );
      
      // Fallback: lookup by exact title match
      if (!podcast) {
        podcast = existingPodcasts.find(p => 
          p.title.toLowerCase() === feed.title.toLowerCase()
        );
      }
      
      let isNewPodcast = false;
      if (!podcast) {
        try {
          podcast = await storage.createPodcast({
            title: feed.title,
            host: feed.author || "Unknown",
            description: feed.description || null,
            artworkUrl: feed.artwork || feed.image || null,
            podcastIndexFeedId: feedId.toString(),
          });
          isNewPodcast = true;
          console.log(`[PODCAST_INDEX] Created new podcast: ${podcast.title} (feedId: ${feedId})`);
        } catch (createError) {
          // If creation failed, try to find again
          console.log(`[PODCAST_INDEX] Create failed, searching again...`);
          const refreshedPodcasts = await storage.getAllPodcasts();
          podcast = refreshedPodcasts.find(p => 
            p.podcastIndexFeedId === feedId.toString() ||
            p.title.toLowerCase() === feed.title.toLowerCase()
          );
          if (!podcast) {
            throw createError;
          }
          console.log(`[PODCAST_INDEX] Found existing podcast after retry: ${podcast.title}`);
        }
      } else {
        // Update existing podcast with feedId if not set
        if (!podcast.podcastIndexFeedId) {
          await storage.updatePodcast(podcast.id, { podcastIndexFeedId: feedId.toString() });
          console.log(`[PODCAST_INDEX] Updated existing podcast with feedId: ${podcast.title}`);
        }
        console.log(`[PODCAST_INDEX] Using existing podcast: ${podcast.title}`);
      }

      let importedEpisodes: any[] = [];
      let skippedEpisodes = 0;

      if (importEpisodes) {
        // Get existing episodes for this podcast to check for duplicates
        const existingEpisodes = await storage.getEpisodesByPodcast(podcast.id);
        const existingMediaUrls = new Set(existingEpisodes.map(e => e.mediaUrl?.toLowerCase() || ""));
        const existingTitles = new Set(existingEpisodes.map(e => e.title.toLowerCase()));
        
        console.log(`[PODCAST_INDEX] Importing episodes for podcast ${podcast.id}, max: ${maxEpisodes}`);
        
        // Get episodes from Podcast Index
        // Parameters: feedId, since, max, fullText
        // fullText=true gets complete descriptions (default truncates to 100 words)
        const episodesResult = await podcastIndexApi.episodesByFeedId(feedId, null, maxEpisodes, true);
        const episodes = episodesResult.items || [];
        
        console.log(`[PODCAST_INDEX] Found ${episodes.length} episodes from Podcast Index`);

        for (const ep of episodes) {
          const mediaUrl = ep.enclosureUrl || "";
          const title = ep.title || "";
          
          // Skip episodes without valid enclosureUrl (required for playback)
          if (!mediaUrl || mediaUrl.trim() === "") {
            console.log(`[PODCAST_INDEX] Skipping episode without enclosureUrl: ${title}`);
            skippedEpisodes++;
            continue;
          }
          
          // Skip duplicates (check by mediaUrl or title)
          if (existingMediaUrls.has(mediaUrl.toLowerCase())) {
            skippedEpisodes++;
            continue;
          }
          if (title && existingTitles.has(title.toLowerCase())) {
            skippedEpisodes++;
            continue;
          }
          
          try {
            // Extract transcript URL from Podcast Index data (Podcasting 2.0 feature)
            const transcripts = ep.transcripts || [];
            const transcriptUrl = transcripts.length > 0 ? transcripts[0].url : null;
            const transcriptType = transcripts.length > 0 ? transcripts[0].type : null;
            // Extract chapters URL from Podcast Index data (Podcasting 2.0 feature)
            const chaptersUrl = ep.chaptersUrl || null;
            
            const episode = await storage.createEpisode({
              podcastId: podcast.id,
              title: ep.title,
              description: ep.description || null,
              type: "audio",
              mediaUrl: mediaUrl,
              duration: ep.duration || 0,
              publishedAt: ep.datePublished ? new Date(ep.datePublished * 1000) : new Date(),
              transcriptUrl: transcriptUrl,
              transcriptType: transcriptType,
              chaptersUrl: chaptersUrl,
            });
            importedEpisodes.push(episode);
            // Add to sets to prevent duplicates within the same import batch
            if (mediaUrl) existingMediaUrls.add(mediaUrl.toLowerCase());
            if (title) existingTitles.add(title.toLowerCase());
            
            // Auto-import video sources from alternateEnclosures (Podcasting 2.0 feature)
            const videoSources = extractVideoSources(ep.alternateEnclosures);
            for (const videoSource of videoSources) {
              try {
                // Check for duplicate - skip if source already exists for this episode
                const existing = await storage.getEpisodeSourceByUrl(episode.id, videoSource.url);
                if (existing) {
                  console.log(`[PODCAST_INDEX] Skipping duplicate video source: ${videoSource.url}`);
                  continue;
                }
                
                await storage.createEpisodeSource({
                  episodeId: episode.id,
                  kind: "video",
                  platform: videoSource.platform,
                  sourceUrl: videoSource.url,
                  isCanonical: false,
                  alignmentOffsetSeconds: 0,
                });
                console.log(`[PODCAST_INDEX] Auto-created ${videoSource.platform} video source for episode: ${ep.title}`);
              } catch (srcError) {
                console.error(`[PODCAST_INDEX] Failed to create video source for episode: ${ep.title}`, srcError);
              }
            }
            
            // Auto-enqueue YouTube transcript job if applicable
            const { totalEnqueued } = await maybeEnqueueYoutubeTranscriptJob(episode.id);
            if (totalEnqueued > 0) {
              console.log(`[PODCAST_INDEX] Auto-queued ${totalEnqueued} YouTube transcript job(s) for: ${ep.title}`);
            }
          } catch (epError) {
            console.error(`[PODCAST_INDEX] Failed to import episode: ${ep.title}`, epError);
          }
        }
      }

      // Count total video sources created
      let videoSourcesCreated = 0;
      for (const episode of importedEpisodes) {
        const sources = await storage.getEpisodeSourcesByEpisode(episode.id);
        videoSourcesCreated += sources.filter(s => s.kind === "video").length;
      }

      res.json({
        success: true,
        podcast,
        isNewPodcast,
        episodesImported: importedEpisodes.length,
        episodesSkipped: skippedEpisodes,
        videoSourcesDiscovered: videoSourcesCreated,
        episodes: importedEpisodes,
      });
    } catch (error) {
      console.error("[PODCAST_INDEX] Import error:", error);
      res.status(500).json({ error: "Failed to import podcast" });
    }
  });

  // Check for and import new episodes for an existing podcast
  app.post("/api/admin/podcasts/:id/sync-episodes", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { id } = req.params;
      const maxEpisodes = parseInt(req.body.maxEpisodes as string) || 50;

      // Get the podcast
      const podcast = await storage.getPodcast(id);
      if (!podcast) {
        return res.status(404).json({ error: "Podcast not found" });
      }

      // Check if podcast has a Podcast Index feed ID
      if (!podcast.podcastIndexFeedId) {
        return res.status(400).json({ 
          error: "This podcast doesn't have a Podcast Index feed ID. It may have been manually added.", 
          hint: "You can only sync episodes for podcasts imported from Podcast Index."
        });
      }

      const feedId = parseInt(podcast.podcastIndexFeedId);
      const podcastIndexApi = await getPodcastIndexClient();

      // Get existing episodes for this podcast
      const existingEpisodes = await storage.getEpisodesByPodcast(podcast.id);
      const existingMediaUrls = new Set(existingEpisodes.map(e => e.mediaUrl?.toLowerCase() || ""));
      const existingTitles = new Set(existingEpisodes.map(e => e.title.toLowerCase()));
      
      console.log(`[SYNC_EPISODES] Syncing episodes for ${podcast.title} (feedId: ${feedId}), existing: ${existingEpisodes.length}`);

      // Fetch episodes from Podcast Index
      // Parameters: feedId, since, max, fullText
      // fullText=true gets complete descriptions (default truncates to 100 words)
      const episodesResult = await podcastIndexApi.episodesByFeedId(feedId, null, maxEpisodes, true);
      const episodes = episodesResult.items || [];
      
      console.log(`[SYNC_EPISODES] Found ${episodes.length} episodes from Podcast Index`);

      const importedEpisodes: any[] = [];
      let skippedEpisodes = 0;

      for (const ep of episodes) {
        const mediaUrl = ep.enclosureUrl || "";
        const title = ep.title || "";
        
        // Skip episodes without valid enclosureUrl
        if (!mediaUrl || mediaUrl.trim() === "") {
          console.log(`[SYNC_EPISODES] Skipping episode without enclosureUrl: ${title}`);
          skippedEpisodes++;
          continue;
        }
        
        // Skip duplicates
        if (existingMediaUrls.has(mediaUrl.toLowerCase())) {
          skippedEpisodes++;
          continue;
        }
        if (title && existingTitles.has(title.toLowerCase())) {
          skippedEpisodes++;
          continue;
        }
        
        try {
          // Extract transcript URL from Podcast Index data
          const transcripts = ep.transcripts || [];
          const transcriptUrl = transcripts.length > 0 ? transcripts[0].url : null;
          const transcriptType = transcripts.length > 0 ? transcripts[0].type : null;
          // Extract chapters URL from Podcast Index data (Podcasting 2.0 feature)
          const chaptersUrl = ep.chaptersUrl || null;
          
          const episode = await storage.createEpisode({
            podcastId: podcast.id,
            title: ep.title,
            description: ep.description || null,
            type: "audio",
            mediaUrl: mediaUrl,
            duration: ep.duration || 0,
            publishedAt: ep.datePublished ? new Date(ep.datePublished * 1000) : new Date(),
            transcriptUrl: transcriptUrl,
            transcriptType: transcriptType,
            chaptersUrl: chaptersUrl,
          });
          importedEpisodes.push(episode);
          existingMediaUrls.add(mediaUrl.toLowerCase());
          if (title) existingTitles.add(title.toLowerCase());
          
          // Auto-import video sources from alternateEnclosures (Podcasting 2.0 feature)
          const videoSources = extractVideoSources(ep.alternateEnclosures);
          for (const videoSource of videoSources) {
            try {
              // Check for duplicate - skip if source already exists for this episode
              const existing = await storage.getEpisodeSourceByUrl(episode.id, videoSource.url);
              if (existing) {
                // Skip if manually edited by admin
                if (existing.manuallyEdited) {
                  console.log(`[SYNC_EPISODES] Skipping manually edited source: ${videoSource.url}`);
                } else {
                  console.log(`[SYNC_EPISODES] Skipping duplicate video source: ${videoSource.url}`);
                }
                continue;
              }
              
              await storage.createEpisodeSource({
                episodeId: episode.id,
                kind: "video",
                platform: videoSource.platform,
                sourceUrl: videoSource.url,
                isCanonical: false,
                alignmentOffsetSeconds: 0,
              });
              console.log(`[SYNC_EPISODES] Auto-created ${videoSource.platform} video source for episode: ${ep.title}`);
            } catch (srcError) {
              console.error(`[SYNC_EPISODES] Failed to create video source for episode: ${ep.title}`, srcError);
            }
          }
          
          // Auto-enqueue YouTube transcript job if applicable
          const { totalEnqueued } = await maybeEnqueueYoutubeTranscriptJob(episode.id);
          if (totalEnqueued > 0) {
            console.log(`[SYNC_EPISODES] Auto-queued ${totalEnqueued} YouTube transcript job(s) for: ${ep.title}`);
          }
        } catch (epError) {
          console.error(`[SYNC_EPISODES] Failed to import episode: ${ep.title}`, epError);
        }
      }

      // Count total video sources created
      let videoSourcesCreated = 0;
      for (const episode of importedEpisodes) {
        const sources = await storage.getEpisodeSourcesByEpisode(episode.id);
        videoSourcesCreated += sources.filter(s => s.kind === "video").length;
      }

      console.log(`[SYNC_EPISODES] Imported ${importedEpisodes.length} new episodes, skipped ${skippedEpisodes}, video sources: ${videoSourcesCreated}`);

      res.json({
        success: true,
        podcast: {
          id: podcast.id,
          title: podcast.title,
        },
        newEpisodesFound: importedEpisodes.length,
        episodesSkipped: skippedEpisodes,
        videoSourcesDiscovered: videoSourcesCreated,
        totalEpisodes: existingEpisodes.length + importedEpisodes.length,
        episodes: importedEpisodes,
      });
    } catch (error) {
      console.error("[SYNC_EPISODES] Error:", error);
      res.status(500).json({ error: "Failed to sync episodes" });
    }
  });

  // Re-fetch episode description from Podcast Index (to get full text)
  app.post("/api/admin/episodes/:id/refresh-description", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { id } = req.params;
      const episode = await storage.getEpisode(id);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }

      // Get the podcast to find the feedId
      const podcast = await storage.getPodcast(episode.podcastId);
      if (!podcast || !podcast.podcastIndexFeedId) {
        return res.status(400).json({ 
          error: "Cannot refresh: podcast doesn't have a Podcast Index feed ID" 
        });
      }

      const feedId = parseInt(podcast.podcastIndexFeedId);
      const podcastIndexApi = await getPodcastIndexClient();

      // Fetch all episodes with fullText to find this one
      // Parameters: feedId, since, max, fullText
      const episodesResult = await podcastIndexApi.episodesByFeedId(feedId, null, 100, true);
      const episodes = episodesResult.items || [];

      // Find matching episode by title or mediaUrl
      const matchingEp = episodes.find((ep: any) => 
        ep.title?.toLowerCase() === episode.title.toLowerCase() ||
        ep.enclosureUrl?.toLowerCase() === episode.mediaUrl?.toLowerCase()
      );

      if (!matchingEp) {
        return res.status(404).json({ 
          error: "Could not find this episode in Podcast Index feed" 
        });
      }

      // Update the episode with full description
      const updatedEpisode = await storage.updateEpisode(id, {
        description: matchingEp.description || episode.description,
        chaptersUrl: matchingEp.chaptersUrl || episode.chaptersUrl,
      });

      console.log(`[REFRESH_DESCRIPTION] Updated episode ${id} with full description (${matchingEp.description?.length || 0} chars)`);

      res.json({
        success: true,
        episode: updatedEpisode,
        descriptionLength: matchingEp.description?.length || 0,
      });
    } catch (error) {
      console.error("[REFRESH_DESCRIPTION] Error:", error);
      res.status(500).json({ error: "Failed to refresh episode description" });
    }
  });

  // ============ FEED IMPORT (Batch Add Episodes) ============

  // Preview a feed - returns episodes from RSS feed or YouTube playlist without importing
  app.post("/api/admin/feed-preview", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { feedUrl } = req.body;
      if (!feedUrl || typeof feedUrl !== "string") {
        return res.status(400).json({ error: "feedUrl is required" });
      }

      const trimmedUrl = feedUrl.trim();
      
      // Detect source type: YouTube playlist/channel OR RSS feed
      const youtubePlaylistMatch = trimmedUrl.match(/(?:youtube\.com\/(?:playlist\?list=|channel\/|c\/|@)|youtu\.be\/)([a-zA-Z0-9_-]+)/);
      const isYoutubeUrl = youtubePlaylistMatch || trimmedUrl.includes("youtube.com") || trimmedUrl.includes("youtu.be");
      
      if (isYoutubeUrl) {
        // Handle YouTube playlist/channel
        try {
          const { Innertube } = await import("youtubei.js");
          const yt = await Innertube.create();
          
          let videos: any[] = [];
          let channelTitle = "";
          let channelThumbnail = "";
          
          // Check if it's a playlist URL
          const playlistIdMatch = trimmedUrl.match(/[?&]list=([a-zA-Z0-9_-]+)/);
          if (playlistIdMatch) {
            const playlistId = playlistIdMatch[1];
            console.log(`[FEED_PREVIEW] Loading YouTube playlist: ${playlistId}`);
            const playlist = await yt.getPlaylist(playlistId);
            channelTitle = playlist.info.author?.name || "Unknown Channel";
            channelThumbnail = playlist.info.thumbnails?.[0]?.url || "";
            
            // Get videos from playlist
            if (playlist.videos && Array.isArray(playlist.videos)) {
              videos = playlist.videos.slice(0, 50).map((v: any) => ({
                externalId: v.id,
                title: v.title?.text || v.title || "Untitled",
                publishedAt: null, // Playlists don't give publish dates reliably
                durationSeconds: v.duration?.seconds || 0,
                thumbnailUrl: v.thumbnails?.[0]?.url || "",
                videoUrl: `https://www.youtube.com/watch?v=${v.id}`,
              }));
            }
          } else {
            // Handle channel URL - extract handle/ID
            const channelMatch = trimmedUrl.match(/(?:youtube\.com\/)(?:channel\/|c\/|@)([a-zA-Z0-9_-]+)/);
            if (channelMatch) {
              const channelHandle = channelMatch[1];
              console.log(`[FEED_PREVIEW] Loading YouTube channel: ${channelHandle}`);
              
              // Try to get channel by handle
              try {
                const channel = await yt.getChannel(channelHandle);
                channelTitle = channel.metadata?.title || channelHandle;
                channelThumbnail = channel.metadata?.avatar?.[0]?.url || "";
                
                // Get videos tab
                const videosTab = await channel.getVideos();
                if (videosTab?.videos && Array.isArray(videosTab.videos)) {
                  videos = videosTab.videos.slice(0, 50).map((v: any) => ({
                    externalId: v.id,
                    title: v.title?.text || v.title || "Untitled",
                    publishedAt: v.published?.text ? new Date().toISOString() : null,
                    durationSeconds: v.duration?.seconds || 0,
                    thumbnailUrl: v.thumbnails?.[0]?.url || "",
                    videoUrl: `https://www.youtube.com/watch?v=${v.id}`,
                  }));
                }
              } catch (channelErr) {
                console.error("[FEED_PREVIEW] Channel fetch error:", channelErr);
                return res.status(400).json({ 
                  error: "Could not load YouTube channel. Try using a playlist URL instead." 
                });
              }
            } else {
              return res.status(400).json({ 
                error: "Invalid YouTube URL. Please provide a playlist or channel URL." 
              });
            }
          }
          
          // Check which videos are already in PodDNA (by matching YouTube source URLs)
          const existingEpisodes = await storage.getAllEpisodes();
          const existingSources = await Promise.all(
            existingEpisodes.map(ep => storage.getEpisodeSourcesByEpisode(ep.id))
          );
          
          const existingYoutubeIds = new Set<string>();
          existingSources.flat().forEach(source => {
            if (source.platform === "youtube" && source.sourceUrl) {
              const idMatch = source.sourceUrl.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
              if (idMatch) existingYoutubeIds.add(idMatch[1]);
            }
          });
          
          const items = videos.map(v => ({
            externalId: v.externalId,
            title: v.title,
            publishedAt: v.publishedAt,
            durationSeconds: v.durationSeconds,
            thumbnailUrl: v.thumbnailUrl,
            audioUrl: null,
            videoUrl: v.videoUrl,
            alreadyInPodDNA: existingYoutubeIds.has(v.externalId),
          }));
          
          res.json({
            sourceType: "youtube",
            feedTitle: channelTitle,
            feedImage: channelThumbnail,
            items,
          });
        } catch (ytError) {
          console.error("[FEED_PREVIEW] YouTube error:", ytError);
          return res.status(400).json({ 
            error: "Failed to load YouTube content. Please check the URL." 
          });
        }
      } else {
        // Handle RSS feed via Podcast Index
        try {
          const podcastIndexApi = await getPodcastIndexClient();
          
          // Try to find podcast by feed URL
          console.log(`[FEED_PREVIEW] Searching Podcast Index for feed: ${trimmedUrl}`);
          const searchResult = await podcastIndexApi.podcastsByFeedUrl(trimmedUrl);
          
          if (!searchResult?.feed) {
            return res.status(404).json({ 
              error: "Podcast not found in Podcast Index. Please check the feed URL." 
            });
          }
          
          const feed = searchResult.feed;
          const feedId = feed.id;
          
          // Get episodes
          const episodesResult = await podcastIndexApi.episodesByFeedId(feedId, null, 50, true);
          const episodes = episodesResult.items || [];
          
          // Check which episodes are already in PodDNA
          const existingEpisodes = await storage.getAllEpisodes();
          const existingMediaUrls = new Set(existingEpisodes.map(e => e.mediaUrl?.toLowerCase() || ""));
          const existingTitles = new Set(existingEpisodes.map(e => e.title.toLowerCase()));
          
          const items = episodes.map((ep: any) => {
            const mediaUrl = ep.enclosureUrl || "";
            const title = ep.title || "";
            const alreadyExists = existingMediaUrls.has(mediaUrl.toLowerCase()) || 
                                  (title && existingTitles.has(title.toLowerCase()));
            
            return {
              externalId: ep.guid || ep.id?.toString(),
              title: title,
              publishedAt: ep.datePublished ? new Date(ep.datePublished * 1000).toISOString() : null,
              durationSeconds: ep.duration || 0,
              thumbnailUrl: ep.image || ep.feedImage || feed.artwork || "",
              audioUrl: mediaUrl,
              videoUrl: null,
              alreadyInPodDNA: alreadyExists,
              // Extra fields for RSS import
              description: ep.description || null,
              transcriptUrl: ep.transcripts?.[0]?.url || null,
              transcriptType: ep.transcripts?.[0]?.type || null,
              chaptersUrl: ep.chaptersUrl || null,
              alternateEnclosures: ep.alternateEnclosures || [],
            };
          });
          
          res.json({
            sourceType: "rss",
            feedId: feedId,
            feedTitle: feed.title,
            feedAuthor: feed.author,
            feedImage: feed.artwork || feed.image,
            items,
          });
        } catch (rssError) {
          console.error("[FEED_PREVIEW] RSS error:", rssError);
          return res.status(400).json({ 
            error: "Failed to load RSS feed. Please check the URL." 
          });
        }
      }
    } catch (error) {
      console.error("[FEED_PREVIEW] Error:", error);
      res.status(500).json({ error: "Failed to preview feed" });
    }
  });

  // Batch import episodes from a previewed feed
  app.post("/api/admin/feed-import", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { feedUrl, sourceType, feedId, feedTitle, feedAuthor, feedImage, items } = req.body;
      
      if (!sourceType || !items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "sourceType and items array are required" });
      }

      console.log(`[FEED_IMPORT] Importing ${items.length} items from ${sourceType} feed`);
      
      const results: any[] = [];
      let successCount = 0;
      let skipCount = 0;
      let errorCount = 0;

      if (sourceType === "rss") {
        // RSS feed import - find or create podcast first
        if (!feedId) {
          return res.status(400).json({ error: "feedId is required for RSS imports" });
        }
        
        const existingPodcasts = await storage.getAllPodcasts();
        let podcast = existingPodcasts.find(p => p.podcastIndexFeedId === feedId.toString());
        
        if (!podcast) {
          podcast = await storage.createPodcast({
            title: feedTitle || "Unknown Podcast",
            host: feedAuthor || "Unknown",
            description: null,
            artworkUrl: feedImage || null,
            podcastIndexFeedId: feedId.toString(),
          });
          console.log(`[FEED_IMPORT] Created new podcast: ${podcast.title}`);
        }
        
        // Re-fetch existing episodes at import time to catch race conditions
        const allEpisodes = await storage.getAllEpisodes();
        const existingMediaUrls = new Set(allEpisodes.map(e => e.mediaUrl?.toLowerCase() || ""));
        const existingTitles = new Set(allEpisodes.map(e => e.title.toLowerCase()));
        
        for (const item of items) {
          try {
            // Double-check duplicates at import time (handles race conditions)
            const mediaUrl = item.audioUrl?.toLowerCase() || "";
            const title = item.title?.toLowerCase() || "";
            if (existingMediaUrls.has(mediaUrl) || existingTitles.has(title)) {
              results.push({ externalId: item.externalId, status: "skipped", reason: "Already exists (detected at import time)" });
              skipCount++;
              continue;
            }
            
            if (item.alreadyInPodDNA) {
              results.push({ externalId: item.externalId, status: "skipped", reason: "Already exists" });
              skipCount++;
              continue;
            }
            
            // Create episode using existing ingestion logic
            const episode = await storage.createEpisode({
              podcastId: podcast.id,
              title: item.title,
              description: item.description || null,
              type: "audio",
              mediaUrl: item.audioUrl,
              duration: item.durationSeconds || 0,
              publishedAt: item.publishedAt ? new Date(item.publishedAt) : new Date(),
              transcriptUrl: item.transcriptUrl || null,
              transcriptType: item.transcriptType || null,
              chaptersUrl: item.chaptersUrl || null,
              isCurated: item.markCurated === true,
            });
            
            // Import video sources from alternateEnclosures
            if (item.alternateEnclosures && Array.isArray(item.alternateEnclosures)) {
              const videoSources = extractVideoSources(item.alternateEnclosures);
              for (const videoSource of videoSources) {
                try {
                  const existing = await storage.getEpisodeSourceByUrl(episode.id, videoSource.url);
                  if (!existing) {
                    await storage.createEpisodeSource({
                      episodeId: episode.id,
                      kind: "video",
                      platform: videoSource.platform,
                      sourceUrl: videoSource.url,
                      isCanonical: false,
                      alignmentOffsetSeconds: 0,
                    });
                    console.log(`[FEED_IMPORT] Created video source for: ${episode.title}`);
                  }
                } catch (srcErr) {
                  console.error(`[FEED_IMPORT] Video source error:`, srcErr);
                }
              }
            }
            
            // Auto-enqueue episode import pipeline job
            let jobsQueued = 0;
            const pipelineResult = await enqueueEpisodePipelineJob(episode.id);
            if (pipelineResult.enqueued) {
              jobsQueued++;
            }
            
            // Also enqueue YouTube transcript job for backwards compatibility if video sources exist
            const { totalEnqueued } = await maybeEnqueueYoutubeTranscriptJob(episode.id);
            jobsQueued += totalEnqueued;
            
            results.push({ 
              externalId: item.externalId, 
              episodeId: episode.id,
              title: episode.title,
              status: "imported",
              jobsQueued: jobsQueued,
              isCurated: item.markCurated === true,
            });
            successCount++;
          } catch (itemErr) {
            console.error(`[FEED_IMPORT] Item error:`, itemErr);
            results.push({ 
              externalId: item.externalId, 
              status: "error", 
              reason: itemErr instanceof Error ? itemErr.message : "Unknown error" 
            });
            errorCount++;
          }
        }
      } else if (sourceType === "youtube") {
        // YouTube import - need a podcast to attach to
        // For YouTube imports, use the channel name as podcast or allow admin to specify
        const existingPodcasts = await storage.getAllPodcasts();
        let podcast = existingPodcasts.find(p => p.title.toLowerCase() === (feedTitle || "").toLowerCase());
        
        if (!podcast) {
          podcast = await storage.createPodcast({
            title: feedTitle || "YouTube Channel",
            host: feedAuthor || "Unknown",
            description: "Imported from YouTube",
            artworkUrl: feedImage || null,
          });
          console.log(`[FEED_IMPORT] Created YouTube podcast: ${podcast.title}`);
        }
        
        // Re-fetch existing YouTube sources at import time to catch race conditions
        const allEpisodes = await storage.getAllEpisodes();
        const allSources = await Promise.all(
          allEpisodes.map(ep => storage.getEpisodeSourcesByEpisode(ep.id))
        );
        const existingYoutubeIds = new Set<string>();
        allSources.flat().forEach(source => {
          if (source.platform === "youtube" && source.sourceUrl) {
            const idMatch = source.sourceUrl.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
            if (idMatch) existingYoutubeIds.add(idMatch[1]);
          }
        });
        
        for (const item of items) {
          try {
            // Double-check duplicates at import time (handles race conditions)
            if (existingYoutubeIds.has(item.externalId)) {
              results.push({ externalId: item.externalId, status: "skipped", reason: "Already exists (detected at import time)" });
              skipCount++;
              continue;
            }
            
            if (item.alreadyInPodDNA) {
              results.push({ externalId: item.externalId, status: "skipped", reason: "Already exists" });
              skipCount++;
              continue;
            }
            
            // Create episode
            const episode = await storage.createEpisode({
              podcastId: podcast.id,
              title: item.title,
              description: null,
              type: "video",
              mediaUrl: item.videoUrl || "",
              videoUrl: item.videoUrl,
              duration: item.durationSeconds || 0,
              publishedAt: item.publishedAt ? new Date(item.publishedAt) : new Date(),
              isCurated: item.markCurated === true,
            });
            
            // Create YouTube video source
            await storage.createEpisodeSource({
              episodeId: episode.id,
              kind: "video",
              platform: "youtube",
              sourceUrl: item.videoUrl,
              isCanonical: true,
              alignmentOffsetSeconds: 0,
            });
            
            // Auto-enqueue episode import pipeline job
            let jobsQueued = 0;
            const pipelineResult = await enqueueEpisodePipelineJob(episode.id);
            if (pipelineResult.enqueued) {
              jobsQueued++;
            }
            
            // Also enqueue YouTube transcript job for backwards compatibility
            const { totalEnqueued } = await maybeEnqueueYoutubeTranscriptJob(episode.id);
            jobsQueued += totalEnqueued;
            
            results.push({ 
              externalId: item.externalId, 
              episodeId: episode.id,
              title: episode.title,
              status: "imported",
              jobsQueued: jobsQueued,
              isCurated: item.markCurated === true,
            });
            successCount++;
          } catch (itemErr) {
            console.error(`[FEED_IMPORT] YouTube item error:`, itemErr);
            results.push({ 
              externalId: item.externalId, 
              status: "error", 
              reason: itemErr instanceof Error ? itemErr.message : "Unknown error" 
            });
            errorCount++;
          }
        }
      } else {
        return res.status(400).json({ error: `Unknown sourceType: ${sourceType}` });
      }

      console.log(`[FEED_IMPORT] Complete: ${successCount} imported, ${skipCount} skipped, ${errorCount} errors`);
      
      res.json({
        success: true,
        summary: {
          imported: successCount,
          skipped: skipCount,
          errors: errorCount,
        },
        results,
      });
    } catch (error) {
      console.error("[FEED_IMPORT] Error:", error);
      res.status(500).json({ error: "Failed to import episodes" });
    }
  });

  // ============ CATEGORY ROUTES ============
  
  // Get all categories (public)
  app.get("/api/categories", async (_req, res) => {
    try {
      const categoriesData = await storage.getCategoriesWithCounts();
      res.json(categoriesData);
    } catch (error) {
      console.error("Error fetching categories:", error);
      res.status(500).json({ error: "Failed to fetch categories" });
    }
  });

  // Get category by slug with podcasts (public)
  app.get("/api/categories/:slug", async (req, res) => {
    try {
      const { slug } = req.params;
      const category = await storage.getCategoryBySlug(slug);
      if (!category) {
        return res.status(404).json({ error: "Category not found" });
      }
      const podcasts = await storage.getPodcastsByCategory(category.id);
      res.json({ category, podcasts });
    } catch (error) {
      console.error("Error fetching category:", error);
      res.status(500).json({ error: "Failed to fetch category" });
    }
  });

  // Admin: Create category
  app.post("/api/admin/categories", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const data = insertCategorySchema.parse(req.body);
      const category = await storage.createCategory(data);
      res.status(201).json(category);
    } catch (error) {
      console.error("Error creating category:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: "Failed to create category" });
    }
  });

  // Admin: Update category
  app.patch("/api/admin/categories/:id", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { id } = req.params;
      const data = insertCategorySchema.partial().parse(req.body);
      const category = await storage.updateCategory(id, data);
      if (!category) {
        return res.status(404).json({ error: "Category not found" });
      }
      res.json(category);
    } catch (error) {
      console.error("Error updating category:", error);
      res.status(500).json({ error: "Failed to update category" });
    }
  });

  // Admin: Delete category
  app.delete("/api/admin/categories/:id", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { id } = req.params;
      const deleted = await storage.deleteCategory(id);
      if (!deleted) {
        return res.status(404).json({ error: "Category not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting category:", error);
      res.status(500).json({ error: "Failed to delete category" });
    }
  });

  // Get categories for a podcast (public)
  app.get("/api/podcasts/:id/categories", async (req, res) => {
    try {
      const { id } = req.params;
      const categoriesData = await storage.getCategoriesForPodcast(id);
      res.json(categoriesData);
    } catch (error) {
      console.error("Error fetching podcast categories:", error);
      res.status(500).json({ error: "Failed to fetch categories" });
    }
  });

  // Admin: Assign category to podcast
  app.post("/api/admin/podcasts/:id/categories", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { id } = req.params;
      const { categoryId } = z.object({ categoryId: z.string() }).parse(req.body);
      await storage.assignCategoryToPodcast(id, categoryId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error assigning category:", error);
      res.status(500).json({ error: "Failed to assign category" });
    }
  });

  // Admin: Remove category from podcast
  app.delete("/api/admin/podcasts/:id/categories/:categoryId", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { id, categoryId } = req.params;
      await storage.removeCategoryFromPodcast(id, categoryId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing category:", error);
      res.status(500).json({ error: "Failed to remove category" });
    }
  });

  // ============ ENTITY ROUTES (Products, Books, Restaurants, Venues) ============

  // Get all entities (admin)
  app.get("/api/admin/entities", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const entitiesData = await storage.getEntitiesWithStats();
      res.json(entitiesData);
    } catch (error) {
      console.error("Error fetching entities:", error);
      res.status(500).json({ error: "Failed to fetch entities" });
    }
  });

  // Search entities (admin)
  app.get("/api/admin/entities/search", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { q, type } = req.query;
      const query = typeof q === "string" ? q : "";
      const entityType = typeof type === "string" ? type : undefined;
      const entitiesData = await storage.searchEntities(query, entityType);
      res.json(entitiesData);
    } catch (error) {
      console.error("Error searching entities:", error);
      res.status(500).json({ error: "Failed to search entities" });
    }
  });

  // Get entity types and affiliate networks (for forms)
  app.get("/api/entities/options", async (_req, res) => {
    res.json({
      types: entityTypes,
      networks: affiliateNetworks,
    });
  });

  // Get top entities with mention aggregation (for affiliate arbitrage)
  app.get("/api/entities/top", async (req, res) => {
    try {
      const type = typeof req.query.type === "string" ? req.query.type : undefined;
      const minMentions = typeof req.query.minMentions === "string" ? parseInt(req.query.minMentions, 10) : 1;
      const limit = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : 50;

      const topEntities = await storage.getTopEntitiesWithMentions({
        type,
        minMentions: isNaN(minMentions) ? 1 : minMentions,
        limit: isNaN(limit) ? 50 : Math.min(limit, 100),
      });

      res.json({
        entities: topEntities,
        totalCount: topEntities.length,
        filters: { type, minMentions, limit },
      });
    } catch (error) {
      console.error("Error fetching top entities:", error);
      res.status(500).json({ error: "Failed to fetch top entities" });
    }
  });

  // Generate recommendation post from top entities (admin)
  app.post("/api/admin/entities/generate-post", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { generateRecommendationPost, generateQuickPost } = await import("./services/recommendation-post-generator");

      const { 
        category = "AI Tools",
        type,
        minMentions = 2,
        maxEntities = 10,
        tone = "data-driven",
        quick = false,
      } = req.body;

      const topEntities = await storage.getTopEntitiesWithMentions({
        type,
        minMentions,
        limit: maxEntities,
      });

      if (topEntities.length === 0) {
        return res.status(404).json({ 
          error: "No entities found matching criteria",
          suggestion: "Run affiliate entity extraction first or lower minMentions"
        });
      }

      const entitiesForPost = topEntities.map(e => ({
        name: e.name,
        type: e.type,
        description: e.description,
        mentionCount: e.mentionCount,
        episodeCount: e.episodeCount,
        speakers: e.speakers,
        quotes: e.quotes.map(q => ({ text: q.text, episodeTitle: q.episodeTitle })),
        affiliateUrl: e.affiliateUrl,
      }));

      if (quick) {
        const quickPost = await generateQuickPost(category, entitiesForPost);
        return res.json({
          success: true,
          post: quickPost,
          entitiesUsed: topEntities.length,
          format: "quick",
        });
      }

      const post = await generateRecommendationPost({
        category,
        entities: entitiesForPost,
        maxEntities,
        tone,
      });

      res.json({
        success: true,
        post,
        entitiesUsed: topEntities.length,
        format: "full",
      });
    } catch (error) {
      console.error("Error generating recommendation post:", error);
      res.status(500).json({ error: "Failed to generate recommendation post" });
    }
  });

  // Create entity (admin)
  app.post("/api/admin/entities", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const data = insertEntitySchema.parse(req.body);
      const entity = await storage.createEntity(data);
      res.status(201).json(entity);
    } catch (error) {
      console.error("Error creating entity:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: "Failed to create entity" });
    }
  });

  // Update entity (admin)
  app.patch("/api/admin/entities/:id", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { id } = req.params;
      const data = insertEntitySchema.partial().parse(req.body);
      const entity = await storage.updateEntity(id, data);
      if (!entity) {
        return res.status(404).json({ error: "Entity not found" });
      }
      res.json(entity);
    } catch (error) {
      console.error("Error updating entity:", error);
      res.status(500).json({ error: "Failed to update entity" });
    }
  });

  // Delete entity (admin)
  app.delete("/api/admin/entities/:id", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { id } = req.params;
      const deleted = await storage.deleteEntity(id);
      if (!deleted) {
        return res.status(404).json({ error: "Entity not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting entity:", error);
      res.status(500).json({ error: "Failed to delete entity" });
    }
  });

  // Fix transcript timestamps for an episode (admin) - normalizes timestamps to start at 0
  app.post("/api/admin/episodes/:id/fix-timestamps", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const episodeId = req.params.id;
      const episode = await storage.getEpisode(episodeId);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }

      const segments = await storage.getSegmentsByEpisode(episodeId);
      if (segments.length === 0) {
        return res.status(400).json({ error: "Episode has no transcript segments" });
      }

      // Find the minimum start time across all segments
      const minStartTime = Math.min(...segments.map(s => s.startTime));
      
      if (minStartTime < 60) {
        return res.json({ 
          success: true, 
          message: "Timestamps already normalized", 
          offset: 0,
          segmentsUpdated: 0 
        });
      }

      console.log(`[FIX-TIMESTAMPS] Episode ${episodeId}: Found offset of ${minStartTime}s, normalizing ${segments.length} segments`);

      // Update each segment with normalized timestamps
      let updatedCount = 0;
      for (const segment of segments) {
        const newStartTime = Math.max(0, segment.startTime - minStartTime);
        const newEndTime = Math.max(0, segment.endTime - minStartTime);
        
        await storage.updateTranscriptSegment(segment.id, {
          startTime: newStartTime,
          endTime: newEndTime
        });
        updatedCount++;
      }

      res.json({ 
        success: true, 
        message: `Normalized ${updatedCount} segments by subtracting ${minStartTime}s offset`,
        offset: minStartTime,
        segmentsUpdated: updatedCount
      });
    } catch (error) {
      console.error("Error fixing timestamps:", error);
      res.status(500).json({ error: "Failed to fix timestamps" });
    }
  });

  // Trigger manual entity extraction for episode (admin)
  app.post("/api/admin/episodes/:id/extract-entities", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const episodeId = req.params.id;
      const episode = await storage.getEpisode(episodeId);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }

      const segments = await storage.getSegmentsByEpisode(episodeId);
      if (segments.length === 0) {
        return res.status(400).json({ error: "Episode has no transcript. Generate a transcript first." });
      }

      const fullText = segments.map(s => s.text).join(" ");
      
      const { extractAndStoreEntitiesForEpisode } = await import("./entity-extraction");
      const result = await extractAndStoreEntitiesForEpisode(episodeId, fullText);

      if (!result.success) {
        return res.status(500).json({ error: result.error || "Entity extraction failed" });
      }

      res.json({
        success: true,
        created: result.created,
        linked: result.linked,
        message: `Entity extraction complete: ${result.created} new entities created, ${result.linked} mentions linked`
      });
    } catch (error) {
      console.error("Error extracting entities:", error);
      res.status(500).json({ error: "Failed to extract entities" });
    }
  });

  // ============ ENTITY MENTION ROUTES ============

  // Get entity mentions for episode (public - only approved)
  app.get("/api/episodes/:id/entities", async (req, res) => {
    try {
      const { id } = req.params;
      const mentions = await storage.getApprovedEntityMentionsByEpisode(id);
      res.json(mentions);
    } catch (error) {
      console.error("Error fetching episode entities:", error);
      res.status(500).json({ error: "Failed to fetch entities" });
    }
  });

  // Get all entity mentions for episode (admin - includes unapproved)
  app.get("/api/admin/episodes/:id/entities", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { id } = req.params;
      const mentions = await storage.getEntityMentionsByEpisode(id);
      res.json(mentions);
    } catch (error) {
      console.error("Error fetching episode entities:", error);
      res.status(500).json({ error: "Failed to fetch entities" });
    }
  });

  // Add entity mention to episode (admin)
  app.post("/api/admin/episodes/:id/entities", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { id } = req.params;
      const data = insertEntityMentionSchema.parse({
        ...req.body,
        episodeId: id,
        isAutoExtracted: false,
        isApproved: true, // Manually added = auto-approved
      });
      const mention = await storage.createEntityMention(data);
      res.status(201).json(mention);
    } catch (error) {
      console.error("Error adding entity to episode:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: "Failed to add entity" });
    }
  });

  // Approve entity mention (admin)
  app.post("/api/admin/entity-mentions/:id/approve", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { id } = req.params;
      const mention = await storage.approveEntityMention(id);
      if (!mention) {
        return res.status(404).json({ error: "Entity mention not found" });
      }
      res.json(mention);
    } catch (error) {
      console.error("Error approving entity mention:", error);
      res.status(500).json({ error: "Failed to approve entity mention" });
    }
  });

  // Unapprove entity mention (admin)
  app.post("/api/admin/entity-mentions/:id/unapprove", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { id } = req.params;
      const mention = await storage.unapproveEntityMention(id);
      if (!mention) {
        return res.status(404).json({ error: "Entity mention not found" });
      }
      res.json(mention);
    } catch (error) {
      console.error("Error unapproving entity mention:", error);
      res.status(500).json({ error: "Failed to unapprove entity mention" });
    }
  });

  // Delete entity mention (admin)
  app.delete("/api/admin/entity-mentions/:id", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { id } = req.params;
      const deleted = await storage.deleteEntityMention(id);
      if (!deleted) {
        return res.status(404).json({ error: "Entity mention not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting entity mention:", error);
      res.status(500).json({ error: "Failed to delete entity mention" });
    }
  });

  // ============ CANONICAL ENTITY LINKING ============

  // Get canonical entities for episode (grouped by canonical entity with mentions)
  app.get("/api/admin/episodes/:id/canonical-entities", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { id } = req.params;
      const entities = await storage.getCanonicalEntitiesForEpisode(id);
      res.json({ entities });
    } catch (error) {
      console.error("Error fetching canonical entities:", error);
      res.status(500).json({ error: "Failed to fetch canonical entities" });
    }
  });

  // Enqueue entity linking job for episode
  app.post("/api/admin/episodes/:id/entities/link", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { id } = req.params;

      const episode = await storage.getEpisode(id);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }

      const mentions = await storage.getEntityMentionsByEpisode(id);
      if (mentions.length === 0) {
        return res.status(400).json({ error: "No entity mentions found for this episode" });
      }

      const sources = await storage.getEpisodeSourcesByEpisode(id);
      let sourceForJob = sources.find((s: { isCanonical: boolean }) => s.isCanonical) || sources[0];

      if (!sourceForJob) {
        sourceForJob = await storage.createEpisodeSource({
          episodeId: id,
          sourceUrl: episode.mediaUrl,
          kind: "audio",
          platform: "other",
          isCanonical: true,
        });
      }

      // Check for existing pending/running job
      const existingJobs = await storage.getJobsByEpisodeSource(sourceForJob.id);
      const existingJob = existingJobs.find(j => j.type === "link_entities" && (j.status === "pending" || j.status === "running"));
      if (existingJob) {
        return res.status(409).json({ 
          error: "Entity linking job already in progress",
          jobId: existingJob.id,
          status: existingJob.status
        });
      }

      const job = await storage.createJob({
        type: "link_entities",
        status: "pending",
        episodeSourceId: sourceForJob.id,
      });

      res.json({ 
        success: true, 
        jobId: job.id,
        message: `Entity linking job enqueued for ${mentions.length} mentions`
      });
    } catch (error) {
      console.error("Error enqueueing entity linking job:", error);
      res.status(500).json({ error: "Failed to enqueue entity linking job" });
    }
  });

  // ============ CANONICAL ENTITIES ADMIN (Phase 3b - Entity Intelligence Layer) ============

  // Backfill: queue link_entities jobs for all episodes with unlinked mentions
  app.post("/api/admin/entities/link/backfill", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const episodeIds = await storage.getEpisodesWithUnlinkedMentions();
      
      if (episodeIds.length === 0) {
        return res.json({ status: "complete", episodesQueued: 0, message: "All entity mentions are already linked" });
      }

      let queued = 0;
      for (const episodeId of episodeIds) {
        try {
          const sources = await storage.getEpisodeSourcesByEpisode(episodeId);
          let sourceForJob = sources.find((s: { isCanonical: boolean }) => s.isCanonical) || sources[0];

          if (!sourceForJob) {
            const episode = await storage.getEpisode(episodeId);
            if (!episode) continue;
            
            sourceForJob = await storage.createEpisodeSource({
              episodeId: episodeId,
              sourceUrl: episode.mediaUrl,
              kind: "audio",
              platform: "other",
              isCanonical: true,
            });
          }

          const existingJobs = await storage.getJobsByEpisodeSource(sourceForJob.id);
          const existingJob = existingJobs.find(j => j.type === "link_entities" && (j.status === "pending" || j.status === "running"));
          if (existingJob) continue;

          await storage.createJob({
            type: "link_entities",
            status: "pending",
            episodeSourceId: sourceForJob.id,
          });
          queued++;
        } catch (err) {
          console.error(`Failed to queue link_entities for episode ${episodeId}:`, err);
        }
      }

      res.json({ status: "queued", episodesQueued: queued, totalEpisodes: episodeIds.length });
    } catch (error) {
      console.error("Error in entity link backfill:", error);
      res.status(500).json({ error: "Failed to run entity link backfill" });
    }
  });

  // List canonical entities with stats (search, filter, pagination)
  app.get("/api/admin/canonical-entities", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { q, type, limit, offset } = req.query;
      const result = await storage.getCanonicalEntitiesWithStats({
        q: typeof q === "string" ? q : undefined,
        type: typeof type === "string" ? type : undefined,
        limit: typeof limit === "string" ? parseInt(limit, 10) : 50,
        offset: typeof offset === "string" ? parseInt(offset, 10) : 0,
      });

      res.json(result);
    } catch (error) {
      console.error("Error fetching canonical entities:", error);
      res.status(500).json({ error: "Failed to fetch canonical entities" });
    }
  });

  // Get canonical entity detail with all mentions
  app.get("/api/admin/canonical-entities/:id", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { id } = req.params;
      const result = await storage.getCanonicalEntityWithMentions(id);
      
      if (!result) {
        return res.status(404).json({ error: "Canonical entity not found" });
      }

      res.json(result);
    } catch (error) {
      console.error("Error fetching canonical entity:", error);
      res.status(500).json({ error: "Failed to fetch canonical entity" });
    }
  });

  // Update canonical entity (name, type, externalRefs)
  app.patch("/api/admin/canonical-entities/:id", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { id } = req.params;
      const { name, type, externalRefs } = req.body;

      const updateData: Record<string, any> = {};
      if (name !== undefined) updateData.name = name;
      if (type !== undefined) updateData.type = type;
      if (externalRefs !== undefined) updateData.externalRefs = externalRefs;

      const updated = await storage.updateCanonicalEntity(id, updateData);
      
      if (!updated) {
        return res.status(404).json({ error: "Canonical entity not found" });
      }

      res.json(updated);
    } catch (error) {
      console.error("Error updating canonical entity:", error);
      res.status(500).json({ error: "Failed to update canonical entity" });
    }
  });

  // Merge two canonical entities (source -> target)
  app.post("/api/admin/canonical-entities/merge", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { sourceId, targetId } = req.body;
      
      if (!sourceId || !targetId) {
        return res.status(400).json({ error: "Both sourceId and targetId are required" });
      }

      if (sourceId === targetId) {
        return res.status(400).json({ error: "Cannot merge entity into itself" });
      }

      const source = await storage.getCanonicalEntityById(sourceId);
      const target = await storage.getCanonicalEntityById(targetId);

      if (!source) {
        return res.status(404).json({ error: "Source entity not found" });
      }
      if (!target) {
        return res.status(404).json({ error: "Target entity not found" });
      }

      const result = await storage.mergeCanonicalEntities(sourceId, targetId);
      
      res.json({ 
        status: "ok", 
        mergedCount: result.mergedCount,
        message: `Merged ${result.mergedCount} mention(s) from "${source.name}" into "${target.name}"`
      });
    } catch (error) {
      console.error("Error merging canonical entities:", error);
      res.status(500).json({ error: "Failed to merge canonical entities" });
    }
  });

  // Search canonical entities for autocomplete (used in merge UI)
  app.get("/api/admin/canonical-entities/search", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { q, excludeId } = req.query;
      const result = await storage.getCanonicalEntitiesWithStats({
        q: typeof q === "string" ? q : undefined,
        limit: 10,
        offset: 0,
      });

      const items = typeof excludeId === "string" 
        ? result.items.filter(e => e.id !== excludeId)
        : result.items;

      res.json({ items });
    } catch (error) {
      console.error("Error searching canonical entities:", error);
      res.status(500).json({ error: "Failed to search canonical entities" });
    }
  });

  // ============ SEMANTIC TOPICS (PHASE 4) ============

  // List topics with stats (search, pagination)
  app.get("/api/admin/topics", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { q, limit, offset } = req.query;
      const result = await storage.getTopicsWithStats({
        q: typeof q === "string" ? q : undefined,
        limit: typeof limit === "string" ? parseInt(limit, 10) : 50,
        offset: typeof offset === "string" ? parseInt(offset, 10) : 0,
      });

      res.json(result);
    } catch (error) {
      console.error("Error fetching topics:", error);
      res.status(500).json({ error: "Failed to fetch topics" });
    }
  });

  // Get topic detail with statements
  app.get("/api/admin/topics/:id", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { id } = req.params;
      const result = await storage.getTopicWithStatements(id);
      
      if (!result) {
        return res.status(404).json({ error: "Topic not found" });
      }

      res.json(result);
    } catch (error) {
      console.error("Error fetching topic:", error);
      res.status(500).json({ error: "Failed to fetch topic" });
    }
  });

  // Update topic (name, description)
  app.patch("/api/admin/topics/:id", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { id } = req.params;
      const { name, description } = req.body;

      const updateData: Record<string, any> = {};
      if (name !== undefined) {
        updateData.name = name;
        updateData.slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      }
      if (description !== undefined) updateData.description = description;

      const updated = await storage.updateTopic(id, updateData);
      
      if (!updated) {
        return res.status(404).json({ error: "Topic not found" });
      }

      res.json(updated);
    } catch (error) {
      console.error("Error updating topic:", error);
      res.status(500).json({ error: "Failed to update topic" });
    }
  });

  // Delete topic
  app.delete("/api/admin/topics/:id", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { id } = req.params;
      const deleted = await storage.deleteTopic(id);
      
      if (!deleted) {
        return res.status(404).json({ error: "Topic not found" });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting topic:", error);
      res.status(500).json({ error: "Failed to delete topic" });
    }
  });

  // Trigger topic discovery job
  app.post("/api/admin/topics/discover", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      // Create a topic_discovery job (global - not tied to a specific episode)
      const job = await storage.createJob({
        type: "topic_discovery",
        episodeSourceId: null,
      });

      res.json({ success: true, jobId: job.id, message: "Topic discovery job queued" });
    } catch (error) {
      console.error("Error triggering topic discovery:", error);
      res.status(500).json({ error: "Failed to trigger topic discovery" });
    }
  });

  // Trigger topic assignment job
  app.post("/api/admin/topics/assign", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      // Create an assign_topics job (global - not tied to a specific episode)
      const job = await storage.createJob({
        type: "assign_topics",
        episodeSourceId: null,
      });

      res.json({ success: true, jobId: job.id, message: "Topic assignment job queued" });
    } catch (error) {
      console.error("Error triggering topic assignment:", error);
      res.status(500).json({ error: "Failed to trigger topic assignment" });
    }
  });

  // ============ AFFILIATE CLICK TRACKING ============
  
  // Track click and redirect to affiliate URL (public)
  app.get("/api/entities/:id/click", async (req, res) => {
    try {
      const { id } = req.params;
      const { episodeId } = req.query;
      
      const entity = await storage.getEntity(id);
      if (!entity || !entity.affiliateUrl) {
        return res.status(404).json({ error: "Entity or affiliate URL not found" });
      }

      // Check entity is active
      if (!entity.isActive) {
        return res.status(404).json({ error: "Entity is not active" });
      }

      // Validate affiliate URL - only allow http/https schemes
      try {
        const url = new URL(entity.affiliateUrl);
        if (!['http:', 'https:'].includes(url.protocol)) {
          console.error(`[SECURITY] Invalid affiliate URL protocol: ${url.protocol} for entity ${id}`);
          return res.status(400).json({ error: "Invalid affiliate URL" });
        }
      } catch (urlError) {
        console.error(`[SECURITY] Invalid affiliate URL format for entity ${id}:`, entity.affiliateUrl);
        return res.status(400).json({ error: "Invalid affiliate URL" });
      }

      // Log the click
      await storage.logEntityClick({
        entityId: id,
        episodeId: typeof episodeId === "string" ? episodeId : undefined,
        userId: req.user?.claims?.sub || undefined,
        referrer: req.headers.referer || null,
        userAgent: req.headers["user-agent"] || null,
      });

      // Redirect to affiliate URL (safe - validated stored URL)
      res.redirect(302, entity.affiliateUrl);
    } catch (error) {
      console.error("Error tracking entity click:", error);
      res.status(500).json({ error: "Failed to process click" });
    }
  });

  // Get episodes linked to an entity (admin)
  app.get("/api/admin/entities/:id/episodes", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { id } = req.params;
      const episodes = await storage.getEpisodesByEntity(id);
      res.json(episodes);
    } catch (error) {
      console.error("Error fetching entity episodes:", error);
      res.status(500).json({ error: "Failed to fetch entity episodes" });
    }
  });

  // Get entity click stats (admin)
  app.get("/api/admin/entities/:id/stats", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { id } = req.params;
      const stats = await storage.getEntityClickStats(id);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching entity stats:", error);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  // ============ CLIPS ROUTES ============
  
  // Get all clips with metadata (admin only)
  app.get("/api/admin/clips", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const user = await storage.getUser(userId);
      if (!user || user.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      // Get all clips - pagination can be added client-side for now
      // Since clip counts are typically manageable for admin use
      const clips = await storage.getAllClipsWithMetadata();
      res.json(clips);
    } catch (error) {
      console.error("Error fetching all clips:", error);
      res.status(500).json({ error: "Failed to fetch clips" });
    }
  });

  // Get user's clip requests (authenticated) - MUST be before /api/clips/:id
  app.get("/api/clips/my-requests", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const requests = await storage.getUserClipRequests(userId);
      res.json(requests);
    } catch (error) {
      console.error("Error fetching user clip requests:", error);
      res.status(500).json({ error: "Failed to fetch clip requests" });
    }
  });

  // Get clip request with its viral moments - MUST be before /api/clips/:id
  app.get("/api/clips/:id/moments", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      const { id } = req.params;
      
      // Get the clip request
      const request = await storage.getUserClipRequest(id);
      if (!request) {
        return res.status(404).json({ error: "Clip request not found" });
      }
      
      // Verify ownership
      if (request.userId !== userId) {
        return res.status(403).json({ error: "Not authorized to view this request" });
      }
      
      // Get viral moments for this episode
      let moments: any[] = [];
      if (request.episodeId) {
        moments = await storage.getViralMomentsByEpisode(request.episodeId);
      }
      
      // Get episode details for video player
      let episode = null;
      let youtubeSource = null;
      if (request.episodeId) {
        episode = await storage.getEpisode(request.episodeId);
        const sources = await storage.getEpisodeSourcesByEpisode(request.episodeId);
        youtubeSource = sources.find((s: any) => s.platform === "youtube");
      }
      
      res.json({
        request,
        moments: moments.map(m => ({
          id: m.id,
          suggestedTitle: m.suggestedTitle,
          viralityScore: m.viralityScore,
          startTime: m.startTime,
          endTime: m.endTime,
          text: m.text,
          pullQuote: m.pullQuote,
          hookType: m.hookType,
          hookReason: m.hookReason,
          contentType: m.contentType,
          topics: m.topics,
          clipStatus: m.clipStatus,
          videoPath: m.videoPath,
          captionedPath: m.captionedPath,
        })),
        episode: episode ? {
          id: episode.id,
          title: episode.title,
          podcastId: episode.podcastId,
        } : null,
        youtubeVideoId: youtubeSource?.externalId || request.youtubeVideoId,
      });
    } catch (error) {
      console.error("Error fetching clip request moments:", error);
      res.status(500).json({ error: "Failed to fetch moments" });
    }
  });

  // Get single clip with full metadata (public - for sharing)
  app.get("/api/clips/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const clip = await storage.getClipWithMetadata(id);
      if (!clip) {
        return res.status(404).json({ error: "Clip not found" });
      }
      res.json(clip);
    } catch (error) {
      console.error("Error fetching clip:", error);
      res.status(500).json({ error: "Failed to fetch clip" });
    }
  });
  
  // Get clips for episode (public)
  app.get("/api/episodes/:id/clips", async (req, res) => {
    try {
      const { id } = req.params;
      const clips = await storage.getClipsByEpisode(id);
      res.json(clips);
    } catch (error) {
      console.error("Error fetching episode clips:", error);
      res.status(500).json({ error: "Failed to fetch clips" });
    }
  });

  // Create clip (authenticated)
  app.post("/api/episodes/:id/clips", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { id } = req.params;
      let { title, startTime, endTime, annotationId, transcriptText } = req.body;

      if (!title || startTime === undefined || endTime === undefined) {
        return res.status(400).json({ error: "Title, startTime, and endTime are required" });
      }

      // If creating clip from an annotation, use the annotation's timestamp for accuracy
      if (annotationId) {
        const annotation = await storage.getAnnotation(annotationId);
        if (annotation && annotation.timestamp !== null && annotation.timestamp !== undefined) {
          // Use annotation's calculated timestamp as the start time
          // Keep the original duration (endTime - startTime)
          const duration = endTime - startTime;
          startTime = annotation.timestamp;
          endTime = annotation.timestamp + duration;
        }
      }

      if (startTime < 0 || endTime <= startTime) {
        return res.status(400).json({ error: "Invalid time range" });
      }

      const clip = await storage.createClip({
        episodeId: id,
        userId,
        title,
        startTime,
        endTime,
        annotationId: annotationId || null,
        transcriptText: transcriptText || null,
      });

      res.status(201).json(clip);
    } catch (error) {
      console.error("Error creating clip:", error);
      res.status(500).json({ error: "Failed to create clip" });
    }
  });

  // Delete clip (owner or admin)
  app.delete("/api/clips/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { id } = req.params;
      const clip = await storage.getClip(id);
      if (!clip) {
        return res.status(404).json({ error: "Clip not found" });
      }

      // Check ownership or admin
      const currentUser = await storage.getUser(userId);
      if (clip.userId !== userId && currentUser?.role !== "admin") {
        return res.status(403).json({ error: "Not authorized to delete this clip" });
      }

      const deleted = await storage.deleteClip(id);
      if (!deleted) {
        return res.status(500).json({ error: "Failed to delete clip" });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting clip:", error);
      res.status(500).json({ error: "Failed to delete clip" });
    }
  });

  // ============ USER CLIP GENERATION ROUTES ============
  
  // Validate a YouTube video before queuing (lightweight pre-check)
  app.post("/api/clips/validate", isAuthenticated, async (req, res) => {
    try {
      const { youtubeVideoId } = req.body;
      if (!youtubeVideoId) {
        return res.status(400).json({ valid: false, error: "YouTube video ID is required" });
      }

      const { Innertube } = await import("youtubei.js");
      const yt = await Innertube.create();

      try {
        const info = await yt.getInfo(youtubeVideoId);
        const title = info.basic_info.title || "Unknown";
        const durationSeconds = info.basic_info.duration || 0;
        const isLive = info.basic_info.is_live;
        const thumbnail = `https://img.youtube.com/vi/${youtubeVideoId}/mqdefault.jpg`;

        if (isLive) {
          return res.json({ valid: false, error: "Live streams cannot be processed. Please wait until the stream ends and try again." });
        }

        const MAX_DURATION_SECONDS = 3 * 60 * 60; // 3 hours
        if (durationSeconds > MAX_DURATION_SECONDS) {
          return res.json({ valid: false, error: `This video is ${Math.round(durationSeconds / 60)} minutes long. Videos over 3 hours cannot be processed.` });
        }

        let hasCaptions = false;
        try {
          const transcriptInfo = await info.getTranscript();
          hasCaptions = !!(transcriptInfo?.transcript?.content?.body?.initial_segments?.length);
        } catch {
          hasCaptions = false;
        }

        const estimatedMinutes = Math.max(2, Math.round(durationSeconds / 60 * 0.3));

        return res.json({
          valid: true,
          title,
          durationSeconds,
          thumbnail,
          hasCaptions,
          estimatedProcessingMinutes: estimatedMinutes,
          captionWarning: !hasCaptions ? "This video has no captions. We'll transcribe the audio directly, which may take longer." : null,
        });
      } catch (err: any) {
        const msg = err.message || "";
        if (msg.includes("Sign in to confirm your age")) {
          return res.json({ valid: false, error: "This video is age-restricted and cannot be processed." });
        }
        if (msg.includes("Private video") || msg.includes("private video")) {
          return res.json({ valid: false, error: "This video is private. Please make it public or unlisted and try again." });
        }
        if (msg.includes("Video unavailable") || msg.includes("video unavailable")) {
          return res.json({ valid: false, error: "This video is unavailable or has been removed." });
        }
        return res.json({ valid: false, error: "Could not access this video. Please check the URL and try again." });
      }
    } catch (error) {
      console.error("Error validating video:", error);
      return res.status(500).json({ valid: false, error: "Failed to validate video. Please try again." });
    }
  });

  // Generate clips from YouTube URL (authenticated)
  app.post("/api/clips/generate", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { youtubeVideoId, youtubeUrl } = req.body;
      if (!youtubeVideoId || !youtubeUrl) {
        return res.status(400).json({ error: "YouTube video ID and URL are required" });
      }

      // Check for duplicate submissions by same user
      const existingRequests = await storage.getUserClipRequests(userId);
      const duplicate = existingRequests.find(
        (r: any) => r.youtubeVideoId === youtubeVideoId && 
        (r.status === "pending" || r.status === "analyzing" || r.status === "complete")
      );
      if (duplicate) {
        return res.status(409).json({ 
          error: "duplicate",
          existingRequestId: duplicate.id,
          existingStatus: duplicate.status,
          message: duplicate.status === "complete" 
            ? "You've already generated clips for this video." 
            : "This video is already being processed.",
        });
      }

      // Create the clip request
      const request = await storage.createUserClipRequest({
        userId,
        youtubeVideoId,
        youtubeUrl,
        status: "pending",
        statusMessage: "Queued for processing",
      });

      console.log(`[CLIP-GEN] Created clip request ${request.id} for user ${userId}, video ${youtubeVideoId}`);

      res.status(201).json({
        id: request.id,
        status: request.status,
        message: "Your video has been queued for clip generation. Check My Clips for progress.",
      });
    } catch (error) {
      console.error("Error creating clip request:", error);
      res.status(500).json({ error: "Failed to create clip request" });
    }
  });

  // Get specific clip request with viral moments (authenticated)
  app.get("/api/clips/requests/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { id } = req.params;
      const request = await storage.getUserClipRequest(id);
      
      if (!request) {
        return res.status(404).json({ error: "Clip request not found" });
      }

      if (request.userId !== userId) {
        return res.status(403).json({ error: "Not authorized to view this request" });
      }

      // If the request has an episode, get the viral moments
      let moments: any[] = [];
      if (request.episodeId) {
        moments = await storage.getViralMomentsByEpisode(request.episodeId);
      }

      res.json({ ...request, moments });
    } catch (error) {
      console.error("Error fetching clip request:", error);
      res.status(500).json({ error: "Failed to fetch clip request" });
    }
  });

  // ============ CLIP ORDERS ROUTES (Paid clip generation) ============

  // Create a new clip order (request paid clip generation)
  app.post("/api/orders/create", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const user = await storage.getUser(userId);
      if (!user?.email) {
        return res.status(400).json({ error: "Email required to place order" });
      }

      const { clipRequestId } = req.body;
      if (!clipRequestId) {
        return res.status(400).json({ error: "Clip request ID is required" });
      }

      // Get the clip request to copy video details
      const clipRequest = await storage.getUserClipRequest(clipRequestId);
      if (!clipRequest) {
        return res.status(404).json({ error: "Clip request not found" });
      }

      if (clipRequest.userId !== userId) {
        return res.status(403).json({ error: "Not authorized" });
      }

      // Create the order
      const order = await storage.createClipOrder({
        userId,
        clipRequestId,
        youtubeUrl: clipRequest.youtubeUrl,
        youtubeVideoId: clipRequest.youtubeVideoId,
        videoTitle: clipRequest.videoTitle,
        customerEmail: user.email,
        status: "paid", // For now, mark as paid immediately (concierge MVP)
        amountPaid: 4900, // $49.00 in cents
      });

      console.log(`[CLIP-ORDER] Created order ${order.id} for user ${userId}, request ${clipRequestId}`);

      // Return full order object for frontend state update
      res.status(201).json({ order });
    } catch (error) {
      console.error("Error creating clip order:", error);
      res.status(500).json({ error: "Failed to create order" });
    }
  });

  // Get user's clip orders
  app.get("/api/orders/my-orders", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const orders = await storage.getUserClipOrders(userId);
      res.json(orders);
    } catch (error) {
      console.error("Error fetching user orders:", error);
      res.status(500).json({ error: "Failed to fetch orders" });
    }
  });

  // Check if clip request has an existing order
  app.get("/api/orders/by-request/:clipRequestId", isAuthenticated, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { clipRequestId } = req.params;
      const orders = await storage.getUserClipOrders(userId);
      const order = orders.find(o => o.clipRequestId === clipRequestId);
      
      res.json({ order: order || null });
    } catch (error) {
      console.error("Error checking order:", error);
      res.status(500).json({ error: "Failed to check order" });
    }
  });

  // ============ ADMIN CLIP ORDERS ============

  // Get all clip orders (admin)
  app.get("/api/admin/clip-orders", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const orders = await storage.getAllClipOrders();
      res.json(orders);
    } catch (error) {
      console.error("Error fetching clip orders:", error);
      res.status(500).json({ error: "Failed to fetch clip orders" });
    }
  });

  // Get pending/processing clip orders (admin)
  app.get("/api/admin/clip-orders/pending", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const orders = await storage.getPendingClipOrders();
      res.json(orders);
    } catch (error) {
      console.error("Error fetching pending orders:", error);
      res.status(500).json({ error: "Failed to fetch pending orders" });
    }
  });

  // Get single order with details (admin)
  app.get("/api/admin/clip-orders/:id", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const order = await storage.getClipOrder(id);
      
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      // Get viral moments if there's a clip request
      let moments: any[] = [];
      if (order.clipRequestId) {
        const clipRequest = await storage.getUserClipRequest(order.clipRequestId);
        if (clipRequest?.episodeId) {
          moments = await storage.getViralMomentsByEpisode(clipRequest.episodeId);
        }
      }

      res.json({ ...order, moments });
    } catch (error) {
      console.error("Error fetching order:", error);
      res.status(500).json({ error: "Failed to fetch order" });
    }
  });

  // Update order status (admin)
  app.patch("/api/admin/clip-orders/:id", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { status, fulfillmentNotes, deliverablesUrl, clipUrls } = req.body;

      const updates: any = {};
      if (status) updates.status = status;
      if (fulfillmentNotes !== undefined) updates.fulfillmentNotes = fulfillmentNotes;
      if (deliverablesUrl !== undefined) updates.deliverablesUrl = deliverablesUrl;
      if (clipUrls !== undefined) updates.clipUrls = clipUrls;
      if (status === "completed") updates.completedAt = new Date();

      const order = await storage.updateClipOrder(id, updates);
      
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      console.log(`[CLIP-ORDER] Updated order ${id} to status: ${status}`);
      res.json(order);
    } catch (error) {
      console.error("Error updating order:", error);
      res.status(500).json({ error: "Failed to update order" });
    }
  });

  // ============ FEATURE FLAGS ROUTES ============
  
  // Get all feature flags (public - for frontend config)
  // Returns a key-value object of all feature flags
  app.get("/api/settings/feature-flags", async (req, res) => {
    try {
      const flags = await storage.getAllFeatureFlags();
      // Convert array of flags to a key-value object
      const flagsObject: Record<string, string> = {};
      for (const flag of flags) {
        flagsObject[flag.key] = flag.value;
      }
      res.json(flagsObject);
    } catch (error) {
      console.error("Error fetching feature flags:", error);
      res.status(500).json({ error: "Failed to fetch feature flags" });
    }
  });
  
  // Get all feature flags (admin)
  app.get("/api/admin/feature-flags", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const flags = await storage.getAllFeatureFlags();
      res.json(flags);
    } catch (error) {
      console.error("Error fetching feature flags:", error);
      res.status(500).json({ error: "Failed to fetch feature flags" });
    }
  });

  // Get a specific feature flag (public - for frontend config)
  app.get("/api/feature-flags/:key", async (req, res) => {
    try {
      const flag = await storage.getFeatureFlag(req.params.key);
      if (!flag) {
        return res.status(404).json({ error: "Feature flag not found" });
      }
      res.json({ key: flag.key, value: flag.value });
    } catch (error) {
      console.error("Error fetching feature flag:", error);
      res.status(500).json({ error: "Failed to fetch feature flag" });
    }
  });

  // Set/update a feature flag (admin)
  app.put("/api/admin/feature-flags/:key", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { key } = req.params;
      const { value, description } = req.body;
      
      if (value === undefined) {
        return res.status(400).json({ error: "Value is required" });
      }

      const flag = await storage.setFeatureFlag(key, String(value), description, userId);
      res.json(flag);
    } catch (error) {
      console.error("Error setting feature flag:", error);
      res.status(500).json({ error: "Failed to set feature flag" });
    }
  });

  // Delete a feature flag (admin)
  app.delete("/api/admin/feature-flags/:key", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const deleted = await storage.deleteFeatureFlag(req.params.key);
      if (!deleted) {
        return res.status(404).json({ error: "Feature flag not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting feature flag:", error);
      res.status(500).json({ error: "Failed to delete feature flag" });
    }
  });

  // ============ EPISODE SEGMENTS ADMIN ROUTES ============
  
  // Get episode segments for an episode (admin)
  app.get("/api/admin/episodes/:id/segments", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const segments = await storage.getEpisodeSegmentsByEpisode(req.params.id);
      res.json(segments);
    } catch (error) {
      console.error("Error fetching episode segments:", error);
      res.status(500).json({ error: "Failed to fetch episode segments" });
    }
  });

  // Create episode segment (admin)
  app.post("/api/admin/episodes/:id/segments", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { label, startTime, endTime, summary, snippetText, segmentType, displayOrder } = req.body;
      
      if (!label || startTime === undefined) {
        return res.status(400).json({ error: "Label and startTime are required" });
      }

      const segment = await storage.createEpisodeSegment({
        episodeId: req.params.id,
        label,
        startTime,
        endTime: endTime ?? null,
        summary: summary ?? null,
        snippetText: snippetText ?? null,
        segmentType: segmentType ?? "topic",
        displayOrder: displayOrder ?? 0,
        isAiGenerated: false,
      });

      res.status(201).json(segment);
    } catch (error) {
      console.error("Error creating episode segment:", error);
      res.status(500).json({ error: "Failed to create episode segment" });
    }
  });

  // Update episode segment (admin)
  app.patch("/api/admin/episode-segments/:id", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { label, startTime, endTime, summary, snippetText, segmentType, displayOrder } = req.body;
      
      const segment = await storage.updateEpisodeSegment(req.params.id, {
        ...(label !== undefined && { label }),
        ...(startTime !== undefined && { startTime }),
        ...(endTime !== undefined && { endTime }),
        ...(summary !== undefined && { summary }),
        ...(snippetText !== undefined && { snippetText }),
        ...(segmentType !== undefined && { segmentType }),
        ...(displayOrder !== undefined && { displayOrder }),
      });

      if (!segment) {
        return res.status(404).json({ error: "Episode segment not found" });
      }

      res.json(segment);
    } catch (error) {
      console.error("Error updating episode segment:", error);
      res.status(500).json({ error: "Failed to update episode segment" });
    }
  });

  // Delete episode segment (admin)
  app.delete("/api/admin/episode-segments/:id", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const deleted = await storage.deleteEpisodeSegment(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Episode segment not found" });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting episode segment:", error);
      res.status(500).json({ error: "Failed to delete episode segment" });
    }
  });

  // Delete all episode segments for an episode (admin)
  app.delete("/api/admin/episodes/:id/segments", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const count = await storage.deleteEpisodeSegmentsByEpisode(req.params.id);
      res.json({ deleted: count });
    } catch (error) {
      console.error("Error deleting episode segments:", error);
      res.status(500).json({ error: "Failed to delete episode segments" });
    }
  });

  // ============ EPISODE SOURCES ROUTES ============
  // Get all sources for an episode (public)
  app.get("/api/episodes/:id/sources", async (req, res) => {
    try {
      const episodeId = req.params.id;
      const episode = await storage.getEpisode(episodeId);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }

      const sources = await storage.getEpisodeSourcesByEpisode(episodeId);
      res.json(sources);
    } catch (error) {
      console.error("Error fetching episode sources:", error);
      res.status(500).json({ error: "Failed to fetch episode sources" });
    }
  });

  // Get canonical source for an episode (public)
  app.get("/api/episodes/:id/sources/canonical", async (req, res) => {
    try {
      const episodeId = req.params.id;
      const episode = await storage.getEpisode(episodeId);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }

      const canonicalSource = await storage.getCanonicalSource(episodeId);
      if (!canonicalSource) {
        return res.status(404).json({ error: "No canonical source found" });
      }

      res.json(canonicalSource);
    } catch (error) {
      console.error("Error fetching canonical source:", error);
      res.status(500).json({ error: "Failed to fetch canonical source" });
    }
  });

  // Create a new source for an episode (admin)
  app.post("/api/admin/episodes/:id/sources", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const episodeId = req.params.id;
      const episode = await storage.getEpisode(episodeId);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }

      // Validate the source data
      const sourceData = insertEpisodeSourceSchema.omit({ id: true }).parse({
        ...req.body,
        episodeId,
      });

      const newSource = await storage.createEpisodeSource(sourceData);
      
      // Auto-enqueue YouTube transcript job if applicable
      const { totalEnqueued } = await maybeEnqueueYoutubeTranscriptJob(episodeId);
      if (totalEnqueued > 0) {
        console.log(`[ADMIN] Auto-queued ${totalEnqueued} YouTube transcript job(s) after source creation for episode: ${episode.title}`);
      }
      
      res.status(201).json(newSource);
    } catch (error) {
      console.error("Error creating episode source:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid source data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create episode source" });
    }
  });

  // Get a specific episode source (admin)
  app.get("/api/admin/episode-sources/:id", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const source = await storage.getEpisodeSource(req.params.id);
      if (!source) {
        return res.status(404).json({ error: "Episode source not found" });
      }

      res.json(source);
    } catch (error) {
      console.error("Error fetching episode source:", error);
      res.status(500).json({ error: "Failed to fetch episode source" });
    }
  });

  // Update an episode source (admin)
  app.patch("/api/admin/episode-sources/:id", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const sourceId = req.params.id;
      const existingSource = await storage.getEpisodeSource(sourceId);
      if (!existingSource) {
        return res.status(404).json({ error: "Episode source not found" });
      }

      // Validate partial update data
      const updateData = insertEpisodeSourceSchema.omit({ id: true, episodeId: true }).partial().parse(req.body);

      const updatedSource = await storage.updateEpisodeSource(sourceId, updateData);
      res.json(updatedSource);
    } catch (error) {
      console.error("Error updating episode source:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid source data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update episode source" });
    }
  });

  // Delete an episode source (admin)
  app.delete("/api/admin/episode-sources/:id", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const sourceId = req.params.id;
      const existingSource = await storage.getEpisodeSource(sourceId);
      if (!existingSource) {
        return res.status(404).json({ error: "Episode source not found" });
      }

      // Check if this is the last source or canonical source
      const allSources = await storage.getEpisodeSourcesByEpisode(existingSource.episodeId);
      if (allSources.length === 1) {
        return res.status(400).json({ error: "Cannot delete the last source for an episode" });
      }

      const deleted = await storage.deleteEpisodeSource(sourceId);
      if (!deleted) {
        return res.status(404).json({ error: "Episode source not found" });
      }

      // If we deleted the canonical source, make another source canonical
      if (existingSource.isCanonical) {
        const remainingSources = allSources.filter(s => s.id !== sourceId);
        if (remainingSources.length > 0) {
          await storage.setCanonicalSource(existingSource.episodeId, remainingSources[0].id);
        }
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting episode source:", error);
      res.status(500).json({ error: "Failed to delete episode source" });
    }
  });

  // Set canonical source for an episode (admin)
  app.post("/api/admin/episodes/:id/sources/:sourceId/set-canonical", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { id: episodeId, sourceId } = req.params;

      const episode = await storage.getEpisode(episodeId);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }

      const source = await storage.getEpisodeSource(sourceId);
      if (!source || source.episodeId !== episodeId) {
        return res.status(404).json({ error: "Source not found for this episode" });
      }

      const updatedSource = await storage.setCanonicalSource(episodeId, sourceId);
      res.json(updatedSource);
    } catch (error) {
      console.error("Error setting canonical source:", error);
      res.status(500).json({ error: "Failed to set canonical source" });
    }
  });

  // ============ VIDEO EVENTS ROUTES ============

  // Get video events for an episode source (public)
  app.get("/api/episode-sources/:id/video-events", async (req, res) => {
    try {
      const sourceId = req.params.id;
      const source = await storage.getEpisodeSource(sourceId);
      if (!source) {
        return res.status(404).json({ error: "Episode source not found" });
      }

      const { eventType } = req.query;
      let events;
      if (eventType) {
        events = await storage.getVideoEventsByEpisodeSourceAndType(sourceId, eventType as string);
      } else {
        events = await storage.getVideoEventsByEpisodeSource(sourceId);
      }

      res.json(events);
    } catch (error) {
      console.error("Error fetching video events:", error);
      res.status(500).json({ error: "Failed to fetch video events" });
    }
  });

  // Get all video events for an episode (across all video sources)
  app.get("/api/episodes/:id/video-events", async (req, res) => {
    try {
      const episodeId = req.params.id;
      const episode = await storage.getEpisode(episodeId);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }

      // Get all video sources for this episode
      const sources = await storage.getEpisodeSourcesByEpisode(episodeId);
      const videoSources = sources.filter(s => s.kind === "video");

      // Gather events from all video sources
      const allEvents = [];
      for (const source of videoSources) {
        const events = await storage.getVideoEventsByEpisodeSource(source.id);
        allEvents.push(...events.map(e => ({
          ...e,
          sourceLabel: source.platform || source.kind,
        })));
      }

      // Sort by startTime
      allEvents.sort((a, b) => a.startTime - b.startTime);

      res.json(allEvents);
    } catch (error) {
      console.error("Error fetching episode video events:", error);
      res.status(500).json({ error: "Failed to fetch video events" });
    }
  });

  // Trigger video analysis for an episode source (admin)
  app.post("/api/admin/episode-sources/:id/analyze-video", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const sourceId = req.params.id;
      const source = await storage.getEpisodeSource(sourceId);
      if (!source) {
        return res.status(404).json({ error: "Episode source not found" });
      }

      // Verify this is a video source with storageUrl
      if (source.kind !== "video") {
        return res.status(400).json({ error: "Source must be a video source (kind='video')" });
      }
      if (!source.storageUrl) {
        return res.status(400).json({ 
          error: "Video must be uploaded to storage. Only uploaded videos can be analyzed." 
        });
      }

      // Check if there's already a pending/running job for this source
      const existingJobs = await storage.getJobsByEpisodeSource(sourceId);
      const activeJob = existingJobs.find(
        j => j.type === "video_analysis" && (j.status === "pending" || j.status === "running")
      );
      if (activeJob) {
        return res.status(409).json({ 
          error: "Video analysis already in progress",
          jobId: activeJob.id,
        });
      }

      // Create a new video_analysis job
      const job = await storage.createJob({
        episodeSourceId: sourceId,
        type: "video_analysis",
      });

      res.status(201).json({
        message: "Video analysis job created",
        jobId: job.id,
      });
    } catch (error) {
      console.error("Error starting video analysis:", error);
      res.status(500).json({ error: "Failed to start video analysis" });
    }
  });

  // Trigger YouTube video analysis (uses Gemini's native YouTube understanding)
  app.post("/api/admin/episode-sources/:id/analyze-youtube-video", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const sourceId = req.params.id;
      const source = await storage.getEpisodeSource(sourceId);
      if (!source) {
        return res.status(404).json({ error: "Episode source not found" });
      }

      // Verify this is a YouTube source
      if (source.platform !== "youtube") {
        return res.status(400).json({ error: "Source must be a YouTube source (platform='youtube')" });
      }
      if (!source.sourceUrl) {
        return res.status(400).json({ error: "No YouTube URL found for this source" });
      }

      // Check if there's already a pending/running job for this source
      const existingJobs = await storage.getJobsByEpisodeSource(sourceId);
      const activeJob = existingJobs.find(
        j => j.type === "youtube_video_analysis" && (j.status === "pending" || j.status === "running")
      );
      if (activeJob) {
        return res.status(409).json({ 
          error: "YouTube video analysis already in progress",
          jobId: activeJob.id,
        });
      }

      // Create a new youtube_video_analysis job
      const job = await storage.createJob({
        episodeSourceId: sourceId,
        type: "youtube_video_analysis",
      });

      console.log(`[API] Created youtube_video_analysis job ${job.id} for source ${sourceId}`);

      res.status(201).json({
        message: "YouTube video analysis job created",
        jobId: job.id,
      });
    } catch (error: any) {
      console.error("Error starting YouTube video analysis:", error?.message || error);
      res.status(500).json({ error: error?.message || "Failed to start YouTube video analysis" });
    }
  });

  // Delete video events for an episode source (admin)
  app.delete("/api/admin/episode-sources/:id/video-events", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const sourceId = req.params.id;
      const source = await storage.getEpisodeSource(sourceId);
      if (!source) {
        return res.status(404).json({ error: "Episode source not found" });
      }

      const deleted = await storage.deleteVideoEventsByEpisodeSource(sourceId);
      res.json({ deleted });
    } catch (error) {
      console.error("Error deleting video events:", error);
      res.status(500).json({ error: "Failed to delete video events" });
    }
  });

  // ============ SOURCE TRANSCRIPTS API (per-source YouTube captions) ============

  // Fetch YouTube transcript for an episode source (admin)
  app.post("/api/admin/episode-sources/:id/fetch-youtube-transcript", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const sourceId = req.params.id;
      const source = await storage.getEpisodeSource(sourceId);
      if (!source) {
        return res.status(404).json({ error: "Episode source not found" });
      }

      // Verify this is a YouTube source
      if (source.platform !== "youtube") {
        return res.status(400).json({ error: "Source must be a YouTube source (platform='youtube')" });
      }
      if (!source.sourceUrl) {
        return res.status(400).json({ error: "YouTube source must have a source URL" });
      }

      // Use centralized transcript guard
      const guardResult = await canEnqueueTranscriptJob(source.episodeId, "youtube_transcript");
      logTranscriptGuardDecision("ADMIN-FETCH-YOUTUBE", source.episodeId, guardResult);
      
      if (!guardResult.shouldGenerate) {
        return res.status(400).json({ 
          error: guardResult.reason,
          transcriptSource: guardResult.existingSource || null,
          hint: "Use this endpoint only for episodes without transcripts or to update source-level transcripts"
        });
      }

      // Create a new youtube_transcript job
      const job = await storage.createJob({
        episodeSourceId: sourceId,
        type: "youtube_transcript",
      });

      res.status(201).json({
        message: "YouTube transcript job created",
        jobId: job.id,
      });
    } catch (error) {
      console.error("Error starting YouTube transcript fetch:", error);
      res.status(500).json({ error: "Failed to start YouTube transcript fetch" });
    }
  });

  // Get source transcripts for an episode source
  app.get("/api/episode-sources/:id/source-transcripts", async (req, res) => {
    try {
      const sourceId = req.params.id;
      const source = await storage.getEpisodeSource(sourceId);
      if (!source) {
        return res.status(404).json({ error: "Episode source not found" });
      }

      const transcripts = await storage.getSourceTranscriptsByEpisodeSource(sourceId);
      res.json(transcripts);
    } catch (error) {
      console.error("Error fetching source transcripts:", error);
      res.status(500).json({ error: "Failed to fetch source transcripts" });
    }
  });

  // Get source transcript segments for an episode source
  app.get("/api/episode-sources/:id/source-transcript-segments", async (req, res) => {
    try {
      const sourceId = req.params.id;
      const source = await storage.getEpisodeSource(sourceId);
      if (!source) {
        return res.status(404).json({ error: "Episode source not found" });
      }

      const segments = await storage.getSourceTranscriptSegmentsByEpisodeSource(sourceId);
      res.json(segments);
    } catch (error) {
      console.error("Error fetching source transcript segments:", error);
      res.status(500).json({ error: "Failed to fetch source transcript segments" });
    }
  });

  // Delete source transcripts for an episode source (admin)
  app.delete("/api/admin/episode-sources/:id/source-transcripts", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const sourceId = req.params.id;
      const source = await storage.getEpisodeSource(sourceId);
      if (!source) {
        return res.status(404).json({ error: "Episode source not found" });
      }

      const deleted = await storage.deleteSourceTranscriptsByEpisodeSource(sourceId);
      res.json({ deleted });
    } catch (error) {
      console.error("Error deleting source transcripts:", error);
      res.status(500).json({ error: "Failed to delete source transcripts" });
    }
  });

  // ============ JOBS API (Generic job system) ============

  // Get all jobs (admin)
  app.get("/api/admin/jobs", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { type, status, limit } = req.query;
      let jobs;

      if (type && status) {
        jobs = await storage.getJobsByType(type as string, status as string);
      } else if (type) {
        jobs = await storage.getJobsByType(type as string);
      } else if (status) {
        jobs = await storage.getJobsByStatus(status as string, limit ? parseInt(limit as string) : 100);
      } else {
        jobs = await storage.getAllJobs(limit ? parseInt(limit as string) : 100);
      }

      res.json(jobs);
    } catch (error) {
      console.error("Error fetching jobs:", error);
      res.status(500).json({ error: "Failed to fetch jobs" });
    }
  });

  // Get job statistics (admin)
  app.get("/api/admin/jobs/stats", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const [pending, running, done, failed] = await Promise.all([
        storage.countJobsByStatus("pending"),
        storage.countJobsByStatus("running"),
        storage.countJobsByStatus("done"),
        storage.countJobsByStatus("error"),
      ]);

      res.json({
        pending,
        running,
        completed: done,
        failed,
        total: pending + running + done + failed,
      });
    } catch (error) {
      console.error("Error fetching job stats:", error);
      res.status(500).json({ error: "Failed to fetch job stats" });
    }
  });

  // Get transcript source distribution stats (admin)
  app.get("/api/admin/transcript-stats", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const episodes = await storage.getAllEpisodes();
      
      const stats = {
        total: episodes.length,
        bySource: {
          host: 0,
          youtube: 0,
          assembly: 0,
          none: 0,
          unknown: 0,
        },
        byStatus: {
          ready: 0,
          pending: 0,
          error: 0,
          none: 0,
        },
        costSavings: {
          freeTranscripts: 0,
          paidTranscripts: 0,
          estimatedSaved: 0, // In dollars, assuming ~$0.006 per minute for AssemblyAI
        },
      };
      
      for (const episode of episodes) {
        // Count by status
        const status = episode.transcriptStatus || "none";
        if (status === "ready") stats.byStatus.ready++;
        else if (status === "pending") stats.byStatus.pending++;
        else if (status === "error") stats.byStatus.error++;
        else stats.byStatus.none++;
        
        // Count by source (only for ready transcripts)
        if (episode.transcriptStatus === "ready") {
          const source = episode.transcriptSource || "unknown";
          if (source === "host") {
            stats.bySource.host++;
            stats.costSavings.freeTranscripts++;
          } else if (source === "youtube") {
            stats.bySource.youtube++;
            stats.costSavings.freeTranscripts++;
          } else if (source === "assembly") {
            stats.bySource.assembly++;
            stats.costSavings.paidTranscripts++;
          } else {
            stats.bySource.unknown++;
          }
        } else {
          stats.bySource.none++;
        }
        
        // Estimate cost savings (assuming avg 60 min episode @ $0.006/min = $0.36/episode)
        const avgCostPerEpisode = 0.36;
        stats.costSavings.estimatedSaved = stats.costSavings.freeTranscripts * avgCostPerEpisode;
      }
      
      res.json(stats);
    } catch (error) {
      console.error("Error fetching transcript stats:", error);
      res.status(500).json({ error: "Failed to fetch transcript stats" });
    }
  });

  // Get a specific job (admin)
  app.get("/api/admin/jobs/:id", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const job = await storage.getJob(req.params.id);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      res.json(job);
    } catch (error) {
      console.error("Error fetching job:", error);
      res.status(500).json({ error: "Failed to fetch job" });
    }
  });

  // Retry a job (admin)
  app.post("/api/admin/jobs/:id/retry", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const job = await storage.getJob(req.params.id);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      const retriedJob = await storage.retryJob(req.params.id);
      res.json(retriedJob);
    } catch (error) {
      console.error("Error retrying job:", error);
      res.status(500).json({ error: "Failed to retry job" });
    }
  });

  // Cancel a job (admin) - marks pending/running jobs as cancelled
  app.post("/api/admin/jobs/:id/cancel", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const job = await storage.getJob(req.params.id);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      if (job.status !== "pending" && job.status !== "running") {
        return res.status(400).json({ error: "Can only cancel pending or running jobs" });
      }

      const cancelledJob = await storage.cancelJob(req.params.id);
      res.json(cancelledJob);
    } catch (error) {
      console.error("Error cancelling job:", error);
      res.status(500).json({ error: "Failed to cancel job" });
    }
  });

  // Delete a job (admin) - removes completed/failed jobs from database
  app.delete("/api/admin/jobs/:id", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const job = await storage.getJob(req.params.id);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      if (job.status === "pending" || job.status === "running") {
        return res.status(400).json({ error: "Cannot delete pending or running jobs. Cancel them first." });
      }

      const deleted = await storage.deleteJob(req.params.id);
      res.json({ success: deleted });
    } catch (error) {
      console.error("Error deleting job:", error);
      res.status(500).json({ error: "Failed to delete job" });
    }
  });

  // Get job failure statistics and recent failures (admin)
  app.get("/api/admin/jobs/stats/failures", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const stats = getFailedJobStats();
      const recentFailures = getRecentFailedJobs();
      
      res.json({
        stats,
        recentFailures,
      });
    } catch (error) {
      console.error("Error fetching job failure stats:", error);
      res.status(500).json({ error: "Failed to fetch job failure stats" });
    }
  });

  // Get persisted job failures (admin) - returns database-persisted permanent failures
  app.get("/api/admin/jobs/failures", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const failures = await storage.getRecentJobFailures(limit, offset);
      
      res.json({
        failures,
        pagination: {
          limit,
          offset,
          count: failures.length,
        },
      });
    } catch (error) {
      console.error("Error fetching job failures:", error);
      res.status(500).json({ error: "Failed to fetch job failures" });
    }
  });

  // Get orphaned episodes (stuck in pending without active jobs)
  app.get("/api/admin/orphaned-episodes", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const stuckHours = parseInt(req.query.hours as string) || 24;
      const orphans = await storage.getOrphanedEpisodes(stuckHours);
      
      res.json({
        orphans,
        count: orphans.length,
        stuckHours,
      });
    } catch (error) {
      console.error("Error fetching orphaned episodes:", error);
      res.status(500).json({ error: "Failed to fetch orphaned episodes" });
    }
  });

  // ============ Admin Notifications Routes ============
  
  // Get unread notification count summary
  app.get("/api/admin/notifications/summary", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const unreadCount = await storage.getUnreadNotificationCount();
      res.json({ unread_count: unreadCount });
    } catch (error) {
      console.error("Error fetching notification summary:", error);
      res.status(500).json({ error: "Failed to fetch notification summary" });
    }
  });

  // List admin notifications
  app.get("/api/admin/notifications", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const status = (req.query.status as string) === "unread" ? "unread" : "all";
      const parsedLimit = parseInt(req.query.limit as string);
      const parsedOffset = parseInt(req.query.offset as string);
      const limit = Math.min(Math.max(isNaN(parsedLimit) ? 50 : parsedLimit, 1), 100);
      const offset = Math.max(isNaN(parsedOffset) ? 0 : parsedOffset, 0);
      const result = await storage.getAdminNotifications(status, limit, offset);
      res.json(result);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });

  // Mark single notification as read
  app.post("/api/admin/notifications/:id/read", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const notification = await storage.markNotificationRead(req.params.id);
      if (!notification) {
        return res.status(404).json({ error: "Notification not found" });
      }
      res.json(notification);
    } catch (error) {
      console.error("Error marking notification as read:", error);
      res.status(500).json({ error: "Failed to mark notification as read" });
    }
  });

  // Mark all notifications as read
  app.post("/api/admin/notifications/read-all", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const updated = await storage.markAllNotificationsRead();
      res.json({ success: true, updated });
    } catch (error) {
      console.error("Error marking all notifications as read:", error);
      res.status(500).json({ error: "Failed to mark all notifications as read" });
    }
  });

  // Get jobs for a specific episode source (admin)
  app.get("/api/admin/episode-sources/:id/jobs", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const source = await storage.getEpisodeSource(req.params.id);
      if (!source) {
        return res.status(404).json({ error: "Episode source not found" });
      }

      const jobs = await storage.getJobsByEpisodeSource(req.params.id);
      res.json(jobs);
    } catch (error) {
      console.error("Error fetching jobs for source:", error);
      res.status(500).json({ error: "Failed to fetch jobs" });
    }
  });

  // Generate chapters using AI (admin) - uses improved PodDNA Segment Labeler
  app.post("/api/admin/episodes/:id/generate-chapters", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const episodeId = req.params.id;
      const episode = await storage.getEpisode(episodeId);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }

      const transcriptSegments = await storage.getSegmentsByEpisode(episodeId);
      if (!transcriptSegments || transcriptSegments.length === 0) {
        return res.status(400).json({ error: "Episode has no transcript. Please transcribe it first." });
      }

      const podcast = await storage.getPodcast(episode.podcastId);

      console.log(`[CHAPTERS] Starting chapter generation for episode ${episodeId} (${episode.title})`);

      // Use improved PodDNA Segment Labeler
      const { generateTopicSegments, groupTranscriptIntoWindows } = await import("./segment-generator");
      
      // Group transcript into 2-minute windows
      const windows = groupTranscriptIntoWindows(transcriptSegments, 120);
      
      // Build episode context for better AI labeling
      const episodeContext = {
        title: episode.title,
        showName: podcast?.title || "Unknown Podcast",
        description: episode.description || "",
      };
      
      // Generate AI topic labels with episode context
      const generatedSegments = await generateTopicSegments(windows, episodeContext);

      if (generatedSegments.length === 0) {
        return res.status(400).json({ error: "No valid chapters could be generated. The transcript may be too short or unclear." });
      }

      await storage.deleteEpisodeSegmentsByEpisode(episodeId);

      const insertedChapters = await storage.createEpisodeSegments(
        generatedSegments.map((seg, index) => ({
          episodeId,
          startTime: seg.startTime,
          endTime: seg.endTime,
          label: seg.label,
          summary: null,
          snippetText: seg.snippetText,
          segmentType: seg.segmentType,
          displayOrder: index,
          isAiGenerated: true,
        }))
      );

      console.log(`[CHAPTERS] Created ${insertedChapters.length} chapters for episode ${episodeId}`);

      res.json({ 
        success: true, 
        chapters: insertedChapters,
        count: insertedChapters.length 
      });
    } catch (error) {
      console.error("Error generating chapters:", error);
      res.status(500).json({ error: "Failed to generate chapters" });
    }
  });

  // Import chapters from Podcast 2.0 chapters URL (admin)
  app.post("/api/admin/episodes/:id/import-chapters", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const episodeId = req.params.id;
      const episode = await storage.getEpisode(episodeId);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }

      // Get chaptersUrl from request body or from episode
      const chaptersUrl = req.body.chaptersUrl || episode.chaptersUrl;
      if (!chaptersUrl) {
        return res.status(400).json({ error: "No chapters URL available for this episode" });
      }

      console.log(`[CHAPTERS] Importing chapters from Podcast 2.0 URL: ${chaptersUrl}`);

      // Fetch the chapters JSON
      const response = await fetch(chaptersUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch chapters: ${response.status} ${response.statusText}`);
      }

      const contentType = response.headers.get("content-type") || "";
      let chaptersData: { version?: string; chapters?: Array<{ startTime: number; title: string; img?: string; url?: string; toc?: boolean }> };

      if (contentType.includes("application/json") || chaptersUrl.endsWith(".json")) {
        chaptersData = await response.json();
      } else {
        throw new Error(`Unsupported chapters format: ${contentType}`);
      }

      const chapters = chaptersData.chapters || [];
      if (chapters.length === 0) {
        return res.status(400).json({ error: "No chapters found in the chapters file" });
      }

      console.log(`[CHAPTERS] Found ${chapters.length} chapters in Podcast 2.0 format`);

      // Delete existing chapters
      await storage.deleteEpisodeSegmentsByEpisode(episodeId);

      // Convert Podcast 2.0 chapters to our EpisodeSegments format
      const insertedChapters = await storage.createEpisodeSegments(
        chapters.map((chapter, index) => {
          // Calculate end time from next chapter's start time
          const nextChapter = chapters[index + 1];
          const endTime = nextChapter ? nextChapter.startTime : (episode.duration || chapter.startTime + 300);
          
          return {
            episodeId,
            startTime: Math.round(chapter.startTime),
            endTime: Math.round(endTime),
            label: chapter.title,
            summary: null,
            snippetText: null,
            segmentType: "topic",
            displayOrder: index,
            isAiGenerated: false,
          };
        })
      );

      console.log(`[CHAPTERS] Imported ${insertedChapters.length} chapters for episode ${episodeId}`);

      res.json({ 
        success: true, 
        chapters: insertedChapters,
        count: insertedChapters.length,
        source: "podcast2.0"
      });
    } catch (error) {
      console.error("Error importing chapters:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to import chapters" });
    }
  });

  // Import chapters from episode description timestamps (admin)
  app.post("/api/admin/episodes/:id/import-description-chapters", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const episodeId = req.params.id;
      const episode = await storage.getEpisode(episodeId);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }

      if (!episode.description) {
        return res.status(400).json({ error: "Episode has no description to parse" });
      }

      console.log(`[CHAPTERS] Parsing chapters from description for episode ${episodeId}`);

      const { parseChaptersFromDescription, convertParsedChaptersToSegments } = await import("./utils/descriptionChapters");
      
      const parseResult = parseChaptersFromDescription(episode.description, episode.duration);

      if (!parseResult.success || parseResult.chapters.length < 2) {
        return res.status(400).json({ 
          error: "Could not find valid chapter timestamps in description",
          details: parseResult.errors
        });
      }

      console.log(`[CHAPTERS] Found ${parseResult.chapters.length} chapters in description`);

      // Delete existing chapters
      await storage.deleteEpisodeSegmentsByEpisode(episodeId);

      // Convert to our segment format
      const segments = convertParsedChaptersToSegments(parseResult.chapters, episode.duration);

      // Save to database
      const insertedChapters = await storage.createEpisodeSegments(
        segments.map((seg, index) => ({
          episodeId,
          startTime: seg.startTime,
          endTime: seg.endTime,
          label: seg.label,
          summary: null,
          snippetText: null,
          segmentType: seg.segmentType,
          displayOrder: index,
          isAiGenerated: false,
        }))
      );

      console.log(`[CHAPTERS] Created ${insertedChapters.length} chapters from description for episode ${episodeId}`);

      res.json({ 
        success: true, 
        chapters: insertedChapters,
        count: insertedChapters.length,
        source: "description",
        parsed: parseResult.chapters.map(c => ({ time: c.startTime, title: c.title }))
      });
    } catch (error) {
      console.error("Error parsing chapters from description:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to parse chapters from description" });
    }
  });

  // ============ EPISODE DIFF (INTEGRITY ENGINE) ============

  // Run diff analysis on an episode (compares canonical transcript vs source transcripts)
  app.post("/api/admin/episodes/:id/diff", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const episodeId = req.params.id;
      const episode = await storage.getEpisode(episodeId);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }

      // Get canonical transcript segments
      const canonicalSegments = await storage.getSegmentsByEpisode(episodeId);
      if (canonicalSegments.length === 0) {
        return res.status(400).json({ error: "No canonical transcript available for this episode" });
      }

      // Get YouTube source transcript segments if available
      const sources = await storage.getEpisodeSourcesByEpisode(episodeId);
      const youtubeSource = sources.find((s: { platform: string }) => s.platform === "youtube");
      
      if (!youtubeSource) {
        return res.status(400).json({ error: "No YouTube source found for comparison" });
      }

      const sourceSegments = await storage.getSourceTranscriptSegmentsByEpisodeSource(youtubeSource.id);
      if (sourceSegments.length === 0) {
        return res.status(400).json({ error: "No source transcript segments available for comparison" });
      }

      // Run the diff engine
      const { computeDiff } = await import("./diff-engine");
      const diffResult = computeDiff(canonicalSegments, sourceSegments);

      // Store the diff result
      const episodeDiff = await storage.createEpisodeDiff({
        episodeId,
        primarySource: episode.transcriptSource || "unknown",
        secondarySource: "youtube",
        metrics: diffResult.metrics,
        summary: `${diffResult.metrics.addedCount + diffResult.metrics.removedCount + diffResult.metrics.modifiedCount} changes detected (${Math.round(diffResult.metrics.similarity * 100)}% similarity)`,
        samples: diffResult.samples,
      });

      console.log(`[DIFF] Created diff analysis for episode ${episodeId}: similarity=${diffResult.metrics.similarity.toFixed(2)}, added=${diffResult.metrics.addedCount}, removed=${diffResult.metrics.removedCount}, modified=${diffResult.metrics.modifiedCount}`);

      res.json({
        status: "ok",
        episodeId,
        recomputed: true,
        diff: episodeDiff,
        metrics: diffResult.metrics,
      });
    } catch (error) {
      console.error("[DIFF] Error running diff analysis:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to run diff analysis" });
    }
  });

  // Get latest diff for an episode (public, read-only)
  app.get("/api/episodes/:id/diff", async (req, res) => {
    try {
      const episodeId = req.params.id;
      const episode = await storage.getEpisode(episodeId);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }

      const latestDiff = await storage.getLatestEpisodeDiff(episodeId);
      
      if (!latestDiff) {
        return res.json({ 
          hasDiff: false,
          message: "No diff analysis available for this episode"
        });
      }

      res.json({
        hasDiff: true,
        diff: latestDiff,
      });
    } catch (error) {
      console.error("[DIFF] Error fetching diff:", error);
      res.status(500).json({ error: "Failed to fetch diff analysis" });
    }
  });

  // Get diff history for an episode (admin only)
  app.get("/api/admin/episodes/:id/diffs", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const episodeId = req.params.id;
      const diffs = await storage.getEpisodeDiffsByEpisode(episodeId);
      
      res.json({ diffs });
    } catch (error) {
      console.error("[DIFF] Error fetching diff history:", error);
      res.status(500).json({ error: "Failed to fetch diff history" });
    }
  });

  // Admin endpoint: Backfill YouTube transcript jobs for all episodes
  app.post("/api/admin/jobs/backfill-youtube-transcripts", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      console.log(`[ADMIN] Starting YouTube transcript job backfill requested by ${currentUser.email}`);
      
      const result = await backfillYoutubeTranscriptJobs();
      
      res.json({
        success: true,
        message: `Backfill complete: ${result.enqueued} jobs created, ${result.skipped} skipped`,
        ...result,
      });
    } catch (error) {
      console.error("[ADMIN] Backfill error:", error);
      res.status(500).json({ error: "Failed to run backfill" });
    }
  });

  // Admin endpoint: Backfill episode pipeline jobs for all episodes without jobs
  app.post("/api/admin/jobs/backfill-pipeline", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      console.log(`[ADMIN] Starting episode pipeline job backfill requested by ${currentUser.email}`);
      
      const result = await backfillEpisodePipelineJobs();
      
      res.json({
        success: true,
        message: `Backfill complete: ${result.enqueued} jobs created, ${result.skipped} skipped`,
        ...result,
      });
    } catch (error) {
      console.error("[ADMIN] Pipeline backfill error:", error);
      res.status(500).json({ error: "Failed to run pipeline backfill" });
    }
  });

  // Admin endpoint: Backfill AI annotations for episodes with ready transcripts
  app.post("/api/admin/jobs/backfill-annotations", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      console.log(`[ADMIN] Starting annotations backfill requested by ${currentUser.email}`);
      
      const result = await backfillAnnotations();
      
      res.json({
        success: true,
        message: `Backfill complete: ${result.enqueued} jobs created, ${result.skipped} skipped`,
        ...result,
      });
    } catch (error) {
      console.error("[ADMIN] Annotations backfill error:", error);
      res.status(500).json({ error: "Failed to run annotations backfill" });
    }
  });

  // Admin endpoint: Backfill comments fetch for episodes with YouTube sources
  app.post("/api/admin/jobs/backfill-comments-fetch", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      console.log(`[ADMIN] Starting comments fetch backfill requested by ${currentUser.email}`);
      
      const result = await backfillCommentsFetch();
      
      res.json({
        success: true,
        message: `Backfill complete: ${result.enqueued} jobs created, ${result.skipped} skipped`,
        ...result,
      });
    } catch (error) {
      console.error("[ADMIN] Comments fetch backfill error:", error);
      res.status(500).json({ error: "Failed to run comments fetch backfill" });
    }
  });

  // Admin endpoint: Backfill comments mapping for episodes with comments but no segment links
  app.post("/api/admin/jobs/backfill-comments-map", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      console.log(`[ADMIN] Starting comments map backfill requested by ${currentUser.email}`);
      
      const result = await backfillCommentsMap();
      
      res.json({
        success: true,
        message: `Backfill complete: ${result.enqueued} jobs created, ${result.skipped} skipped`,
        ...result,
      });
    } catch (error) {
      console.error("[ADMIN] Comments map backfill error:", error);
      res.status(500).json({ error: "Failed to run comments map backfill" });
    }
  });

  // Admin endpoint: Backfill sponsor detection for episodes with ready transcripts
  app.post("/api/admin/jobs/backfill-sponsors", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      console.log(`[ADMIN] Starting sponsors backfill requested by ${currentUser.email}`);
      
      const result = await backfillSponsors();
      
      res.json({
        success: true,
        message: `Backfill complete: ${result.enqueued} jobs created, ${result.skipped} skipped`,
        ...result,
      });
    } catch (error) {
      console.error("[ADMIN] Sponsors backfill error:", error);
      res.status(500).json({ error: "Failed to run sponsors backfill" });
    }
  });

  // Admin endpoint: Backfill claims detection for episodes with ready transcripts
  app.post("/api/admin/jobs/backfill-claims", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      console.log(`[ADMIN] Starting claims backfill requested by ${currentUser.email}`);
      
      const result = await backfillClaims();
      
      res.json({
        success: true,
        message: `Backfill complete: ${result.enqueued} jobs created, ${result.skipped} skipped`,
        ...result,
      });
    } catch (error) {
      console.error("[ADMIN] Claims backfill error:", error);
      res.status(500).json({ error: "Failed to run claims backfill" });
    }
  });

  // Admin endpoint: Run maintenance backfill (checks all episodes and queues missing jobs)
  app.post("/api/admin/jobs/maintenance-backfill", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      console.log(`[ADMIN] Starting maintenance backfill requested by ${currentUser.email}`);
      
      const summary = await runMaintenanceBackfill();
      
      const totalNeeded = 
        summary.annotations.needed + 
        summary.commentsFetch.needed + 
        summary.commentsMap.needed + 
        summary.sponsors.needed + 
        summary.claims.needed;
      
      const totalEnqueued = 
        summary.annotations.enqueued + 
        summary.commentsFetch.enqueued + 
        summary.commentsMap.enqueued + 
        summary.sponsors.enqueued + 
        summary.claims.enqueued;

      res.json({
        success: true,
        message: `Maintenance backfill complete: ${totalEnqueued} jobs created out of ${totalNeeded} needed`,
        summary,
        totalNeeded,
        totalEnqueued,
      });
    } catch (error) {
      console.error("[ADMIN] Maintenance backfill error:", error);
      res.status(500).json({ error: "Failed to run maintenance backfill" });
    }
  });

  // Admin endpoint: Backfill episode summaries for cards
  app.post("/api/admin/jobs/backfill-episode-summaries", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      console.log(`[ADMIN] Starting episode summary backfill requested by ${currentUser.email}`);
      
      const result = await backfillEpisodeSummaries();
      
      res.json({
        success: true,
        message: `Episode summary backfill complete: ${result.enqueued} jobs created, ${result.skipped} skipped`,
        ...result,
      });
    } catch (error) {
      console.error("[ADMIN] Episode summary backfill error:", error);
      res.status(500).json({ error: "Failed to run episode summary backfill" });
    }
  });

  // Admin endpoint: Check readiness for batch entity extraction
  app.get("/api/admin/extraction-readiness", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      // Get counts for all transcript-related jobs
      const youtubeJobs = await storage.getJobsByType("youtube_transcript");
      const episodeJobs = await storage.getJobsByType("episode_transcript");
      
      // Combine and count by status
      const allTranscriptJobs = [...youtubeJobs, ...episodeJobs];
      const counts = {
        pending: allTranscriptJobs.filter(j => j.status === "pending").length,
        running: allTranscriptJobs.filter(j => j.status === "running").length,
        done: allTranscriptJobs.filter(j => j.status === "done").length,
        failed: allTranscriptJobs.filter(j => j.status === "error" || j.status === "failed").length,
      };
      
      const total = counts.pending + counts.running + counts.done + counts.failed;
      // Ready when no pending/running jobs - failures are skipped, not blocking
      const isReady = counts.pending === 0 && counts.running === 0;
      
      // Also get extraction job stats
      const extractionJobs = await storage.getJobsByType("extract_affiliate_entities");
      const extractionCounts = {
        pending: extractionJobs.filter(j => j.status === "pending").length,
        running: extractionJobs.filter(j => j.status === "running").length,
        done: extractionJobs.filter(j => j.status === "done").length,
        failed: extractionJobs.filter(j => j.status === "error" || j.status === "failed").length,
      };
      
      // Count episodes with transcripts but no extraction job yet
      const episodesWithTranscripts = await storage.getAllEpisodesWithTranscripts();
      let eligibleForExtraction = 0;
      for (const episode of episodesWithTranscripts) {
        const sources = await storage.getEpisodeSourcesByEpisode(episode.id);
        const primarySource = sources.find((s: { isCanonical: boolean }) => s.isCanonical) || sources[0];
        if (primarySource) {
          const existingJob = await storage.getJobByTypeAndSource("extract_affiliate_entities", primarySource.id);
          if (!existingJob) {
            eligibleForExtraction++;
          }
        }
      }
      
      res.json({
        transcripts: {
          ...counts,
          total,
        },
        extraction: extractionCounts,
        isReady,
        eligibleForExtraction,
        episodesWithTranscripts: episodesWithTranscripts.length,
      });
    } catch (error) {
      console.error("[ADMIN] Extraction readiness check error:", error);
      res.status(500).json({ error: "Failed to check extraction readiness" });
    }
  });

  // Admin endpoint: Batch process pending youtube transcript jobs (10 per API call)
  app.post("/api/admin/batch-transcripts", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { processPendingTranscriptsBatch, getPendingTranscriptJobCount } = await import("./services/batch-youtube-transcript");
      
      const pendingCount = await getPendingTranscriptJobCount();
      if (pendingCount === 0) {
        return res.json({
          success: true,
          message: "No pending transcript jobs to process",
          stats: { total: 0, processed: 0, succeeded: 0, failed: 0, skipped: 0, apiCalls: 0 },
        });
      }
      
      console.log(`[ADMIN] Starting batch transcript processing for ${pendingCount} pending jobs`);
      
      // Run batch processing (this processes all pending jobs)
      const stats = await processPendingTranscriptsBatch();
      
      res.json({
        success: true,
        message: `Processed ${stats.succeeded} transcripts successfully (${stats.failed} failed, ${stats.apiCalls} API calls)`,
        stats,
      });
    } catch (error) {
      console.error("[ADMIN] Batch transcript processing error:", error);
      res.status(500).json({ error: "Failed to process batch transcripts" });
    }
  });

  // Admin endpoint: Gated batch entity extraction - only works when all transcripts are done
  app.post("/api/admin/trigger-batch-extraction", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      // Check readiness first
      const youtubeJobs = await storage.getJobsByType("youtube_transcript");
      const episodeJobs = await storage.getJobsByType("episode_transcript");
      const allTranscriptJobs = [...youtubeJobs, ...episodeJobs];
      
      const pendingCount = allTranscriptJobs.filter(j => j.status === "pending").length;
      const runningCount = allTranscriptJobs.filter(j => j.status === "running").length;
      const failedCount = allTranscriptJobs.filter(j => j.status === "error" || j.status === "failed").length;
      
      if (pendingCount > 0 || runningCount > 0) {
        return res.status(400).json({ 
          error: "Transcripts still processing",
          pending: pendingCount,
          running: runningCount,
        });
      }
      
      // Note: Failed transcripts are skipped, not blocking - we extract from what succeeded
      console.log(`[ADMIN] Starting gated batch entity extraction requested by ${currentUser.email} (${failedCount} transcript failures will be skipped)`);
      
      const episodes = await storage.getAllEpisodesWithTranscripts();
      let enqueued = 0;
      let skipped = 0;

      for (const episode of episodes) {
        const sources = await storage.getEpisodeSourcesByEpisode(episode.id);
        const primarySource = sources.find((s: { isCanonical: boolean }) => s.isCanonical) || sources[0];
        
        if (!primarySource) {
          skipped++;
          continue;
        }

        const existingJob = await storage.getJobByTypeAndSource("extract_affiliate_entities", primarySource.id);
        if (existingJob) {
          skipped++;
          continue;
        }

        await storage.createJob({
          type: "extract_affiliate_entities",
          episodeSourceId: primarySource.id,
        });
        enqueued++;
      }
      
      res.json({
        success: true,
        message: `Batch entity extraction queued: ${enqueued} jobs created, ${skipped} skipped`,
        enqueued,
        skipped,
        totalEpisodes: episodes.length,
      });
    } catch (error) {
      console.error("[ADMIN] Batch entity extraction error:", error);
      res.status(500).json({ error: "Failed to trigger batch extraction" });
    }
  });

  // Admin endpoint: Extract affiliate entities from all episodes with transcripts
  app.post("/api/admin/jobs/backfill-affiliate-entities", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      console.log(`[ADMIN] Starting affiliate entity extraction backfill requested by ${currentUser.email}`);
      
      const episodes = await storage.getAllEpisodesWithTranscripts();
      let enqueued = 0;
      let skipped = 0;

      for (const episode of episodes) {
        const sources = await storage.getEpisodeSourcesByEpisode(episode.id);
        const primarySource = sources.find((s: { isCanonical: boolean }) => s.isCanonical) || sources[0];
        
        if (!primarySource) {
          skipped++;
          continue;
        }

        const existingJob = await storage.getJobByTypeAndSource("extract_affiliate_entities", primarySource.id);
        if (existingJob) {
          skipped++;
          continue;
        }

        await storage.createJob({
          type: "extract_affiliate_entities",
          episodeSourceId: primarySource.id,
        });
        enqueued++;
      }
      
      res.json({
        success: true,
        message: `Affiliate entity extraction backfill complete: ${enqueued} jobs queued, ${skipped} skipped`,
        enqueued,
        skipped,
        totalEpisodes: episodes.length,
      });
    } catch (error) {
      console.error("[ADMIN] Affiliate entity extraction backfill error:", error);
      res.status(500).json({ error: "Failed to run affiliate entity extraction backfill" });
    }
  });

  // Admin endpoint: Extract affiliate entities for a single episode
  app.post("/api/admin/episodes/:id/extract-affiliate-entities", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const episodeId = req.params.id;
      const episode = await storage.getEpisode(episodeId);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }

      const sources = await storage.getEpisodeSourcesByEpisode(episodeId);
      const primarySource = sources.find((s: { isCanonical: boolean }) => s.isCanonical) || sources[0];
      
      if (!primarySource) {
        return res.status(400).json({ error: "No episode source found" });
      }

      console.log(`[ADMIN] Queuing affiliate entity extraction for episode ${episodeId} requested by ${currentUser.email}`);

      const job = await storage.createJob({
        type: "extract_affiliate_entities",
        episodeSourceId: primarySource.id,
      });
      
      res.json({
        success: true,
        message: "Affiliate entity extraction job queued",
        jobId: job.id,
        episodeId,
      });
    } catch (error) {
      console.error("[ADMIN] Episode affiliate entity extraction error:", error);
      res.status(500).json({ error: "Failed to queue extraction job" });
    }
  });

  // Admin endpoint: Backfill statement embeddings for semantic search
  app.post("/api/admin/statements/embed/backfill", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const episodeId = req.body.episodeId as string | undefined;
      
      console.log(`[ADMIN] Starting statement embedding backfill requested by ${currentUser.email}${episodeId ? ` for episode ${episodeId}` : " (all episodes)"}`);
      
      const job = await storage.createJob({
        type: "embed_statements",
        episodeSourceId: null,
        result: episodeId ? { episodeId } : null,
      });
      
      res.json({
        success: true,
        message: "Embedding backfill job queued",
        jobId: job.id,
        episodeId: episodeId || null,
      });
    } catch (error) {
      console.error("[ADMIN] Statement embedding backfill error:", error);
      res.status(500).json({ error: "Failed to queue embedding backfill job" });
    }
  });

  // Admin endpoint: Re-map comments for an episode (delete old links, re-run mapping with improved algorithm)
  app.post("/api/admin/episodes/:id/remap-comments", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const userId = req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const currentUser = await storage.getUser(userId);
      if (!currentUser || currentUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const episodeId = req.params.id;
      const episode = await storage.getEpisode(episodeId);
      
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }
      
      // Check if episode has comments
      const comments = await storage.getCommentsByEpisode(episodeId);
      if (comments.length === 0) {
        return res.status(400).json({ error: "Episode has no comments to remap" });
      }
      
      // Find the YouTube source for this episode
      const sources = await storage.getEpisodeSourcesByEpisode(episodeId);
      const youtubeSource = sources.find(s => s.platform === "youtube");
      
      if (!youtubeSource) {
        return res.status(400).json({ error: "Episode has no YouTube source for comment mapping" });
      }
      
      console.log(`[ADMIN] Re-mapping ${comments.length} comments for episode ${episodeId} requested by ${currentUser.email}`);
      
      // Delete existing comment-segment links for this episode
      await storage.deleteSegmentLinksByEpisode(episodeId);
      
      // Create a new comments-map job
      const job = await storage.createJob({
        episodeSourceId: youtubeSource.id,
        type: "episode_comments_map",
        status: "pending",
      });
      
      res.json({
        success: true,
        message: `Re-mapping job created for ${comments.length} comments`,
        jobId: job.id,
        episodeId,
        commentCount: comments.length,
      });
    } catch (error) {
      console.error("[ADMIN] Remap comments error:", error);
      res.status(500).json({ error: "Failed to create remap job" });
    }
  });

  // ============ PUBLIC ANALYZER (PLG Feature) ============
  
  // Helper to extract YouTube video ID
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
  
  // Rate limiter for analyzer submissions (10 per minute per IP)
  const analyzerRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: { error: "Too many analysis requests. Please wait a moment." },
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false },
  });

  // POST /api/analyzer - Submit a YouTube URL for analysis
  app.post("/api/analyzer", analyzerRateLimiter, async (req, res) => {
    try {
      const { youtubeUrl, email } = req.body;
      
      if (!youtubeUrl || typeof youtubeUrl !== "string") {
        return res.status(400).json({ error: "YouTube URL is required" });
      }
      
      // Validate YouTube URL
      const videoId = extractYouTubeVideoId(youtubeUrl.trim());
      if (!videoId) {
        return res.status(400).json({ error: "Invalid YouTube URL. Please provide a valid YouTube video link." });
      }
      
      // Normalize URL to standard format
      const normalizedUrl = `https://www.youtube.com/watch?v=${videoId}`;
      
      // Check if we already have a recent analysis for this URL
      const existingRequest = await storage.getAnalyzerRequestByYoutubeUrl(normalizedUrl);
      if (existingRequest && existingRequest.status === "ready") {
        // Return existing completed analysis
        return res.json({ 
          id: existingRequest.id,
          status: existingRequest.status,
          message: "Analysis already completed",
        });
      }
      
      if (existingRequest && (existingRequest.status === "pending" || existingRequest.status === "processing")) {
        // Return existing in-progress analysis
        return res.json({
          id: existingRequest.id,
          status: existingRequest.status,
          message: "Analysis already in progress",
        });
      }
      
      // Create new analyzer request
      const analyzerRequest = await storage.createAnalyzerRequest({
        youtubeUrl: normalizedUrl,
        email: email && typeof email === "string" ? email.trim() : null,
        status: "pending",
        results: null,
        errorMessage: null,
        episodeId: null,
      });
      
      console.log(`[ANALYZER] Created request ${analyzerRequest.id} for ${normalizedUrl}`);
      
      // Start analysis in background (don't await)
      processAnalyzerRequest(analyzerRequest.id, normalizedUrl, videoId).catch(err => {
        console.error(`[ANALYZER] Background processing failed for ${analyzerRequest.id}:`, err);
      });
      
      res.json({
        id: analyzerRequest.id,
        status: "pending",
        message: "Analysis started. Poll for results.",
      });
    } catch (error) {
      console.error("[ANALYZER] Error creating request:", error);
      res.status(500).json({ error: "Failed to start analysis" });
    }
  });

  // GET /api/analyzer/:id - Get analysis status/results
  app.get("/api/analyzer/:id", async (req, res) => {
    try {
      const { id } = req.params;
      
      if (!id) {
        return res.status(400).json({ error: "Request ID is required" });
      }
      
      const request = await storage.getAnalyzerRequest(id);
      if (!request) {
        return res.status(404).json({ error: "Analysis request not found" });
      }
      
      // Build response based on status
      const response: any = {
        id: request.id,
        status: request.status,
        youtubeUrl: request.youtubeUrl,
        createdAt: request.createdAt,
      };
      
      if (request.status === "error") {
        response.errorMessage = request.errorMessage || "Analysis failed";
      }
      
      if (request.status === "ready" && request.results) {
        response.results = request.results;
      }
      
      res.json(response);
    } catch (error) {
      console.error("[ANALYZER] Error fetching request:", error);
      res.status(500).json({ error: "Failed to fetch analysis status" });
    }
  });

  // Rate limiter for lead capture (10 per minute per IP)
  const leadsRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: { error: "Too many submissions. Please wait a moment." },
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false },
  });

  // POST /api/analyzer/leads - Capture lead from analyzer page
  app.post("/api/analyzer/leads", leadsRateLimiter, async (req, res) => {
    try {
      const { email, company, episodeUrl, source } = req.body;
      
      // Validate email format
      if (!email || typeof email !== "string") {
        return res.status(400).json({ error: "Email is required" });
      }
      
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        return res.status(400).json({ error: "Please enter a valid email address" });
      }
      
      if (!episodeUrl || typeof episodeUrl !== "string") {
        return res.status(400).json({ error: "Episode URL is required" });
      }
      
      const lead = await storage.createAnalyzerLead({
        email: email.trim().toLowerCase(),
        company: company && typeof company === "string" ? company.trim() : null,
        episodeUrl: episodeUrl.trim(),
        source: source && typeof source === "string" ? source.trim() : "analyzer",
      });
      
      console.log(`[ANALYZER-LEADS] Captured lead ${lead.id}: ${lead.email}`);
      
      res.json({ 
        success: true,
        message: "Thank you! We'll be in touch soon.",
      });
    } catch (error) {
      console.error("[ANALYZER-LEADS] Error creating lead:", error);
      res.status(500).json({ error: "Failed to submit. Please try again." });
    }
  });

  // POST /api/demo-leads - Capture demo request lead (B2B)
  app.post("/api/demo-leads", leadsRateLimiter, async (req, res) => {
    try {
      const validated = insertDemoLeadSchema.parse(req.body);
      
      const lead = await storage.createDemoLead({
        name: validated.name.trim(),
        email: validated.email.trim().toLowerCase(),
        company: validated.company.trim(),
        role: validated.role.trim(),
        companySize: validated.companySize,
        useCase: validated.useCase,
        notes: validated.notes?.trim() || null,
      });
      
      console.log(`[DEMO-LEADS] Captured demo request ${lead.id}: ${lead.email} (${lead.company})`);
      
      res.json({ 
        success: true,
        message: "Thank you for your interest! Our team will reach out within 24 hours.",
      });
    } catch (error) {
      console.error("[DEMO-LEADS] Error creating demo lead:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: "Failed to submit. Please try again." });
    }
  });

  // =====================
  // INGESTION PROGRAMS (Phase 9 - Ingestion Control Plane)
  // =====================

  // GET /api/admin/programs - List all ingestion programs
  app.get("/api/admin/programs", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const programs = await storage.getAllPrograms();
      res.json(programs);
    } catch (error) {
      console.error("[INGESTION] Error fetching programs:", error);
      res.status(500).json({ error: "Failed to fetch programs" });
    }
  });

  // GET /api/admin/programs/:id - Get a single program with its sources
  app.get("/api/admin/programs/:id", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const program = await storage.getProgram(id);
      if (!program) {
        return res.status(404).json({ error: "Program not found" });
      }
      const sources = await storage.getProgramSources(id);
      const dailyCounts = await storage.getDailyRecommendationCounts(id);
      res.json({ program, sources, dailyCounts });
    } catch (error) {
      console.error("[INGESTION] Error fetching program:", error);
      res.status(500).json({ error: "Failed to fetch program" });
    }
  });

  // POST /api/admin/programs - Create a new program
  app.post("/api/admin/programs", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const validated = insertProgramSchema.parse(req.body);
      const program = await storage.createProgram({
        ...validated,
        createdBy: req.user?.id || "system",
      });
      console.log(`[INGESTION] Created program ${program.id}: ${program.name}`);
      res.status(201).json(program);
    } catch (error) {
      console.error("[INGESTION] Error creating program:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: "Failed to create program" });
    }
  });

  // PATCH /api/admin/programs/:id - Update a program
  app.patch("/api/admin/programs/:id", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const existing = await storage.getProgram(id);
      if (!existing) {
        return res.status(404).json({ error: "Program not found" });
      }
      const updateSchema = insertProgramSchema.partial();
      const validated = updateSchema.parse(req.body);
      const program = await storage.updateProgram(id, validated);
      console.log(`[INGESTION] Updated program ${id}`);
      res.json(program);
    } catch (error) {
      console.error("[INGESTION] Error updating program:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: "Failed to update program" });
    }
  });

  // POST /api/admin/programs/:id/pause - Pause a program
  app.post("/api/admin/programs/:id/pause", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const program = await storage.updateProgram(id, { status: "paused" });
      if (!program) {
        return res.status(404).json({ error: "Program not found" });
      }
      console.log(`[INGESTION] Paused program ${id}`);
      res.json(program);
    } catch (error) {
      console.error("[INGESTION] Error pausing program:", error);
      res.status(500).json({ error: "Failed to pause program" });
    }
  });

  // POST /api/admin/programs/:id/resume - Resume a program
  app.post("/api/admin/programs/:id/resume", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const existing = await storage.getProgram(id);
      if (!existing) {
        return res.status(404).json({ error: "Program not found" });
      }
      
      // Validate config before allowing resume
      const configResult = programConfigSchema.safeParse(existing.config || {});
      if (!configResult.success) {
        console.log(`[INGESTION] Cannot resume program ${id}: invalid config - ${configResult.error.errors[0].message}`);
        return res.status(400).json({ 
          error: "Cannot resume: program config is invalid",
          configErrors: configResult.error.errors.map(e => e.message)
        });
      }
      
      const program = await storage.updateProgram(id, { status: "active" });
      console.log(`[INGESTION] Resumed program ${id}`);
      res.json(program);
    } catch (error) {
      console.error("[INGESTION] Error resuming program:", error);
      res.status(500).json({ error: "Failed to resume program" });
    }
  });

  // POST /api/admin/programs/:id/poll - Manually trigger polling for all sources
  app.post("/api/admin/programs/:id/poll", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const program = await storage.getProgram(id);
      if (!program) {
        return res.status(404).json({ error: "Program not found" });
      }
      
      console.log(`[INGESTION] Manual poll triggered for program ${id} (${program.name})`);
      
      // Get all enabled sources for the program
      const sources = await storage.getProgramSources(id);
      const enabledSources = sources.filter(s => s.enabled);
      
      if (enabledSources.length === 0) {
        return res.json({
          message: "No enabled sources to poll",
          results: [],
          summary: { totalSources: 0, newEvents: 0, duplicates: 0, errors: 0 }
        });
      }
      
      // Poll each source type
      const results: AnyPollResult[] = [];
      
      for (const source of enabledSources) {
        try {
          if (source.type === "rss_url") {
            const result = await pollRssSource(source);
            results.push(result);
          } else if (source.type === "youtube_channel") {
            const result = await pollYouTubeChannel(source);
            results.push(result);
          } else if (source.type === "podcastindex_feed") {
            const result = await pollPodcastIndexFeed(source);
            results.push(result);
          } else if (source.type === "podcastindex_query") {
            const result = await pollPodcastIndexQuery(source);
            results.push(result);
          }
        } catch (err: any) {
          console.error(`[INGESTION] Error polling source ${source.id}:`, err.message);
          results.push({
            sourceId: source.id,
            feedTitle: null,
            channelTitle: null,
            queryOrFeedId: source.value || "",
            totalItems: 0,
            newEvents: 0,
            duplicates: 0,
            errors: [err.message],
          } as AnyPollResult);
        }
      }
      
      // Summarize results
      const summary = {
        totalSources: results.length,
        newEvents: results.reduce((sum, r) => sum + r.newEvents, 0),
        duplicates: results.reduce((sum, r) => sum + r.duplicates, 0),
        errors: results.reduce((sum, r) => sum + r.errors.length, 0),
      };
      
      console.log(`[INGESTION] Poll complete for program ${id}: ${summary.newEvents} new events from ${summary.totalSources} sources`);
      
      // Auto-catalog and auto-resolve RSS events
      let cataloged = 0;
      let resolved = 0;
      let matched = 0;
      
      if (summary.newEvents > 0) {
        try {
          const { findBestMatch } = await import("./ingestion/title-matcher");
          const { maybeEnqueueYoutubeTranscriptJob } = await import("./youtube-job-helper");
          
          // Get all pending RSS events for this program
          const pendingEvents = await storage.getUnprocessedEvents(id, 100);
          const rssEvents = pendingEvents.filter(e => e.type === "new_episode_found");
          
          // Get YouTube candidates for matching
          const youtubeEvents = await storage.getYoutubeEventsByProgram(id);
          
          // Helper to parse relative dates like "7 days ago", "2 weeks ago"
          const parseRelativeDate = (str: string): Date | null => {
            if (!str) return null;
            const now = new Date();
            const match = str.match(/(\d+)\s*(hour|day|week|month|year)s?\s*ago/i);
            if (match) {
              const num = parseInt(match[1]);
              const unit = match[2].toLowerCase();
              const ms = {
                hour: 3600000,
                day: 86400000,
                week: 604800000,
                month: 2592000000,
                year: 31536000000,
              }[unit] || 86400000;
              return new Date(now.getTime() - num * ms);
            }
            // Try parsing as regular date
            const parsed = new Date(str);
            return isNaN(parsed.getTime()) ? null : parsed;
          };
          
          const youtubeCandidates = youtubeEvents.map((e: any) => ({
            eventId: e.id,
            title: e.payload?.title || "",
            videoUrl: e.payload?.videoUrl || e.payload?.url || "",
            publishedAt: parseRelativeDate(e.payload?.publishedAt),
          })).filter((c: any) => c.title && c.videoUrl);
          
          console.log(`[INGESTION] Auto-processing ${rssEvents.length} RSS events with ${youtubeCandidates.length} YouTube candidates`);
          
          // Get existing podcast for this program (or find one)
          const programConfig = program.config as any;
          let podcastId = programConfig?.defaultPodcastId;
          
          if (!podcastId) {
            // Try to find or create podcast based on RSS feed title
            const rssSource = enabledSources.find(s => s.type === "rss_url");
            if (rssSource?.label) {
              const existingPodcasts = await storage.getAllPodcasts();
              const matchingPodcast = existingPodcasts.find(p => 
                p.title.toLowerCase().includes(rssSource.label!.toLowerCase()) ||
                rssSource.label!.toLowerCase().includes(p.title.toLowerCase())
              );
              if (matchingPodcast) {
                podcastId = matchingPodcast.id;
              } else {
                // Create new podcast
                const newPodcast = await storage.createPodcast({
                  title: rssSource.label,
                  description: `Podcast from ${rssSource.label}`,
                  feedUrl: rssSource.value || undefined,
                  host: "Unknown Host",
                  imageUrl: null,
                });
                podcastId = newPodcast.id;
                console.log(`[INGESTION] Created podcast "${rssSource.label}" (${podcastId})`);
              }
            }
          }
          
          for (const event of rssEvents) {
            try {
              const payload = event.payload as any;
              
              // Step 1: Catalog - Create episode
              const durationStr = payload.duration || "0";
              let durationSec = 0;
              if (durationStr.includes(":")) {
                const parts = durationStr.split(":").map(Number);
                if (parts.length === 3) durationSec = parts[0] * 3600 + parts[1] * 60 + parts[2];
                else if (parts.length === 2) durationSec = parts[0] * 60 + parts[1];
              } else {
                durationSec = parseInt(durationStr) || 0;
              }
              
              const episode = await storage.createEpisode({
                podcastId: podcastId!,
                title: payload.title || "Untitled",
                description: payload.description || null,
                publishedAt: payload.pubDate ? new Date(payload.pubDate) : new Date(),
                duration: durationSec,
                mediaUrl: payload.enclosureUrl || "https://placeholder.audio",
                type: "full",
                guid: payload.guid || null,
              });
              
              await storage.updateIngestionEvent(event.id, { 
                actionStatus: "cataloged",
                episodeId: episode.id 
              });
              cataloged++;
              
              // Step 2: Resolve - Match to YouTube
              const rssTitle = payload.title || "";
              const rssPublishedAt = payload.pubDate ? new Date(payload.pubDate) : null;
              
              const matchResult = findBestMatch(rssTitle, rssPublishedAt, youtubeCandidates, {
                minScore: 0.4,
                dateWindowDays: 14,
              });
              
              if (matchResult.matched && matchResult.candidate) {
                // Create YouTube source
                await storage.createEpisodeSource({
                  episodeId: episode.id,
                  kind: "video",
                  platform: "youtube",
                  sourceUrl: matchResult.candidate.videoUrl,
                });
                
                // Queue YouTube transcript job
                await maybeEnqueueYoutubeTranscriptJob(episode.id);
                
                await storage.updateIngestionEvent(event.id, { actionStatus: "resolved" });
                matched++;
                console.log(`[INGESTION] Matched "${rssTitle}" -> YouTube (score: ${matchResult.score.toFixed(2)})`);
              } else {
                await storage.updateIngestionEvent(event.id, { actionStatus: "fallback_pending" });
              }
              resolved++;
              
            } catch (err: any) {
              console.error(`[INGESTION] Auto-process error for event ${event.id}:`, err.message);
            }
          }
          
          console.log(`[INGESTION] Auto-processed: ${cataloged} cataloged, ${resolved} resolved, ${matched} matched to YouTube`);
          
        } catch (err: any) {
          console.error(`[INGESTION] Auto-process failed:`, err.message);
        }
      }
      
      res.json({
        message: `Polled ${results.length} source(s)`,
        results,
        summary,
        autoProcess: { cataloged, resolved, matched },
      });
    } catch (error) {
      console.error("[INGESTION] Error polling program:", error);
      res.status(500).json({ error: "Failed to poll program" });
    }
  });

  // POST /api/admin/programs/:id/run-agent - Run AI curator agent for recommendations
  app.post("/api/admin/programs/:id/run-agent", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const program = await storage.getProgram(id);
      if (!program) {
        return res.status(404).json({ error: "Program not found" });
      }

      const { runCuratorAgent } = await import("./ingestion/curator-agent");
      const result = await runCuratorAgent(program, {
        maxEvents: req.body.maxEvents ?? 100,
        recencyHours: req.body.recencyHours ?? 72,
      });

      if (!result.success) {
        console.error(`[INGESTION] Agent run failed: ${result.error}`);
        return res.status(500).json({ 
          error: result.error || "Agent run failed",
          agentRunId: result.agentRunId,
        });
      }

      console.log(`[INGESTION] Agent run ${result.agentRunId} completed: ${result.recommendationsCreated} recommendations`);
      res.json({
        agentRunId: result.agentRunId,
        recommendationsCreated: result.recommendationsCreated,
        output: result.output,
      });
    } catch (error) {
      console.error("[INGESTION] Error running agent:", error);
      res.status(500).json({ error: "Failed to run agent" });
    }
  });

  // GET /api/admin/programs/:id/recommendations - Get recommendations for a program
  app.get("/api/admin/programs/:id/recommendations", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const program = await storage.getProgram(id);
      if (!program) {
        return res.status(404).json({ error: "Program not found" });
      }

      const recommendations = await storage.getPendingRecommendations(id);
      res.json(recommendations);
    } catch (error) {
      console.error("[INGESTION] Error fetching recommendations:", error);
      res.status(500).json({ error: "Failed to fetch recommendations" });
    }
  });

  // POST /api/admin/recommendations/bulk-approve - Bulk approve recommendations
  app.post("/api/admin/recommendations/bulk-approve", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "ids array required" });
      }

      const userId = (req.user as any)?.id;
      const results = [];
      for (const id of ids) {
        const rec = await storage.approveRecommendation(id, userId);
        if (rec) results.push(rec);
      }

      console.log(`[INGESTION] Bulk approved ${results.length} recommendations`);
      res.json({ approved: results.length });
    } catch (error) {
      console.error("[INGESTION] Error bulk approving:", error);
      res.status(500).json({ error: "Failed to approve recommendations" });
    }
  });

  // POST /api/admin/recommendations/bulk-reject - Bulk reject recommendations
  app.post("/api/admin/recommendations/bulk-reject", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "ids array required" });
      }

      const userId = (req.user as any)?.id;
      const results = [];
      for (const id of ids) {
        const rec = await storage.rejectRecommendation(id, userId);
        if (rec) results.push(rec);
      }

      console.log(`[INGESTION] Bulk rejected ${results.length} recommendations`);
      res.json({ rejected: results.length });
    } catch (error) {
      console.error("[INGESTION] Error bulk rejecting:", error);
      res.status(500).json({ error: "Failed to reject recommendations" });
    }
  });

  // DELETE /api/admin/programs/:id - Delete a program
  app.delete("/api/admin/programs/:id", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const deleted = await storage.deleteProgram(id);
      if (!deleted) {
        return res.status(404).json({ error: "Program not found" });
      }
      console.log(`[INGESTION] Deleted program ${id}`);
      res.json({ success: true });
    } catch (error) {
      console.error("[INGESTION] Error deleting program:", error);
      res.status(500).json({ error: "Failed to delete program" });
    }
  });

  // =====================
  // PROGRAM SOURCES (Phase 9)
  // =====================

  // POST /api/admin/programs/:id/sources - Add a source to a program
  app.post("/api/admin/programs/:id/sources", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { id: programId } = req.params;
      const program = await storage.getProgram(programId);
      if (!program) {
        return res.status(404).json({ error: "Program not found" });
      }
      const validated = insertProgramSourceSchema.parse({ ...req.body, programId });
      const source = await storage.createProgramSource(validated);
      console.log(`[INGESTION] Added source ${source.id} to program ${programId}`);
      res.status(201).json(source);
    } catch (error) {
      console.error("[INGESTION] Error adding source:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: "Failed to add source" });
    }
  });

  // PATCH /api/admin/sources/:id - Update a source
  app.patch("/api/admin/sources/:id", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const existing = await storage.getProgramSource(id);
      if (!existing) {
        return res.status(404).json({ error: "Source not found" });
      }
      const updateSchema = insertProgramSourceSchema.omit({ programId: true }).partial();
      const validated = updateSchema.parse(req.body);
      const source = await storage.updateProgramSource(id, validated);
      console.log(`[INGESTION] Updated source ${id}`);
      res.json(source);
    } catch (error) {
      console.error("[INGESTION] Error updating source:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message });
      }
      res.status(500).json({ error: "Failed to update source" });
    }
  });

  // POST /api/admin/sources/:id/toggle - Enable/disable a source
  app.post("/api/admin/sources/:id/toggle", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const existing = await storage.getProgramSource(id);
      if (!existing) {
        return res.status(404).json({ error: "Source not found" });
      }
      const source = await storage.updateProgramSource(id, { enabled: !existing.enabled });
      console.log(`[INGESTION] Toggled source ${id} to ${source?.enabled ? "enabled" : "disabled"}`);
      res.json(source);
    } catch (error) {
      console.error("[INGESTION] Error toggling source:", error);
      res.status(500).json({ error: "Failed to toggle source" });
    }
  });

  // DELETE /api/admin/sources/:id - Remove a source
  app.delete("/api/admin/sources/:id", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const deleted = await storage.deleteProgramSource(id);
      if (!deleted) {
        return res.status(404).json({ error: "Source not found" });
      }
      console.log(`[INGESTION] Deleted source ${id}`);
      res.json({ success: true });
    } catch (error) {
      console.error("[INGESTION] Error deleting source:", error);
      res.status(500).json({ error: "Failed to delete source" });
    }
  });

  // =====================
  // INGESTION RECOMMENDATIONS (Phase 9)
  // =====================

  // GET /api/admin/recommendations - Get pending recommendations
  app.get("/api/admin/recommendations", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { programId } = req.query;
      const recommendations = await storage.getPendingRecommendations(programId as string | undefined);
      res.json(recommendations);
    } catch (error) {
      console.error("[INGESTION] Error fetching recommendations:", error);
      res.status(500).json({ error: "Failed to fetch recommendations" });
    }
  });

  // POST /api/admin/recommendations/:id/approve - Approve a recommendation
  app.post("/api/admin/recommendations/:id/approve", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const rec = await storage.approveRecommendation(id, req.user?.id || "system");
      if (!rec) {
        return res.status(404).json({ error: "Recommendation not found" });
      }
      console.log(`[INGESTION] Approved recommendation ${id}`);
      res.json(rec);
    } catch (error) {
      console.error("[INGESTION] Error approving recommendation:", error);
      res.status(500).json({ error: "Failed to approve recommendation" });
    }
  });

  // POST /api/admin/recommendations/:id/reject - Reject a recommendation
  app.post("/api/admin/recommendations/:id/reject", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const rec = await storage.rejectRecommendation(id, req.user?.id || "system");
      if (!rec) {
        return res.status(404).json({ error: "Recommendation not found" });
      }
      console.log(`[INGESTION] Rejected recommendation ${id}`);
      res.json(rec);
    } catch (error) {
      console.error("[INGESTION] Error rejecting recommendation:", error);
      res.status(500).json({ error: "Failed to reject recommendation" });
    }
  });

  // POST /api/admin/recommendations/bulk - Bulk approve/reject recommendations
  app.post("/api/admin/recommendations/bulk", isAuthenticated, requireAdmin, async (req: any, res) => {
    try {
      const { action, ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "ids array is required" });
      }
      if (!["approve", "reject"].includes(action)) {
        return res.status(400).json({ error: "action must be 'approve' or 'reject'" });
      }
      const userId = req.user?.id || "system";
      const results = [];
      for (const id of ids) {
        const rec = action === "approve" 
          ? await storage.approveRecommendation(id, userId)
          : await storage.rejectRecommendation(id, userId);
        results.push({ id, success: !!rec });
      }
      console.log(`[INGESTION] Bulk ${action}d ${ids.length} recommendations`);
      res.json({ success: true, results });
    } catch (error) {
      console.error("[INGESTION] Error bulk processing recommendations:", error);
      res.status(500).json({ error: "Failed to process recommendations" });
    }
  });

  // GET /api/admin/programs/:id/events - Get recent events for a program
  app.get("/api/admin/programs/:id/events", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;
      const events = await storage.getRecentEvents(id, limit);
      res.json(events);
    } catch (error) {
      console.error("[INGESTION] Error fetching events:", error);
      res.status(500).json({ error: "Failed to fetch events" });
    }
  });

  // POST /api/admin/events/catalog - Catalog events (create episodes from events)
  app.post("/api/admin/events/catalog", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { eventIds } = req.body;
      if (!Array.isArray(eventIds) || eventIds.length === 0) {
        return res.status(400).json({ error: "eventIds array is required" });
      }

      const results: Array<{ eventId: string; success: boolean; episodeId?: string; error?: string; skipped?: boolean }> = [];
      
      for (const eventId of eventIds) {
        const event = await storage.getIngestionEvent(eventId);
        if (!event) {
          results.push({ eventId, success: false, error: "Event not found" });
          continue;
        }

        // Skip already cataloged events (idempotent)
        if (event.actionStatus === "cataloged" && event.episodeId) {
          results.push({ eventId, success: true, episodeId: event.episodeId, skipped: true });
          continue;
        }

        const payload = event.payload as any;
        if (!payload) {
          results.push({ eventId, success: false, error: "Event has no payload" });
          continue;
        }

        try {
          // Extract title and metadata from payload based on event type
          const title = payload.title || "Untitled Episode";
          const description = payload.description || null;
          const pubDate = payload.pubDate || payload.publishedAt || payload.datePublished;
          const publishedAt = pubDate ? new Date(typeof pubDate === "number" ? pubDate * 1000 : pubDate) : new Date();
          const mediaUrl = payload.enclosureUrl || payload.videoUrl || "";
          const duration = payload.duration || payload.durationSeconds || 0;
          
          // Determine episode type based on source
          const episodeType = event.type === "youtube_upload_found" ? "video" : "audio";
          
          // For now, we need a podcast to attach the episode to
          // This is a simplified implementation - in production you'd have podcast resolution
          const program = await storage.getProgram(event.programId);
          if (!program) {
            results.push({ eventId, success: false, error: "Program not found" });
            continue;
          }
          
          // Find or create podcast based on feed title
          const podcasts = await storage.getAllPodcasts();
          const feedTitle = payload.feedTitle || payload.channelTitle;
          const feedUrl = payload.feedUrl || payload.channelUrl || "";
          
          let targetPodcast = null;
          
          // Try to find existing podcast by title match
          if (feedTitle) {
            targetPodcast = podcasts.find(p => 
              p.title.toLowerCase().includes(feedTitle.toLowerCase()) ||
              feedTitle.toLowerCase().includes(p.title.toLowerCase())
            );
          }
          
          // If no match found, create new podcast
          if (!targetPodcast) {
            const newPodcastTitle = feedTitle || program.name || "Unknown Podcast";
            targetPodcast = await storage.createPodcast({
              title: newPodcastTitle,
              host: payload.feedAuthor || payload.author || "Unknown Host",
              description: payload.feedDescription || `Podcast from ${program.name}`,
              artworkUrl: payload.feedImage || payload.image || null,
            });
            console.log(`[INGESTION] Created new podcast: ${newPodcastTitle} (${targetPodcast.id})`);
          }

          // Create the episode
          const episode = await storage.createEpisode({
            podcastId: targetPodcast.id,
            title,
            description,
            publishedAt,
            mediaUrl,
            duration: typeof duration === "number" ? duration : parseInt(duration, 10) || 0,
            type: episodeType,
            externalSource: event.type === "youtube_upload_found" ? "youtube" : "podcastindex",
            externalEpisodeId: payload.guid || payload.videoId || payload.id?.toString(),
            processingStatus: "new",
            resolutionStatus: "unresolved",
          });

          // Update the event with the episode ID and mark as cataloged
          await storage.updateIngestionEvent(eventId, {
            actionStatus: "cataloged",
            episodeId: episode.id,
          });

          results.push({ eventId, success: true, episodeId: episode.id });
          console.log(`[INGESTION] Cataloged event ${eventId} -> episode ${episode.id}`);

        } catch (err: any) {
          results.push({ eventId, success: false, error: err.message });
          console.error(`[INGESTION] Failed to catalog event ${eventId}:`, err.message);
        }
      }

      const summary = {
        total: results.length,
        success: results.filter(r => r.success && !r.skipped).length,
        skipped: results.filter(r => r.skipped).length,
        failed: results.filter(r => !r.success).length,
      };

      console.log(`[INGESTION] Catalog complete: ${summary.success} created, ${summary.skipped} skipped, ${summary.failed} failed`);
      res.json({ results, summary });
    } catch (error) {
      console.error("[INGESTION] Error cataloging events:", error);
      res.status(500).json({ error: "Failed to catalog events" });
    }
  });

  // POST /api/admin/events/resolve - Match cataloged RSS events to YouTube videos for free transcripts
  app.post("/api/admin/events/resolve", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const { eventIds } = req.body;
      if (!Array.isArray(eventIds) || eventIds.length === 0) {
        return res.status(400).json({ error: "eventIds array is required" });
      }

      const { findBestMatch } = await import("./ingestion/title-matcher");
      const { maybeEnqueueYoutubeTranscriptJob } = await import("./youtube-job-helper");

      const results: Array<{ 
        eventId: string; 
        success: boolean; 
        matched?: boolean;
        matchScore?: number;
        videoUrl?: string;
        jobId?: string; 
        error?: string; 
        skipped?: boolean;
        reason?: string;
      }> = [];
      
      // Cache YouTube events by program to avoid repeated queries
      const youtubeEventsCache = new Map<string, Array<{ eventId: string; title: string; videoUrl: string; publishedAt: Date | null }>>();

      for (const eventId of eventIds) {
        const event = await storage.getIngestionEvent(eventId);
        if (!event) {
          results.push({ eventId, success: false, error: "Event not found" });
          continue;
        }

        // Event must be cataloged first (have an episode)
        if (!event.episodeId) {
          results.push({ eventId, success: false, error: "Event not cataloged - catalog first" });
          continue;
        }

        // Skip already resolved events (idempotent)
        if (event.actionStatus === "resolved") {
          results.push({ eventId, success: true, skipped: true, reason: "Already resolved" });
          continue;
        }

        // Skip YouTube events - they don't need resolution
        if (event.type === "youtube_upload_found") {
          results.push({ eventId, success: true, skipped: true, reason: "YouTube event doesn't need resolution" });
          continue;
        }

        try {
          const episode = await storage.getEpisode(event.episodeId);
          if (!episode) {
            results.push({ eventId, success: false, error: "Episode not found" });
            continue;
          }

          // Check if episode already has a YouTube source
          const existingSources = await storage.getEpisodeSources(episode.id);
          const hasYoutubeSource = existingSources.some((s: any) => s.platform === "youtube");
          
          if (hasYoutubeSource) {
            await storage.updateIngestionEvent(eventId, { actionStatus: "resolved" });
            results.push({ eventId, success: true, skipped: true, reason: "Already has YouTube source" });
            continue;
          }

          // Get YouTube events from the same program (cached)
          let youtubeCandidates = youtubeEventsCache.get(event.programId);
          if (!youtubeCandidates) {
            const youtubeEvents = await storage.getYoutubeEventsByProgram(event.programId);
            youtubeCandidates = youtubeEvents.map((e: any) => ({
              eventId: e.id,
              title: e.payload?.title || "",
              videoUrl: e.payload?.videoUrl || e.payload?.url || "",
              publishedAt: e.payload?.publishedAt ? new Date(e.payload.publishedAt) : null,
            })).filter((c: any) => c.title && c.videoUrl);
            youtubeEventsCache.set(event.programId, youtubeCandidates);
          }

          // Get RSS event title and date for matching
          const rssTitle = (event.payload as any)?.title || episode.title || "";
          const rssPublishedAt = (event.payload as any)?.pubDate 
            ? new Date((event.payload as any).pubDate) 
            : episode.publishedAt;

          // Find best YouTube match
          const matchResult = findBestMatch(rssTitle, rssPublishedAt, youtubeCandidates, {
            minScore: 0.4, // Lower threshold for better recall
            dateWindowDays: 14, // 2 weeks window
          });

          if (!matchResult.matched || !matchResult.candidate) {
            // No match found - update status but don't fail
            await storage.updateIngestionEvent(eventId, { actionStatus: "fallback_pending" });
            results.push({ 
              eventId, 
              success: true, 
              matched: false, 
              matchScore: matchResult.score,
              reason: matchResult.reason 
            });
            console.log(`[INGESTION] No YouTube match for "${rssTitle}" - ${matchResult.reason}`);
            continue;
          }

          // Match found! Create YouTube episode source
          const videoSource = await storage.createEpisodeSource({
            episodeId: episode.id,
            kind: "video",
            platform: "youtube",
            sourceUrl: matchResult.candidate.videoUrl,
          });

          console.log(`[INGESTION] Matched "${rssTitle}" -> "${matchResult.candidate.title}" (score: ${matchResult.score.toFixed(2)})`);

          // Queue YouTube transcript job
          const enqueueResult = await maybeEnqueueYoutubeTranscriptJob(episode.id);
          const transcriptJobId = enqueueResult.results.find(r => r.enqueued)?.jobId;

          // Update event status
          await storage.updateIngestionEvent(eventId, { actionStatus: "resolved" });

          results.push({ 
            eventId, 
            success: true, 
            matched: true,
            matchScore: matchResult.score,
            videoUrl: matchResult.candidate.videoUrl,
            jobId: transcriptJobId,
          });

        } catch (err: any) {
          results.push({ eventId, success: false, error: err.message });
          console.error(`[INGESTION] Failed to resolve event ${eventId}:`, err.message);
        }
      }

      const summary = {
        total: results.length,
        matched: results.filter(r => r.matched).length,
        unmatched: results.filter(r => r.success && r.matched === false).length,
        skipped: results.filter(r => r.skipped).length,
        failed: results.filter(r => !r.success).length,
      };

      console.log(`[INGESTION] Resolve complete: ${summary.matched} matched, ${summary.unmatched} unmatched, ${summary.skipped} skipped, ${summary.failed} failed`);
      res.json({ results, summary });
    } catch (error) {
      console.error("[INGESTION] Error resolving events:", error);
      res.status(500).json({ error: "Failed to resolve events" });
    }
  });

  // =====================
  // PUBLIC EXPLORE API
  // =====================
  
  // Public endpoint for Explore page - returns "public-ready" episodes
  app.get("/api/public/explore", async (req, res) => {
    try {
      const q = (req.query.q as string) || "";
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 24, 1), 60);
      const offset = parseInt(req.query.offset as string) || 0;

      // Get all episodes with transcript status "ready"
      const allEpisodes = await storage.getAllEpisodes();
      const readyEpisodes = allEpisodes.filter((ep: any) => ep.transcriptStatus === "ready");

      // Get all podcasts for lookup
      const podcasts = await storage.getAllPodcasts();
      const podcastMap = new Map(podcasts.map((p: any) => [p.id, p]));

      // Filter to "public-ready" episodes: claims >= 10 OR has narrative
      const publicReadyEpisodes: any[] = [];

      for (const ep of readyEpisodes) {
        const [claims, episodeSegments, viralMoments] = await Promise.all([
          storage.getClaimsByEpisodeId(ep.id),
          storage.getEpisodeSegmentsByEpisode(ep.id),
          storage.getViralMomentsByEpisode(ep.id),
        ]);

        const narrativeSegments = episodeSegments.filter((s: any) => s.segmentType === "narrative");
        const claimsCount = claims.length;
        const hasNarrative = narrativeSegments.length > 0;
        const momentsCount = viralMoments.length;

        // Inclusion criteria: claims >= 10 OR narrative exists
        if (claimsCount >= 10 || hasNarrative) {
          const podcast = podcastMap.get(ep.podcastId);
          
          // Compute hook (deterministic fallback order)
          let hook = "";
          
          // 1. Try narrative first segment summary
          if (narrativeSegments.length > 0) {
            const sorted = [...narrativeSegments].sort((a: any, b: any) => 
              (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || a.startTime - b.startTime
            );
            hook = sorted[0]?.summary || "";
          }
          
          // 2. Try highest confidence claim
          if (!hook && claims.length > 0) {
            const sorted = [...claims].sort((a: any, b: any) => 
              (b.confidence ?? 0) - (a.confidence ?? 0)
            );
            hook = sorted[0]?.claimText || "";
          }
          
          // 3. Try clean description snippet
          if (!hook && ep.description) {
            hook = ep.description
              .replace(/<[^>]*>/g, "") // Strip HTML
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 160);
            if (hook.length === 160) hook = hook.slice(0, hook.lastIndexOf(" ")) + "...";
          }
          
          // 4. Fallback
          if (!hook) {
            hook = "Structured analysis of key claims, insights, and narrative structure.";
          }

          publicReadyEpisodes.push({
            id: ep.id,
            title: ep.title,
            podcastName: podcast?.title || "Unknown Podcast",
            podcastId: ep.podcastId,
            publishedAt: ep.publishedAt,
            durationSec: ep.duration || null,
            hook,
            badges: {
              hasNarrative,
              claimsCount,
              momentsCount,
            },
            analysisUrl: `/episode/${ep.id}`,
            podcastImageUrl: podcast?.artworkUrl || null,
          });
        }
      }

      // Apply search filter if q is provided
      let filteredEpisodes = publicReadyEpisodes;
      if (q) {
        const qLower = q.toLowerCase();
        filteredEpisodes = publicReadyEpisodes.filter((ep: any) =>
          ep.title.toLowerCase().includes(qLower) ||
          ep.podcastName.toLowerCase().includes(qLower) ||
          ep.hook.toLowerCase().includes(qLower)
        );
      }

      // Sort by analysis depth: claims count (desc), then has narrative, then publish date
      filteredEpisodes.sort((a: any, b: any) => {
        // Primary: claims count (higher is better)
        const claimsDiff = (b.badges.claimsCount || 0) - (a.badges.claimsCount || 0);
        if (claimsDiff !== 0) return claimsDiff;
        
        // Secondary: has narrative (narrative first)
        if (b.badges.hasNarrative && !a.badges.hasNarrative) return 1;
        if (a.badges.hasNarrative && !b.badges.hasNarrative) return -1;
        
        // Tertiary: publish date (newer first)
        const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
        const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
        return dateB - dateA;
      });

      // Apply pagination
      const total = filteredEpisodes.length;
      const paginatedEpisodes = filteredEpisodes.slice(offset, offset + limit);

      res.json({
        episodes: paginatedEpisodes,
        pagination: {
          total,
          offset,
          limit,
          hasMore: offset + limit < total,
        },
      });
    } catch (error) {
      console.error("[EXPLORE] Error fetching public episodes:", error);
      res.status(500).json({ error: "Failed to fetch explore episodes" });
    }
  });

  // Explore Feed v2 - Powers the redesigned explore page
  app.get("/api/explore/feed", async (req, res) => {
    try {
      // Get all episodes with transcript status "ready"
      const allEpisodes = await storage.getAllEpisodes();
      const readyEpisodes = allEpisodes.filter((ep: any) => ep.transcriptStatus === "ready");

      // Get all podcasts for lookup
      const podcasts = await storage.getAllPodcasts();
      const podcastMap = new Map(podcasts.map((p: any) => [p.id, p]));

      // Aggregate data across all ready episodes
      const allClaims: any[] = [];
      const allMoments: any[] = [];
      const episodeData: any[] = [];
      const topicCounts: Record<string, { episodeCount: number; claimCount: number; episodes: Set<string> }> = {};

      // Theme inference (reusing logic from episode-public)
      const inferTheme = (text: string): string => {
        const lower = text.toLowerCase();
        if (lower.includes("revenue") || lower.includes("arr") || lower.includes("mrr") || lower.includes("sales") || lower.includes("growth")) return "Growth";
        if (lower.includes("product") || lower.includes("feature") || lower.includes("build") || lower.includes("ship")) return "Product";
        if (lower.includes("hire") || lower.includes("team") || lower.includes("culture") || lower.includes("talent")) return "Hiring";
        if (lower.includes("money") || lower.includes("price") || lower.includes("monetiz") || lower.includes("business model")) return "Monetization";
        if (lower.includes("strategy") || lower.includes("compete") || lower.includes("market") || lower.includes("position")) return "Strategy";
        if (lower.includes("leader") || lower.includes("ceo") || lower.includes("founder") || lower.includes("manage")) return "Leadership";
        if (lower.includes("ai") || lower.includes("machine learning") || lower.includes("gpt") || lower.includes("llm") || lower.includes("tech")) return "AI & Tech";
        return "General";
      };

      for (const ep of readyEpisodes) {
        const [claims, episodeSegments, viralMoments] = await Promise.all([
          storage.getClaimsByEpisodeId(ep.id),
          storage.getEpisodeSegmentsByEpisode(ep.id),
          storage.getViralMomentsByEpisode(ep.id),
        ]);

        const narrativeSegments = episodeSegments.filter((s: any) => s.segmentType === "narrative");
        const keyMoments = viralMoments.filter((m: any) => m.momentKind === "key");
        const claimsCount = claims.length;
        const hasNarrative = narrativeSegments.length > 0;
        const momentsCount = keyMoments.length;

        // Only include episodes with sufficient analysis
        if (claimsCount >= 10 || hasNarrative) {
          const podcast = podcastMap.get(ep.podcastId);

          // Compute hook
          let hook = "";
          if (narrativeSegments.length > 0) {
            const sorted = [...narrativeSegments].sort((a: any, b: any) => 
              (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || a.startTime - b.startTime
            );
            hook = sorted[0]?.summary || "";
          }
          if (!hook && claims.length > 0) {
            const sorted = [...claims].sort((a: any, b: any) => 
              (b.confidence ?? 0) - (a.confidence ?? 0)
            );
            hook = sorted[0]?.claimText || "";
          }
          if (!hook) hook = "Structured analysis of key claims, insights, and narrative structure.";

          // Find best quote from this episode
          let bestQuote = "";
          let bestQuoteTime = 0;
          if (keyMoments.length > 0) {
            const topMoment = keyMoments.sort((a: any, b: any) => (b.viralityScore || 0) - (a.viralityScore || 0))[0];
            bestQuote = topMoment.transcriptSnippet || topMoment.whyThisMatters || "";
            bestQuoteTime = topMoment.startTime || 0;
          } else if (claims.length > 0) {
            const topClaim = claims.sort((a: any, b: any) => (b.confidence || 0) - (a.confidence || 0))[0];
            bestQuote = topClaim.contextText || topClaim.claimText || "";
            bestQuoteTime = topClaim.startTime || 0;
          }

          // Analysis depth score
          const depthScore = (hasNarrative ? 3 : 0) + (momentsCount > 0 ? 2 : 0) + Math.min(claimsCount / 10, 5);

          // Compute primary theme(s) for this episode based on claim themes
          const episodeThemeCounts: Record<string, number> = {};
          for (const claim of claims) {
            const theme = inferTheme(claim.claimText || "");
            episodeThemeCounts[theme] = (episodeThemeCounts[theme] || 0) + 1;
          }
          const sortedThemes = Object.entries(episodeThemeCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([theme]) => theme);

          episodeData.push({
            id: ep.id,
            title: ep.title,
            podcastName: podcast?.title || "Unknown Podcast",
            podcastId: ep.podcastId,
            publishedAt: ep.publishedAt,
            durationSec: ep.duration || null,
            hook,
            bestQuote,
            bestQuoteTime,
            depthScore,
            themes: sortedThemes,
            badges: {
              hasNarrative,
              narrativeSegmentCount: narrativeSegments.length,
              claimsCount,
              momentsCount,
            },
            analysisUrl: `/episode/${ep.id}`,
            podcastImageUrl: podcast?.artworkUrl || null,
            episodeSummary: ep.episodeSummary || null,
          });

          // Aggregate claims for topic counting
          for (const claim of claims) {
            const theme = inferTheme(claim.claimText || "");
            allClaims.push({ ...claim, theme, episodeId: ep.id, episodeTitle: ep.title, podcastName: podcast?.title });
            
            if (!topicCounts[theme]) {
              topicCounts[theme] = { episodeCount: 0, claimCount: 0, episodes: new Set() };
            }
            topicCounts[theme].claimCount++;
            if (!topicCounts[theme].episodes.has(ep.id)) {
              topicCounts[theme].episodes.add(ep.id);
              topicCounts[theme].episodeCount++;
            }
          }

          // Aggregate moments for quotes
          for (const moment of keyMoments) {
            allMoments.push({ ...moment, episodeId: ep.id, episodeTitle: ep.title, podcastName: podcast?.title });
          }
        }
      }

      // Sort episodes by depth score, then freshness
      episodeData.sort((a, b) => {
        const depthDiff = b.depthScore - a.depthScore;
        if (Math.abs(depthDiff) > 0.5) return depthDiff;
        const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
        const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
        return dateB - dateA;
      });

      // Build trending topics
      const trendingTopics = Object.entries(topicCounts)
        .map(([topic, data]) => ({
          topic,
          episodeCount: data.episodeCount,
          claimCount: data.claimCount,
        }))
        .sort((a, b) => b.claimCount - a.claimCount)
        .slice(0, 15);

      // Build hero insight (cross-episode aggregated)
      const topTopic = trendingTopics[0];
      const topTopicClaims = allClaims.filter(c => c.theme === topTopic?.topic);
      const bestClaimForHero = topTopicClaims.sort((a, b) => (b.confidence || 0) - (a.confidence || 0))[0];
      
      const heroInsight = topTopic ? {
        title: `${topTopic.topic} insights across ${topTopic.episodeCount} conversations`,
        topicTags: trendingTopics.slice(0, 4).map(t => t.topic),
        episodeCount: topTopic.episodeCount,
        totalMinutes: Math.round(episodeData.reduce((sum, ep) => sum + (ep.durationSec || 0), 0) / 60),
        sourceQuote: bestClaimForHero ? {
          text: bestClaimForHero.claimText || "",
          episodeId: bestClaimForHero.episodeId,
          episodeTitle: bestClaimForHero.episodeTitle,
          timestamp: bestClaimForHero.startTime || 0,
        } : null,
      } : null;

      // Featured playbook (top episode)
      const featuredPlaybook = episodeData[0] || null;

      // Top episodes (next 8)
      const topEpisodes = episodeData.slice(1, 12);

      // Most cited quotes (from key moments with best snippets)
      const quotesWithScores = allMoments
        .filter(m => m.transcriptSnippet && m.transcriptSnippet.length > 20)
        .map(m => ({
          text: m.transcriptSnippet,
          episodeId: m.episodeId,
          episodeTitle: m.episodeTitle,
          podcastName: m.podcastName,
          timestamp: m.startTime || 0,
          score: (m.viralityScore || 0) + (m.transcriptSnippet?.length > 50 ? 1 : 0),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 8);

      // Build trending insights - aggregate claims by theme with cross-episode frequency
      // Group claims by theme to get representative claims with episode frequency
      const claimsByTheme: Record<string, { 
        claims: typeof allClaims; 
        episodes: Set<string>;
      }> = {};
      
      for (const claim of allClaims) {
        if (!claim.claimText || claim.claimText.length < 30 || claim.claimText.length > 200) continue;
        const theme = claim.theme;
        if (!claimsByTheme[theme]) {
          claimsByTheme[theme] = { claims: [], episodes: new Set() };
        }
        claimsByTheme[theme].claims.push(claim);
        claimsByTheme[theme].episodes.add(claim.episodeId);
      }
      
      // For each theme, pick the best claim (highest confidence) and include episode frequency
      const trendingInsights = Object.entries(claimsByTheme)
        .map(([theme, data]) => {
          const bestClaim = data.claims.sort((a, b) => (b.confidence || 0) - (a.confidence || 0))[0];
          return {
            claim: bestClaim.claimText,
            theme,
            episodeId: bestClaim.episodeId,
            episodeTitle: bestClaim.episodeTitle,
            podcastName: bestClaim.podcastName,
            confidence: bestClaim.confidence || 0,
            episodeCount: data.episodes.size,
          };
        })
        .sort((a, b) => b.episodeCount - a.episodeCount) // Sort by frequency
        .slice(0, 8);

      res.json({
        heroInsight,
        featuredPlaybook,
        topEpisodes,
        trendingTopics,
        trendingInsights,
        mostCitedQuotes: quotesWithScores,
        meta: {
          totalEpisodes: episodeData.length,
          totalClaims: allClaims.length,
          totalMoments: allMoments.length,
        },
      });
    } catch (error) {
      console.error("[EXPLORE-FEED] Error:", error);
      res.status(500).json({ error: "Failed to fetch explore feed" });
    }
  });

  // Initialize Stripe integration
  const { initStripe } = await import("./stripe-init");
  initStripe().catch((err) => {
    console.error("[ROUTES] Stripe init error:", err);
  });

  // Register Creator proxy routes (no auth required - public-facing PLG flow)
  const { registerCreatorRoutes } = await import("./creator-routes");
  registerCreatorRoutes(app);

  // Register Brain API documentation page (no auth required - must be before brain API auth)
  const { registerBrainApiDocs } = await import("./brain-api-docs");
  registerBrainApiDocs(app);

  // Register Brain Intelligence API routes
  const { registerBrainApiRoutes } = await import("./brain-api-routes");
  registerBrainApiRoutes(app);

  const httpServer = createServer(app);

  // Start the job runner in the background (30 second polling interval)
  console.log("[ROUTES] Starting background job runner...");
  runJobRunner(30000).catch((err) => {
    console.error("[ROUTES] Job runner error:", err);
  });

  // Start the scheduled poller for ingestion programs (2-hour interval)
  import("./ingestion/scheduled-poller").then(({ startScheduledPoller }) => {
    console.log("[ROUTES] Starting scheduled ingestion poller...");
    startScheduledPoller();
  }).catch((err) => {
    console.error("[ROUTES] Failed to start scheduled poller:", err);
  });

  return httpServer;
}
