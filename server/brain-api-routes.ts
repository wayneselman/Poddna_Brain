import type { Express } from "express";
import multer from "multer";
import { randomUUID } from "crypto";
import { storage } from "./storage";
import { fireWebhookEvent } from "./webhook-dispatcher";
import { db } from "./db";
import { sql, eq, desc, ilike, and, gte, lte, count } from "drizzle-orm";
import { webhookEventTypes, zoomMeetings, zoomTranscripts, episodes, episodeZoomAnalysis, claimInstances, jobs, episodeSemanticSegments } from "@shared/schema";
import { requireBrainApiKey, generateBrainApiKey } from "./brain-api-auth";
import { sendClipReadyEmail } from "./email";
import { requireAdminSessionOrKey } from "./replitAuth";
import { objectStorageClient } from "./objectStorage";
import { importFromSharedLink } from "./integrations/zoom/zoomSharedLinkImport";
import { convertZoomMeetingToEpisode } from "./integrations/zoom/zoomToEpisodeConverter";
import { z } from "zod";

export function registerBrainApiRoutes(app: Express): void {

  // CORS for all /api/brain/* routes — allows cross-origin requests from any domain
  // (needed for Lovable, Crambo, and other external frontends using Bearer token auth)
  app.use("/api/brain", (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept");
    res.setHeader("Access-Control-Max-Age", "86400");
    if (req.method === "OPTIONS") {
      return res.status(204).end();
    }
    next();
  });

  // Apply API key auth to all /api/brain/* routes
  app.use("/api/brain", requireBrainApiKey);

  // ============ 0. Admin API Key Management (admin auth, NOT brain key auth) ============

  app.post("/api/admin/brain-keys", requireAdminSessionOrKey, async (req: any, res) => {
    try {
      const { name, scopes, rateLimitPerMin } = req.body;
      if (!name) return res.status(400).json({ error: "name is required" });

      const { raw, hash, prefix } = generateBrainApiKey();
      const key = await storage.createBrainApiKey({
        keyHash: hash,
        keyPrefix: prefix,
        name,
        ownerId: req.user?.id || null,
        scopes: scopes || ["read"],
        rateLimitPerMin: rateLimitPerMin || 60,
        isActive: true,
      });

      const { keyHash, ...safeKey } = key;
      res.status(201).json({
        ...safeKey,
        rawKey: raw,
        note: "Save this key now. It will not be shown again.",
      });
    } catch (error) {
      console.error("Error creating brain API key:", error);
      res.status(500).json({ error: "Failed to create API key" });
    }
  });

  app.get("/api/admin/brain-keys", requireAdminSessionOrKey, async (_req, res) => {
    try {
      const keys = await storage.listBrainApiKeys();
      const safe = keys.map(({ keyHash, ...rest }) => rest);
      res.json(safe);
    } catch (error) {
      console.error("Error listing brain API keys:", error);
      res.status(500).json({ error: "Failed to list API keys" });
    }
  });

  app.patch("/api/admin/brain-keys/:id", requireAdminSessionOrKey, async (req, res) => {
    try {
      const { name, scopes, rateLimitPerMin, isActive } = req.body;
      const update: any = {};
      if (name !== undefined) update.name = name;
      if (scopes !== undefined) update.scopes = scopes;
      if (rateLimitPerMin !== undefined) update.rateLimitPerMin = rateLimitPerMin;
      if (isActive !== undefined) update.isActive = isActive;

      const key = await storage.updateBrainApiKey(req.params.id, update);
      if (!key) return res.status(404).json({ error: "API key not found" });
      const { keyHash, ...safe } = key;
      res.json(safe);
    } catch (error) {
      console.error("Error updating brain API key:", error);
      res.status(500).json({ error: "Failed to update API key" });
    }
  });

  app.delete("/api/admin/brain-keys/:id", requireAdminSessionOrKey, async (req, res) => {
    try {
      const revoked = await storage.revokeBrainApiKey(req.params.id);
      if (!revoked) return res.status(404).json({ error: "API key not found" });
      res.json({ success: true });
    } catch (error) {
      console.error("Error revoking brain API key:", error);
      res.status(500).json({ error: "Failed to revoke API key" });
    }
  });

  // ============ 1. Speaker Graph API ============

  app.get("/api/brain/speakers", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const offset = parseInt(req.query.offset as string) || 0;
      const q = req.query.q as string | undefined;

      if (q) {
        const speakers = await storage.searchSpeakers(q, limit);
        return res.json(speakers);
      }

      const speakers = await storage.getAllSpeakers(limit, offset);
      res.json(speakers);
    } catch (error) {
      console.error("Error listing speakers:", error);
      res.status(500).json({ error: "Failed to list speakers" });
    }
  });

  app.get("/api/brain/speakers/:id", async (req, res) => {
    try {
      const speaker = await storage.getSpeakerWithAppearances(req.params.id);
      if (!speaker) {
        return res.status(404).json({ error: "Speaker not found" });
      }
      res.json(speaker);
    } catch (error) {
      console.error("Error getting speaker:", error);
      res.status(500).json({ error: "Failed to get speaker" });
    }
  });

  app.get("/api/brain/episodes/:episodeId/speakers", async (req, res) => {
    try {
      const speakers = await storage.getEpisodeSpeakers(req.params.episodeId);
      res.json(speakers);
    } catch (error) {
      console.error("Error getting episode speakers:", error);
      res.status(500).json({ error: "Failed to get episode speakers" });
    }
  });

  app.post("/api/brain/episodes/:episodeId/resolve-speakers", async (req, res) => {
    try {
      const { episodeId } = req.params;
      const episode = await storage.getEpisode(episodeId);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }

      const sources = await storage.getEpisodeSourcesByEpisode(episodeId);
      const source = sources[0];

      const job = await storage.createJob({
        type: "resolve_speakers",
        episodeSourceId: source?.id,
        result: { episodeId },
      });

      res.json({ jobId: job.id, status: "queued" });
    } catch (error) {
      console.error("Error queueing resolve-speakers job:", error);
      res.status(500).json({ error: "Failed to queue resolve-speakers job" });
    }
  });

  // ============ 2. Contradiction Detection API ============

  app.get("/api/brain/episodes/:episodeId/contradictions", async (req, res) => {
    try {
      const { episodeId } = req.params;
      const result = await db.execute(sql`
        SELECT sr.*, 
          s_a.text as statement_a_text, s_a.start_time as statement_a_start_time, 
          s_b.text as statement_b_text, s_b.start_time as statement_b_start_time 
        FROM statement_relations sr 
        JOIN statements s_a ON sr.statement_a_id = s_a.id 
        JOIN statements s_b ON sr.statement_b_id = s_b.id 
        WHERE sr.episode_id = ${episodeId} AND sr.relation = 'contradicts' 
        ORDER BY sr.confidence DESC
      `);
      res.json(result.rows);
    } catch (error) {
      console.error("Error getting contradictions:", error);
      res.status(500).json({ error: "Failed to get contradictions" });
    }
  });

  app.post("/api/brain/episodes/:episodeId/detect-contradictions", async (req, res) => {
    try {
      const { episodeId } = req.params;
      const episode = await storage.getEpisode(episodeId);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }

      const sources = await storage.getEpisodeSourcesByEpisode(episodeId);
      const source = sources[0];

      const job = await storage.createJob({
        type: "detect_contradictions",
        episodeSourceId: source?.id,
        result: { episodeId },
      });

      res.json({ jobId: job.id, status: "queued" });
    } catch (error) {
      console.error("Error queueing detect-contradictions job:", error);
      res.status(500).json({ error: "Failed to queue detect-contradictions job" });
    }
  });

  // ============ 3. Topic Taxonomy API ============

  app.get("/api/brain/topics", async (_req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT t.*, count(st.id) as statement_count 
        FROM topics t 
        LEFT JOIN statement_topics st ON t.id = st.topic_id 
        GROUP BY t.id 
        ORDER BY count(st.id) DESC 
        LIMIT 100
      `);
      res.json(result.rows);
    } catch (error) {
      console.error("Error listing topics:", error);
      res.status(500).json({ error: "Failed to list topics" });
    }
  });

  app.get("/api/brain/topics/:topicId/statements", async (req, res) => {
    try {
      const { topicId } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;
      const result = await db.execute(sql`
        SELECT s.id, s.text, s.start_time, s.episode_id, e.title as episode_title, st.relevance 
        FROM statement_topics st 
        JOIN statements s ON st.statement_id = s.id 
        JOIN episodes e ON s.episode_id = e.id 
        WHERE st.topic_id = ${topicId} 
        ORDER BY st.relevance DESC 
        LIMIT ${limit}
      `);
      res.json(result.rows);
    } catch (error) {
      console.error("Error getting topic statements:", error);
      res.status(500).json({ error: "Failed to get topic statements" });
    }
  });

  // ============ 4. Webhook Management API ============

  app.get("/api/brain/webhooks", async (_req, res) => {
    try {
      const webhooks = await storage.getWebhooks();
      res.json(webhooks);
    } catch (error) {
      console.error("Error listing webhooks:", error);
      res.status(500).json({ error: "Failed to list webhooks" });
    }
  });

  app.post("/api/brain/webhooks", async (req, res) => {
    try {
      const { url, secret, events, description } = req.body;

      if (!url || !secret || !events || !Array.isArray(events)) {
        return res.status(400).json({ error: "url, secret, and events are required" });
      }

      const validEvents = webhookEventTypes as readonly string[];
      const invalidEvents = events.filter((e: string) => !validEvents.includes(e));
      if (invalidEvents.length > 0) {
        return res.status(400).json({ error: `Invalid event types: ${invalidEvents.join(", ")}` });
      }

      const webhook = await storage.createWebhook({ url, secret, events, description });
      res.status(201).json(webhook);
    } catch (error) {
      console.error("Error creating webhook:", error);
      res.status(500).json({ error: "Failed to create webhook" });
    }
  });

  app.patch("/api/brain/webhooks/:id", async (req, res) => {
    try {
      const { url, events, isActive, description } = req.body;
      const updated = await storage.updateWebhook(req.params.id, { url, events, isActive, description });
      if (!updated) {
        return res.status(404).json({ error: "Webhook not found" });
      }
      res.json(updated);
    } catch (error) {
      console.error("Error updating webhook:", error);
      res.status(500).json({ error: "Failed to update webhook" });
    }
  });

  app.delete("/api/brain/webhooks/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteWebhook(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Webhook not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting webhook:", error);
      res.status(500).json({ error: "Failed to delete webhook" });
    }
  });

  app.post("/api/brain/webhooks/:id/test", async (req, res) => {
    try {
      const { id } = req.params;
      await fireWebhookEvent("test", { webhookId: id, message: "Test delivery" });
      res.json({ success: true });
    } catch (error) {
      console.error("Error sending test webhook:", error);
      res.status(500).json({ error: "Failed to send test webhook" });
    }
  });

  // ============ 5. On-Demand Ingestion API ============

  // T001: YouTube video validation via Brain API
  app.post("/api/brain/validate-youtube", async (req, res) => {
    try {
      const { youtubeUrl } = req.body;
      if (!youtubeUrl) {
        return res.status(400).json({ valid: false, error: "youtubeUrl is required" });
      }

      const videoIdMatch = youtubeUrl.match(/(?:v=|\/shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
      if (!videoIdMatch) {
        return res.status(400).json({ valid: false, error: "Could not extract video ID from URL. Provide a valid YouTube URL." });
      }
      const youtubeVideoId = videoIdMatch[1];

      let title = "Unknown";
      let durationSeconds = 0;
      let isLive = false;
      let hasCaptions = false;
      let usedFallback = false;

      try {
        const { Innertube } = await import("youtubei.js");
        const yt = await Innertube.create();
        const info = await yt.getInfo(youtubeVideoId);
        title = info.basic_info.title || "Unknown";
        durationSeconds = info.basic_info.duration || 0;
        isLive = !!info.basic_info.is_live;

        try {
          const transcriptInfo = await info.getTranscript();
          hasCaptions = !!(transcriptInfo?.transcript?.content?.body?.initial_segments?.length);
        } catch {
          hasCaptions = false;
        }
      } catch (ytError: any) {
        console.log("[BRAIN] youtubei.js failed, using oEmbed fallback:", ytError.message?.slice(0, 100));
        const msg = ytError.message || "";
        if (msg.includes("Sign in to confirm your age")) {
          return res.json({ valid: false, error: "This video is age-restricted and cannot be processed." });
        }
        if (msg.includes("Private video") || msg.includes("private video")) {
          return res.json({ valid: false, error: "This video is private. Please make it public or unlisted." });
        }
        if (msg.includes("Video unavailable") || msg.includes("video unavailable")) {
          return res.json({ valid: false, error: "This video is unavailable or has been removed." });
        }

        try {
          const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${youtubeVideoId}&format=json`;
          const oembedRes = await fetch(oembedUrl);
          if (!oembedRes.ok) {
            return res.json({ valid: false, error: "Could not access this video. Please check the URL." });
          }
          const oembedData = await oembedRes.json();
          title = oembedData.title || "Unknown";
          hasCaptions = true;
          usedFallback = true;
        } catch {
          return res.json({ valid: false, error: "Could not access this video. Please check the URL." });
        }
      }

      const thumbnail = `https://img.youtube.com/vi/${youtubeVideoId}/mqdefault.jpg`;

      if (isLive) {
        return res.json({ valid: false, error: "Live streams cannot be processed. Please wait until the stream ends." });
      }

      const MAX_DURATION_SECONDS = 4 * 60 * 60;
      if (durationSeconds > MAX_DURATION_SECONDS) {
        return res.json({ valid: false, error: `Video is ${Math.round(durationSeconds / 60)} minutes long. Maximum is 4 hours.` });
      }

      const existingSource = await storage.getEpisodeSourceByYouTubeId(youtubeVideoId);
      let alreadyProcessed = false;
      let existingEpisodeId: string | null = null;
      if (existingSource) {
        alreadyProcessed = true;
        existingEpisodeId = existingSource.episodeId;
      }

      const estimatedMinutes = usedFallback ? 5 : Math.max(2, Math.round(durationSeconds / 60 * 0.3));

      return res.json({
        valid: true,
        youtubeVideoId,
        title,
        durationSeconds,
        thumbnail,
        hasCaptions,
        estimatedProcessingMinutes: estimatedMinutes,
        captionNote: !hasCaptions ? "No captions available. Audio will be transcribed directly (may take longer)." : null,
        alreadyProcessed,
        existingEpisodeId,
      });
    } catch (error) {
      console.error("[BRAIN] Error validating YouTube video:", error);
      return res.status(500).json({ valid: false, error: "Failed to validate video." });
    }
  });

  const AUDIO_MIME_TYPES = [
    "audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/ogg",
    "audio/flac", "audio/aac", "audio/mp4", "audio/x-m4a", "audio/webm",
    "audio/x-ms-wma", "audio/amr", "audio/3gpp",
  ];
  const MAX_AUDIO_SIZE = 500 * 1024 * 1024;

  const audioUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_AUDIO_SIZE },
    fileFilter: (_req, file, cb) => {
      if (AUDIO_MIME_TYPES.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error(`Unsupported audio format: ${file.mimetype}. Accepted: mp3, wav, ogg, flac, aac, m4a, webm, wma, amr`));
      }
    },
  });

  app.post("/api/brain/upload", (req: any, res, next) => {
    audioUpload.single("file")(req, res, (err: any) => {
      if (err) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({ error: "File too large. Maximum size is 500 MB." });
        }
        return res.status(400).json({ error: err.message });
      }
      next();
    });
  }, async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file provided. Send a multipart form with field name 'file'." });
      }

      const privateDir = process.env.PRIVATE_OBJECT_DIR;
      if (!privateDir) {
        return res.status(500).json({ error: "Object storage not configured" });
      }

      const ext = req.file.originalname?.split(".").pop()?.toLowerCase() || "mp3";
      const objectId = randomUUID();
      const objectPath = `audio-uploads/${objectId}.${ext}`;
      const fullPath = `${privateDir}/${objectPath}`;

      const parts = fullPath.startsWith("/") ? fullPath.slice(1).split("/") : fullPath.split("/");
      const bucketName = parts[0];
      const objectName = parts.slice(1).join("/");

      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);

      await file.save(req.file.buffer, {
        metadata: {
          contentType: req.file.mimetype,
          metadata: {
            originalName: req.file.originalname,
            uploadedVia: "brain-api",
            apiKeyId: req.brainApiKey?.id || "unknown",
          },
        },
      });

      const storageUrl = `https://storage.googleapis.com/${bucketName}/${objectName}`;

      console.log(`[BRAIN-UPLOAD] Uploaded ${req.file.originalname} (${(req.file.size / 1024 / 1024).toFixed(1)}MB) → ${objectPath}`);

      return res.status(200).json({
        storageUrl,
        objectPath,
        size: req.file.size,
        mimeType: req.file.mimetype,
        originalName: req.file.originalname,
      });
    } catch (error: any) {
      console.error("[BRAIN-UPLOAD] Error:", error);
      return res.status(500).json({ error: "Failed to upload audio file" });
    }
  });

  // T003: Enhanced ingestion with analysisTypes and automatic pipeline chaining
  app.post("/api/brain/ingest", async (req, res) => {
    try {
      const { type, sourceUrl, priority, callbackUrl, metadata, analysisTypes } = req.body;

      if (!type || !sourceUrl) {
        return res.status(400).json({ error: "type and sourceUrl are required" });
      }

      const validTypes = ["rss_feed", "youtube_url", "audio_file"];
      if (!validTypes.includes(type)) {
        return res.status(400).json({ error: `Invalid type. Must be one of: ${validTypes.join(", ")}` });
      }

      if (analysisTypes && !Array.isArray(analysisTypes)) {
        return res.status(400).json({ error: "analysisTypes must be an array" });
      }
      const validAnalysis = ["viral_moments", "narrative", "entities", "speakers", "contradictions"];
      if (analysisTypes) {
        const invalid = analysisTypes.filter((a: string) => !validAnalysis.includes(a));
        if (invalid.length > 0) {
          return res.status(400).json({ error: `Invalid analysisTypes: ${invalid.join(", ")}. Valid: ${validAnalysis.join(", ")}` });
        }
      }

      const ingestionMeta = {
        ...(metadata || {}),
        analysisTypes: analysisTypes || [],
      };

      const request = await storage.createIngestionRequest({
        type,
        sourceUrl,
        priority: priority || "normal",
        callbackUrl,
        metadata: ingestionMeta,
      });

      if (type === "youtube_url") {
        const videoIdMatch = sourceUrl.match(/(?:v=|\/shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
        if (videoIdMatch) {
          const youtubeVideoId = videoIdMatch[1];
          const existingSource = await storage.getEpisodeSourceByYouTubeId(youtubeVideoId);

          if (existingSource) {
            const episodeId = existingSource.episodeId;
            await storage.updateIngestionRequest(request.id, {
              episodeId,
              status: "processing",
              processingSteps: [{ step: "episode_lookup", status: "complete", completedAt: new Date().toISOString() }],
            });

            const existingSegments = await storage.getSegmentsByEpisode(episodeId);
            if (existingSegments.length > 0) {
              const wantsViral = analysisTypes?.includes("viral_moments");
              if (wantsViral) {
                const existingMoments = await storage.getViralMomentsByEpisode(episodeId);
                if (existingMoments.length > 0) {
                  await storage.updateIngestionRequest(request.id, {
                    status: "complete",
                    completedAt: new Date(),
                    processingSteps: [
                      { step: "episode_lookup", status: "complete", completedAt: new Date().toISOString() },
                      { step: "transcript", status: "complete", completedAt: new Date().toISOString() },
                      { step: "viral_moments", status: "complete", completedAt: new Date().toISOString(), count: existingMoments.length },
                    ],
                  });
                  return res.status(201).json({ id: request.id, status: "complete", episodeId });
                }

                const job = await storage.createJob({
                  type: "detect_viral_moments",
                  episodeSourceId: existingSource.id,
                  pipelineStage: "INTEL",
                  result: { episodeId, ingestionRequestId: request.id },
                });
                await storage.updateIngestionRequest(request.id, {
                  jobIds: [job.id],
                  processingSteps: [
                    { step: "episode_lookup", status: "complete", completedAt: new Date().toISOString() },
                    { step: "transcript", status: "complete", completedAt: new Date().toISOString() },
                    { step: "viral_moments", status: "processing" },
                  ],
                });
              } else {
                await storage.updateIngestionRequest(request.id, {
                  status: "complete",
                  completedAt: new Date(),
                  processingSteps: [
                    { step: "episode_lookup", status: "complete", completedAt: new Date().toISOString() },
                    { step: "transcript", status: "complete", completedAt: new Date().toISOString() },
                  ],
                });
                return res.status(201).json({ id: request.id, status: "complete", episodeId });
              }

              return res.status(201).json({ id: request.id, status: "processing", episodeId });
            }

            const transcriptJob = await storage.createJob({
              type: "youtube_transcript",
              episodeSourceId: existingSource.id,
              pipelineStage: "INGEST",
              result: { episodeId, ingestionRequestId: request.id, analysisTypes: analysisTypes || [] },
            });
            await storage.updateIngestionRequest(request.id, {
              jobIds: [transcriptJob.id],
              processingSteps: [
                { step: "episode_lookup", status: "complete", completedAt: new Date().toISOString() },
                { step: "transcript", status: "processing" },
              ],
            });

            return res.status(201).json({ id: request.id, status: "processing", episodeId });
          }

          const USER_SUBMISSIONS_TITLE = "Brain API Submissions";
          let podcast = await storage.getPodcastByTitle(USER_SUBMISSIONS_TITLE);
          if (!podcast) {
            podcast = await storage.createPodcast({
              title: USER_SUBMISSIONS_TITLE,
              host: "Brain API",
              description: "Videos submitted via the Brain API for intelligence processing",
            });
          }

          const episode = await storage.createEpisode({
            title: `YouTube Video ${youtubeVideoId}`,
            podcastId: podcast.id,
            publishedAt: new Date(),
            duration: 0,
            type: "video",
            mediaUrl: sourceUrl,
          });

          const source = await storage.createEpisodeSource({
            episodeId: episode.id,
            kind: "video",
            platform: "youtube",
            sourceUrl: sourceUrl,
            isCanonical: true,
          });

          const transcriptJob = await storage.createJob({
            type: "youtube_transcript",
            episodeSourceId: source.id,
            pipelineStage: "INGEST",
            result: { episodeId: episode.id, ingestionRequestId: request.id, analysisTypes: analysisTypes || [] },
          });

          await storage.updateIngestionRequest(request.id, {
            episodeId: episode.id,
            jobIds: [transcriptJob.id],
            processingSteps: [
              { step: "episode_create", status: "complete", completedAt: new Date().toISOString() },
              { step: "transcript", status: "processing" },
            ],
            status: "processing",
          });

          console.log(`[BRAIN-INGEST] Created episode ${episode.id}, transcript job ${transcriptJob.id} for ingestion ${request.id}`);
          return res.status(201).json({ id: request.id, status: "processing", episodeId: episode.id });
        }
      }

      if (type === "audio_file") {
        const AUDIO_SUBMISSIONS_TITLE = "Brain API Audio Submissions";
        let podcast = await storage.getPodcastByTitle(AUDIO_SUBMISSIONS_TITLE);
        if (!podcast) {
          podcast = await storage.createPodcast({
            title: AUDIO_SUBMISSIONS_TITLE,
            host: "Brain API",
            description: "Audio files submitted via the Brain API for intelligence processing",
          });
        }

        const fileName = metadata?.title || metadata?.originalName || sourceUrl.split("/").pop() || "Audio Upload";

        const episode = await storage.createEpisode({
          title: fileName,
          podcastId: podcast.id,
          publishedAt: new Date(),
          duration: metadata?.durationSeconds || 0,
          type: "audio",
          mediaUrl: sourceUrl,
        });

        const isStorageUrl = sourceUrl.includes("storage.googleapis.com") || sourceUrl.startsWith("/");
        const source = await storage.createEpisodeSource({
          episodeId: episode.id,
          kind: "audio",
          platform: "upload",
          sourceUrl: isStorageUrl ? null : sourceUrl,
          storageUrl: isStorageUrl ? sourceUrl : null,
          isCanonical: true,
        });

        const transcribeJob = await storage.createJob({
          type: "transcribe",
          episodeSourceId: source.id,
          pipelineStage: "INGEST",
          result: { episodeId: episode.id, ingestionRequestId: request.id, analysisTypes: analysisTypes || [] },
        });

        await storage.updateIngestionRequest(request.id, {
          episodeId: episode.id,
          jobIds: [transcribeJob.id],
          processingSteps: [
            { step: "episode_create", status: "complete", completedAt: new Date().toISOString() },
            { step: "transcript", status: "processing" },
          ],
          status: "processing",
        });

        console.log(`[BRAIN-INGEST] Audio file: created episode ${episode.id}, transcribe job ${transcribeJob.id} for ingestion ${request.id}`);
        return res.status(201).json({ id: request.id, status: "processing", episodeId: episode.id });
      }

      res.status(201).json({ id: request.id, status: request.status });
    } catch (error) {
      console.error("Error creating ingestion request:", error);
      res.status(500).json({ error: "Failed to create ingestion request" });
    }
  });

  app.post("/api/brain/ingest/transcript", async (req, res) => {
    try {
      const { title, sourceUrl, segments, metadata, analysisTypes } = req.body;

      if (!segments || !Array.isArray(segments) || segments.length === 0) {
        return res.status(400).json({ error: "segments array is required and must not be empty" });
      }

      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        if (typeof seg.text !== "string" || !seg.text.trim()) {
          return res.status(400).json({ error: `segments[${i}].text is required` });
        }
        if (typeof seg.startMs !== "number" || typeof seg.endMs !== "number") {
          return res.status(400).json({ error: `segments[${i}] must have numeric startMs and endMs` });
        }
      }

      if (segments.length > 10000) {
        return res.status(400).json({ error: "Maximum 10,000 segments per submission" });
      }

      const validAnalysis = ["viral_moments", "claims", "statements"];
      if (analysisTypes) {
        if (!Array.isArray(analysisTypes)) {
          return res.status(400).json({ error: "analysisTypes must be an array" });
        }
        const invalid = analysisTypes.filter((a: string) => !validAnalysis.includes(a));
        if (invalid.length > 0) {
          return res.status(400).json({ error: `Invalid analysisTypes: ${invalid.join(", ")}. Valid: ${validAnalysis.join(", ")}` });
        }
      }

      const TRANSCRIPT_SUBMISSIONS_TITLE = "Brain API Transcript Submissions";
      let podcast = await storage.getPodcastByTitle(TRANSCRIPT_SUBMISSIONS_TITLE);
      if (!podcast) {
        podcast = await storage.createPodcast({
          title: TRANSCRIPT_SUBMISSIONS_TITLE,
          host: "Brain API",
          description: "Pre-transcribed content submitted via the Brain API",
        });
      }

      const episodeTitle = title || metadata?.title || "Untitled Transcript";
      const lastSeg = segments[segments.length - 1];
      const durationMs = lastSeg.endMs || lastSeg.startMs || 0;

      const episode = await storage.createEpisode({
        title: episodeTitle,
        podcastId: podcast.id,
        publishedAt: metadata?.recordedAt ? new Date(metadata.recordedAt) : new Date(),
        duration: Math.round(durationMs / 1000),
        type: metadata?.type || "audio",
        mediaUrl: sourceUrl || `transcript://${Date.now()}`,
      });

      const source = await storage.createEpisodeSource({
        episodeId: episode.id,
        kind: metadata?.type || "audio",
        platform: metadata?.platform || "external",
        sourceUrl: sourceUrl || `transcript://${episode.id}`,
        isCanonical: true,
      });

      const seenTimes = new Set<number>();
      const deduped = segments.map((seg: any) => {
        let startTime = seg.startMs;
        while (seenTimes.has(startTime)) {
          startTime += 1;
        }
        seenTimes.add(startTime);
        return {
          episodeId: episode.id,
          startTime,
          endTime: seg.endMs,
          text: seg.text.trim(),
          type: seg.type || "dialogue",
          speaker: seg.speaker || null,
        };
      });

      await storage.createTranscriptSegments(episode.id, deduped);

      await storage.updateEpisode(episode.id, {
        transcriptStatus: "ready",
        transcriptSource: "external",
      });

      const ingestionRequest = await storage.createIngestionRequest({
        type: "transcript",
        sourceUrl: sourceUrl || `transcript://${episode.id}`,
        priority: "normal",
        metadata: {
          ...(metadata || {}),
          title: episodeTitle,
          analysisTypes: analysisTypes || [],
          segmentCount: deduped.length,
        },
      });

      await storage.updateIngestionRequest(ingestionRequest.id, {
        episodeId: episode.id,
        status: "complete",
        completedAt: new Date(),
        processingSteps: [
          { step: "episode_create", status: "complete", completedAt: new Date().toISOString() },
          { step: "transcript", status: "complete", completedAt: new Date().toISOString(), provider: "external", segmentCount: deduped.length },
        ],
      });

      const queuedJobs: string[] = [];
      if (analysisTypes?.includes("viral_moments") && source) {
        const job = await storage.createJob({
          type: "detect_viral_moments",
          episodeSourceId: source.id,
          pipelineStage: "INTEL",
          result: { episodeId: episode.id, ingestionRequestId: ingestionRequest.id },
        });
        queuedJobs.push("viral_moments");
        console.log(`[BRAIN-INGEST-TRANSCRIPT] Queued detect_viral_moments job ${job.id}`);
      }
      if (analysisTypes?.includes("claims") && source) {
        const job = await storage.createJob({
          type: "detect_claims",
          episodeSourceId: source.id,
          pipelineStage: "INTEL",
          result: { episodeId: episode.id, ingestionRequestId: ingestionRequest.id },
        });
        queuedJobs.push("claims");
        console.log(`[BRAIN-INGEST-TRANSCRIPT] Queued detect_claims job ${job.id}`);
      }
      if (analysisTypes?.includes("statements") && source) {
        const job = await storage.createJob({
          type: "extract_statements",
          episodeSourceId: source.id,
          pipelineStage: "INTEL",
          result: { episodeId: episode.id, ingestionRequestId: ingestionRequest.id },
        });
        queuedJobs.push("statements");
        console.log(`[BRAIN-INGEST-TRANSCRIPT] Queued extract_statements job ${job.id}`);
      }

      if (queuedJobs.length > 0) {
        await storage.updateIngestionRequest(ingestionRequest.id, {
          status: "processing",
          completedAt: null,
          processingSteps: [
            { step: "episode_create", status: "complete", completedAt: new Date().toISOString() },
            { step: "transcript", status: "complete", completedAt: new Date().toISOString(), provider: "external", segmentCount: deduped.length },
            ...queuedJobs.map(j => ({ step: j, status: "processing" })),
          ],
        });
      }

      console.log(`[BRAIN-INGEST-TRANSCRIPT] Created episode ${episode.id} with ${deduped.length} segments, queued: [${queuedJobs.join(", ")}]`);

      return res.status(201).json({
        id: ingestionRequest.id,
        episodeId: episode.id,
        status: queuedJobs.length > 0 ? "processing" : "complete",
        segmentCount: deduped.length,
        queuedAnalysis: queuedJobs,
      });
    } catch (error: any) {
      console.error("[BRAIN-INGEST-TRANSCRIPT] Error:", error);
      return res.status(500).json({ error: "Failed to ingest transcript" });
    }
  });

  app.get("/api/brain/ingest/:id", async (req, res) => {
    try {
      const request = await storage.getIngestionRequest(req.params.id);
      if (!request) {
        return res.status(404).json({ error: "Ingestion request not found" });
      }

      const meta = request.metadata as Record<string, any> || {};
      const response: Record<string, any> = { ...request, sourceUrl: meta.sourceUrl || request.sourceUrl || null };

      if (request.episodeId && request.status !== "complete") {
        const moments = await storage.getViralMomentsByEpisode(request.episodeId);
        const segments = await storage.getSegmentsByEpisode(request.episodeId);
        const meta = request.metadata as Record<string, any> || {};
        const wantsViral = Array.isArray(meta.analysisTypes) && meta.analysisTypes.includes("viral_moments");

        if (segments.length > 0 && wantsViral && moments.length > 0) {
          await storage.updateIngestionRequest(request.id, {
            status: "complete",
            completedAt: new Date(),
            processingSteps: [
              { step: "transcript", status: "complete", completedAt: new Date().toISOString() },
              { step: "viral_moments", status: "complete", completedAt: new Date().toISOString(), count: moments.length },
            ],
          });
          response.status = "complete";
          response.completedAt = new Date();
        } else if (segments.length > 0 && !wantsViral) {
          await storage.updateIngestionRequest(request.id, {
            status: "complete",
            completedAt: new Date(),
          });
          response.status = "complete";
        }

        response.progress = {
          transcriptReady: segments.length > 0,
          transcriptSegments: segments.length,
          viralMomentsReady: moments.length > 0,
          viralMomentsCount: moments.length,
        };
      }

      res.json(response);
    } catch (error) {
      console.error("Error getting ingestion request:", error);
      res.status(500).json({ error: "Failed to get ingestion request" });
    }
  });

  app.get("/api/brain/ingest", async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      const limit = parseInt(req.query.limit as string) || 50;
      const requests = await storage.getIngestionRequests(status, limit);
      res.json(requests);
    } catch (error) {
      console.error("Error listing ingestion requests:", error);
      res.status(500).json({ error: "Failed to list ingestion requests" });
    }
  });

  // ============ 6. Catalog & Status API ============

  app.get("/api/brain/catalog/episodes", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const podcastId = req.query.podcastId as string | undefined;
      const q = req.query.q as string | undefined;

      const result = await db.execute(sql`
        SELECT e.id, e.title, e.published_at, p.title as podcast_title, p.id as podcast_id,
          (SELECT count(*) FROM statements WHERE episode_id = e.id) as statement_count,
          (SELECT count(*) FROM statement_classifications WHERE statement_id IN (SELECT id FROM statements WHERE episode_id = e.id)) as classification_count,
          (SELECT count(*) FROM statement_relations WHERE episode_id = e.id) as relation_count,
          (SELECT count(*) FROM speaker_appearances WHERE episode_id = e.id) as speaker_count,
          EXISTS(SELECT 1 FROM integrity_scores WHERE episode_id = e.id) as has_integrity_score
        FROM episodes e
        JOIN podcasts p ON e.podcast_id = p.id
        WHERE (${podcastId ?? null}::text IS NULL OR e.podcast_id = ${podcastId ?? null})
          AND (${q ?? null}::text IS NULL OR e.title ILIKE '%' || ${q ?? null} || '%')
        ORDER BY e.published_at DESC NULLS LAST
        LIMIT ${limit} OFFSET ${offset}
      `);

      res.json(result.rows);
    } catch (error) {
      console.error("Error listing catalog episodes:", error);
      res.status(500).json({ error: "Failed to list catalog episodes" });
    }
  });

  app.get("/api/brain/catalog/episodes/:episodeId/status", async (req, res) => {
    try {
      const { episodeId } = req.params;

      const episode = await storage.getEpisode(episodeId);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }

      const podcast = await storage.getPodcast(episode.podcastId);

      const checks = await db.execute(sql`
        SELECT
          EXISTS(SELECT 1 FROM transcript_segments WHERE episode_id = ${episodeId}) as transcribed,
          EXISTS(SELECT 1 FROM statements WHERE episode_id = ${episodeId}) as statements_extracted,
          EXISTS(SELECT 1 FROM statement_classifications sc JOIN statements s ON sc.statement_id = s.id WHERE s.episode_id = ${episodeId}) as classified,
          EXISTS(SELECT 1 FROM entity_links el JOIN entity_mentions em ON el.mention_id = em.id WHERE em.episode_id = ${episodeId}) as entities_linked,
          EXISTS(SELECT 1 FROM statement_topics st JOIN statements s ON st.statement_id = s.id WHERE s.episode_id = ${episodeId}) as topics_assigned,
          EXISTS(SELECT 1 FROM statements WHERE episode_id = ${episodeId} AND embedding_status = 'done') as embedded,
          EXISTS(SELECT 1 FROM statement_relations WHERE episode_id = ${episodeId}) as relations_discovered,
          EXISTS(SELECT 1 FROM speaker_appearances WHERE episode_id = ${episodeId}) as speakers_resolved,
          EXISTS(SELECT 1 FROM statement_relations WHERE episode_id = ${episodeId} AND relation = 'contradicts') as contradictions_detected,
          EXISTS(SELECT 1 FROM integrity_scores WHERE episode_id = ${episodeId}) as integrity_scored
      `);

      const row = checks.rows[0] as any;

      res.json({
        episodeId,
        episodeTitle: episode.title,
        podcastTitle: podcast?.title ?? null,
        processing: {
          transcribed: row.transcribed ?? false,
          statementsExtracted: row.statements_extracted ?? false,
          classified: row.classified ?? false,
          entitiesLinked: row.entities_linked ?? false,
          topicsAssigned: row.topics_assigned ?? false,
          embedded: row.embedded ?? false,
          relationsDiscovered: row.relations_discovered ?? false,
          speakersResolved: row.speakers_resolved ?? false,
          contradictionsDetected: row.contradictions_detected ?? false,
          integrityScored: row.integrity_scored ?? false,
        },
      });
    } catch (error) {
      console.error("Error getting episode status:", error);
      res.status(500).json({ error: "Failed to get episode status" });
    }
  });

  app.get("/api/brain/catalog/podcasts", async (_req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT p.id, p.title, p.artwork_url as image_url, 
          count(DISTINCT e.id) as episode_count, 
          count(DISTINCT sa.speaker_id) as speaker_count 
        FROM podcasts p 
        LEFT JOIN episodes e ON e.podcast_id = p.id 
        LEFT JOIN speaker_appearances sa ON sa.podcast_id = p.id 
        GROUP BY p.id 
        ORDER BY count(DISTINCT e.id) DESC 
        LIMIT 100
      `);
      res.json(result.rows);
    } catch (error) {
      console.error("Error listing catalog podcasts:", error);
      res.status(500).json({ error: "Failed to list catalog podcasts" });
    }
  });

  // ============ SHOW INTELLIGENCE ============

  app.get(["/api/brain/show-intelligence/:podcastId", "/api/brain/shows/:podcastId/intelligence"], async (req, res) => {
    try {
      const { podcastId } = req.params;

      // Count analyzed episodes for this podcast
      const episodeStats = await db.execute(sql`
        SELECT
          count(DISTINCT e.id) as total_episodes,
          count(DISTINCT CASE WHEN es.platform = 'youtube' THEN e.id END) as youtube_episodes,
          count(DISTINCT vm.id) as viral_moment_count,
          count(DISTINCT s.id) as statement_count
        FROM episodes e
        JOIN podcasts p ON e.podcast_id = p.id
        LEFT JOIN episode_sources es ON es.episode_id = e.id
        LEFT JOIN viral_moments vm ON vm.episode_id = e.id
        LEFT JOIN statements s ON s.episode_id = e.id
        WHERE e.podcast_id = ${podcastId}
      `);

      const stats = episodeStats.rows[0] as any;
      const totalEpisodes = parseInt(stats?.total_episodes || "0");
      const UNLOCK_THRESHOLD = 5;

      // Fetch the most recent ready show profile
      const profileResult = await db.execute(sql`
        SELECT
          id, podcast_id, episode_count, total_statements, total_claims,
          top_themes, previous_top_themes, top_recurrences, top_contradictions,
          polarity_breakdown, dominant_claim_type, avg_certainty, avg_sentiment,
          computed_at, status, tag_filter
        FROM show_profiles
        WHERE podcast_id = ${podcastId}
          AND status = 'ready'
        ORDER BY computed_at DESC
        LIMIT 1
      `);

      const profile = profileResult.rows[0] as any;

      if (!profile) {
        // No ready profile yet — return gated response
        return res.json({
          podcastId,
          status: "not_ready",
          episodesAnalyzed: totalEpisodes,
          requiredForUnlock: UNLOCK_THRESHOLD,
          progressPercent: Math.min(100, Math.round((totalEpisodes / UNLOCK_THRESHOLD) * 100)),
          stats: {
            totalEpisodes,
            viralMomentCount: parseInt(stats?.viral_moment_count || "0"),
            statementCount: parseInt(stats?.statement_count || "0"),
          },
        });
      }

      return res.json({
        podcastId,
        status: "ready",
        episodesAnalyzed: totalEpisodes,
        requiredForUnlock: UNLOCK_THRESHOLD,
        progressPercent: 100,
        computedAt: profile.computed_at,
        tagFilter: profile.tag_filter || null,
        stats: {
          totalEpisodes,
          episodeCount: profile.episode_count,
          totalStatements: profile.total_statements,
          totalClaims: profile.total_claims,
          viralMomentCount: parseInt(stats?.viral_moment_count || "0"),
          dominantClaimType: profile.dominant_claim_type || null,
          avgCertainty: profile.avg_certainty || null,
          avgSentiment: profile.avg_sentiment || null,
        },
        themes: (profile.top_themes || []).map((t: any) => ({
          ...t,
          name: t.name ?? t.topicName ?? t.topic ?? "",
          topic: t.topic ?? t.topicName ?? t.name ?? "",
          label: t.label ?? t.topicName ?? t.name ?? "",
        })),
        previousThemes: (profile.previous_top_themes || []).map((t: any) => ({
          ...t,
          name: t.name ?? t.topicName ?? t.topic ?? "",
          topic: t.topic ?? t.topicName ?? t.name ?? "",
          label: t.label ?? t.topicName ?? t.name ?? "",
        })),
        recurrences: (profile.top_recurrences || []).map((r: any) => ({
          ...r,
          pattern: r.pattern ?? r.text ?? r.description ?? "",
          description: r.description ?? r.text ?? r.pattern ?? "",
          name: r.name ?? r.text ?? r.pattern ?? "",
          title: r.title ?? r.text ?? r.pattern ?? "",
        })),
        contradictions: (profile.top_contradictions || []).map((c: any) => ({
          ...c,
          statementA: c.statementA ?? c.textA ?? c.text_a ?? c.statement_a ?? "",
          statementB: c.statementB ?? c.textB ?? c.text_b ?? c.statement_b ?? "",
          statement_a: c.statement_a ?? c.textA ?? c.statementA ?? "",
          statement_b: c.statement_b ?? c.textB ?? c.statementB ?? "",
        })),
        polarityBreakdown: profile.polarity_breakdown || {},
        polarity: profile.polarity_breakdown || {},
      });
    } catch (error) {
      console.error("Error fetching show intelligence:", error);
      res.status(500).json({ error: "Failed to fetch show intelligence" });
    }
  });

  // ============ 8. Intelligence Data Endpoints ============

  app.get("/api/brain/episodes/:episodeId/statements", async (req, res) => {
    try {
      const episodeId = req.params.episodeId;
      const includeClassifications = req.query.include_classifications !== "false";

      if (includeClassifications) {
        const result = await db.execute(sql`
          SELECT s.id, s.text, s.speaker, s.start_time, s.end_time, s.segment_id,
            sc.claim_flag, sc.certainty, sc.polarity, sc.sentiment
          FROM statements s
          LEFT JOIN statement_classifications sc ON sc.statement_id = s.id
          WHERE s.episode_id = ${episodeId}
          ORDER BY s.start_time ASC NULLS LAST
        `);
        res.json(result.rows);
      } else {
        const stmts = await storage.getStatementsByEpisode(episodeId);
        res.json(stmts);
      }
    } catch (error) {
      console.error("Error getting episode statements:", error);
      res.status(500).json({ error: "Failed to get episode statements" });
    }
  });

  app.get("/api/brain/episodes/:episodeId/entities", async (req, res) => {
    try {
      const episodeId = req.params.episodeId;
      const result = await db.execute(sql`
        SELECT DISTINCT ce.id, ce.name, ce.type, ce.external_refs,
          el.mention_id, el.confidence as link_confidence
        FROM canonical_entities ce
        INNER JOIN entity_links el ON el.canonical_id = ce.id
        INNER JOIN entity_mentions em ON em.id = el.mention_id
        INNER JOIN transcript_segments ts ON ts.id = em.segment_id
        WHERE ts.episode_id = ${episodeId}
        ORDER BY ce.type, ce.name
      `);
      res.json(result.rows);
    } catch (error) {
      console.error("Error getting episode entities:", error);
      res.status(500).json({ error: "Failed to get episode entities" });
    }
  });

  // GET /api/brain/episodes/:episodeId/claims
  // Returns claim instances (factual claims, buyer claims, gate checks, etc.) for an episode.
  // Supports ?kind= filter (e.g. ?kind=buyer_claim or ?kind=gate_check,decision_signal)
  app.get("/api/brain/episodes/:episodeId/claims", async (req, res) => {
    try {
      const { episodeId } = req.params;
      const kindFilter = req.query.kind as string | undefined;

      let query = sql`
        SELECT id, episode_id, source_type, speaker_role, claim_text,
               start_ms, end_ms, claim_kind, claim_meta, cluster_id, created_at
        FROM claim_instances
        WHERE episode_id = ${episodeId}
      `;

      if (kindFilter) {
        const kinds = kindFilter.split(",").map(k => k.trim()).filter(Boolean);
        query = sql`
          SELECT id, episode_id, source_type, speaker_role, claim_text,
                 start_ms, end_ms, claim_kind, claim_meta, cluster_id, created_at
          FROM claim_instances
          WHERE episode_id = ${episodeId}
          AND claim_kind = ANY(${kinds})
          ORDER BY start_ms ASC NULLS LAST
        `;
      } else {
        query = sql`
          SELECT id, episode_id, source_type, speaker_role, claim_text,
                 start_ms, end_ms, claim_kind, claim_meta, cluster_id, created_at
          FROM claim_instances
          WHERE episode_id = ${episodeId}
          ORDER BY start_ms ASC NULLS LAST
        `;
      }

      const result = await db.execute(query);
      res.json(result.rows);
    } catch (error) {
      console.error("Error getting episode claims:", error);
      res.status(500).json({ error: "Failed to get episode claims" });
    }
  });

  // GET /api/brain/entities
  // Lists all canonical entities. Supports ?type= filter and ?q= name search.
  app.get("/api/brain/entities", async (req, res) => {
    try {
      const typeFilter = req.query.type as string | undefined;
      const nameQuery = req.query.q as string | undefined;
      const limitVal = Math.min(parseInt(req.query.limit as string) || 100, 500);

      let result;
      if (typeFilter && nameQuery) {
        result = await db.execute(sql`
          SELECT id, name, type, external_refs, created_at
          FROM canonical_entities
          WHERE type = ${typeFilter} AND lower(name) LIKE ${"%" + nameQuery.toLowerCase() + "%"}
          ORDER BY name ASC
          LIMIT ${limitVal}
        `);
      } else if (typeFilter) {
        result = await db.execute(sql`
          SELECT id, name, type, external_refs, created_at
          FROM canonical_entities
          WHERE type = ${typeFilter}
          ORDER BY name ASC
          LIMIT ${limitVal}
        `);
      } else if (nameQuery) {
        result = await db.execute(sql`
          SELECT id, name, type, external_refs, created_at
          FROM canonical_entities
          WHERE lower(name) LIKE ${"%" + nameQuery.toLowerCase() + "%"}
          ORDER BY name ASC
          LIMIT ${limitVal}
        `);
      } else {
        result = await db.execute(sql`
          SELECT id, name, type, external_refs, created_at
          FROM canonical_entities
          ORDER BY name ASC
          LIMIT ${limitVal}
        `);
      }

      res.json(result.rows);
    } catch (error) {
      console.error("Error listing entities:", error);
      res.status(500).json({ error: "Failed to list entities" });
    }
  });

  // GET /api/brain/entities/:entityId/episodes
  // Returns all episodes that mention a given canonical entity.
  // Key endpoint for cross-lecture / cross-episode connections.
  app.get("/api/brain/entities/:entityId/episodes", async (req, res) => {
    try {
      const { entityId } = req.params;

      const result = await db.execute(sql`
        SELECT DISTINCT
          e.id, e.title, e.source_type, e.transcript_status, e.duration,
          e.podcast_id, e.external_episode_id,
          MAX(el.confidence) as mention_confidence,
          COUNT(DISTINCT em.id) as mention_count
        FROM episodes e
        INNER JOIN transcript_segments ts ON ts.episode_id = e.id
        INNER JOIN entity_mentions em ON em.segment_id = ts.id
        INNER JOIN entity_links el ON el.mention_id = em.id
        WHERE el.canonical_id = ${entityId}
        GROUP BY e.id, e.title, e.source_type, e.transcript_status, e.duration,
                 e.podcast_id, e.external_episode_id
        ORDER BY mention_count DESC, e.title ASC
      `);

      res.json(result.rows);
    } catch (error) {
      console.error("Error getting entity episodes:", error);
      res.status(500).json({ error: "Failed to get entity episodes" });
    }
  });

  // GET /api/brain/entities/:entityId
  // Returns a single canonical entity with its episode list.
  app.get("/api/brain/entities/:entityId", async (req, res) => {
    try {
      const { entityId } = req.params;

      const entityResult = await db.execute(sql`
        SELECT id, name, type, external_refs, created_at
        FROM canonical_entities
        WHERE id = ${entityId}
      `);

      if (entityResult.rows.length === 0) {
        return res.status(404).json({ error: "Entity not found" });
      }

      const episodesResult = await db.execute(sql`
        SELECT DISTINCT
          e.id, e.title, e.source_type, e.transcript_status,
          MAX(el.confidence) as mention_confidence,
          COUNT(DISTINCT em.id) as mention_count
        FROM episodes e
        INNER JOIN transcript_segments ts ON ts.episode_id = e.id
        INNER JOIN entity_mentions em ON em.segment_id = ts.id
        INNER JOIN entity_links el ON el.mention_id = em.id
        WHERE el.canonical_id = ${entityId}
        GROUP BY e.id, e.title, e.source_type, e.transcript_status
        ORDER BY mention_count DESC
      `);

      res.json({
        entity: entityResult.rows[0],
        episodes: episodesResult.rows,
      });
    } catch (error) {
      console.error("Error getting entity:", error);
      res.status(500).json({ error: "Failed to get entity" });
    }
  });

  app.get("/api/brain/episodes/:episodeId/patterns", async (req, res) => {
    try {
      const episodeId = req.params.episodeId;
      const relations = await storage.getRelationsByEpisode(episodeId);
      res.json(relations);
    } catch (error) {
      console.error("Error getting episode patterns:", error);
      res.status(500).json({ error: "Failed to get episode patterns" });
    }
  });

  app.get("/api/brain/episodes/:episodeId/narrative", async (req, res) => {
    try {
      const episodeId = req.params.episodeId;
      const [chaptersResult, segmentsResult] = await Promise.all([
        db.execute(sql`
          SELECT id, title, summary, start_time, end_time, display_order, confidence
          FROM episode_chapters
          WHERE episode_id = ${episodeId}
          ORDER BY start_time ASC
        `),
        db.execute(sql`
          SELECT id, topic_category, sub_topic, intent, start_time, end_time,
            importance_score, novelty_score, clipability_score
          FROM episode_semantic_segments
          WHERE episode_id = ${episodeId}
          ORDER BY start_time ASC
        `),
      ]);
      res.json({
        chapters: chaptersResult.rows,
        segments: segmentsResult.rows,
      });
    } catch (error) {
      console.error("Error getting episode narrative:", error);
      res.status(500).json({ error: "Failed to get episode narrative" });
    }
  });

  app.get("/api/brain/episodes/:episodeId/transcript", async (req, res) => {
    try {
      const episodeId = req.params.episodeId;
      const result = await db.execute(sql`
        SELECT id, text, start_time, end_time, speaker, type
        FROM transcript_segments
        WHERE episode_id = ${episodeId}
        ORDER BY start_time ASC
      `);
      res.json(result.rows);
    } catch (error) {
      console.error("Error getting episode transcript:", error);
      res.status(500).json({ error: "Failed to get episode transcript" });
    }
  });

  // ============ 9. Episode Detail (Full Intelligence Payload) ============

  app.get("/api/brain/episodes/:episodeId", async (req, res) => {
    try {
      const episodeId = req.params.episodeId;
      const include = (req.query.include as string || "").split(",").filter(Boolean);
      const includeAll = include.length === 0;

      const episode = await storage.getEpisode(episodeId);
      if (!episode) return res.status(404).json({ error: "Episode not found" });

      const podcast = await storage.getPodcast(episode.podcastId);

      const sources = await storage.getEpisodeSourcesByEpisode(episodeId);
      const youtubeSource = sources.find((s: any) => s.platform === "youtube");
      const youtubeVideoId = youtubeSource?.sourceUrl?.match(/(?:v=|\/shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/)?.[1] || null;

      const payload: Record<string, any> = {
        id: episode.id,
        title: episode.title,
        publishedAt: episode.publishedAt,
        podcastId: episode.podcastId,
        podcastTitle: podcast?.title || null,
        duration: episode.duration,
        mediaUrl: episode.mediaUrl || youtubeSource?.sourceUrl || null,
        youtubeVideoId,
        sources: sources.map((s: any) => ({
          id: s.id,
          kind: s.kind,
          platform: s.platform,
          sourceUrl: s.sourceUrl,
          isCanonical: s.isCanonical,
        })),
      };

      const sections: Promise<void>[] = [];

      if (includeAll || include.includes("statements")) {
        sections.push(
          db.execute(sql`
            SELECT s.id, s.text, s.speaker, s.start_time, s.end_time,
              sc.claim_flag, sc.certainty, sc.polarity, sc.sentiment
            FROM statements s
            LEFT JOIN statement_classifications sc ON sc.statement_id = s.id
            WHERE s.episode_id = ${episodeId}
            ORDER BY s.start_time ASC NULLS LAST
          `).then(r => { payload.statements = r.rows; })
        );
      }

      if (includeAll || include.includes("entities")) {
        sections.push(
          db.execute(sql`
            SELECT DISTINCT ce.id, ce.name, ce.type, ce.external_refs,
              el.confidence as link_confidence
            FROM canonical_entities ce
            INNER JOIN entity_links el ON el.canonical_id = ce.id
            INNER JOIN entity_mentions em ON em.id = el.mention_id
            INNER JOIN transcript_segments ts ON ts.id = em.segment_id
            WHERE ts.episode_id = ${episodeId}
            ORDER BY ce.type, ce.name
          `).then(r => { payload.entities = r.rows; })
        );
      }

      if (includeAll || include.includes("speakers")) {
        sections.push(
          storage.getEpisodeSpeakers(episodeId).then(s => { payload.speakers = s; })
        );
      }

      if (includeAll || include.includes("contradictions")) {
        sections.push(
          db.execute(sql`
            SELECT sr.*, 
              s_a.text as statement_a_text, s_a.start_time as statement_a_start_time,
              s_b.text as statement_b_text, s_b.start_time as statement_b_start_time
            FROM statement_relations sr
            JOIN statements s_a ON sr.statement_a_id = s_a.id
            JOIN statements s_b ON sr.statement_b_id = s_b.id
            WHERE sr.episode_id = ${episodeId} AND sr.relation = 'contradicts'
            ORDER BY sr.confidence DESC
          `).then(r => { payload.contradictions = r.rows; })
        );
      }

      if (includeAll || include.includes("patterns")) {
        sections.push(
          storage.getRelationsByEpisode(episodeId).then(r => { payload.patterns = r; })
        );
      }

      if (includeAll || include.includes("narrative")) {
        sections.push(
          Promise.all([
            db.execute(sql`
              SELECT id, title, summary, start_time, end_time, display_order, confidence
              FROM episode_chapters WHERE episode_id = ${episodeId}
              ORDER BY start_time ASC
            `),
            db.execute(sql`
              SELECT id, topic_category, sub_topic, intent, start_time, end_time,
                importance_score, novelty_score, clipability_score
              FROM episode_semantic_segments WHERE episode_id = ${episodeId}
              ORDER BY start_time ASC
            `),
          ]).then(([ch, seg]) => {
            payload.narrative = { chapters: ch.rows, segments: seg.rows };
          })
        );
      }

      if (includeAll || include.includes("viral_moments")) {
        sections.push(
          storage.getViralMomentsByEpisode(episodeId).then((moments: any[]) => {
            payload.viralMoments = moments.map((m: any) => ({
              id: m.id,
              momentKind: m.momentKind,
              startTime: m.startTime,
              endTime: m.endTime,
              durationSeconds: m.endTime - m.startTime,
              text: m.text,
              viralityScore: m.viralityScore,
              hookReason: m.hookReason,
              suggestedTitle: m.suggestedTitle,
              pullQuote: m.pullQuote,
              contentType: m.contentType,
              topics: m.topics,
              entities: m.entities,
            }));
          })
        );
      }

      if (include.includes("transcript")) {
        sections.push(
          db.execute(sql`
            SELECT id, text, start_time, end_time, speaker, type
            FROM transcript_segments WHERE episode_id = ${episodeId}
            ORDER BY start_time ASC
          `).then(r => { payload.transcript = r.rows; })
        );
      }

      await Promise.all(sections);
      res.json(payload);
    } catch (error) {
      console.error("Error getting episode detail:", error);
      res.status(500).json({ error: "Failed to get episode detail" });
    }
  });

  // ============ 11. Viral Moments API (T002) ============

  app.get("/api/brain/episodes/:episodeId/viral-moments", async (req, res) => {
    try {
      const { episodeId } = req.params;
      const episode = await storage.getEpisode(episodeId);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }

      const sources = await storage.getEpisodeSourcesByEpisode(episodeId);
      const youtubeSource = sources.find((s: any) => s.platform === "youtube");
      const youtubeVideoId = youtubeSource?.sourceUrl?.match(/(?:v=|\/shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/)?.[1] || null;

      const moments = await storage.getViralMomentsByEpisode(episodeId);
      const mapped = moments.map((m: any) => ({
        id: m.id,
        episodeId: m.episodeId,
        momentKind: m.momentKind,
        startTime: m.startTime,
        endTime: m.endTime,
        durationSeconds: m.endTime - m.startTime,
        text: m.text,
        viralityScore: m.viralityScore,
        hookReason: m.hookReason,
        suggestedTitle: m.suggestedTitle,
        pullQuote: m.pullQuote,
        hookType: m.hookType,
        shareabilityFactors: m.shareabilityFactors,
        contentType: m.contentType,
        topics: m.topics,
        entities: m.entities,
        platform: m.platform,
        displayOrder: m.displayOrder,
        createdAt: m.createdAt,
      }));

      res.json({
        episodeId,
        episodeTitle: episode.title,
        youtubeVideoId,
        mediaUrl: episode.mediaUrl || youtubeSource?.sourceUrl || null,
        count: mapped.length,
        moments: mapped,
      });
    } catch (error) {
      console.error("Error getting viral moments:", error);
      res.status(500).json({ error: "Failed to get viral moments" });
    }
  });

  app.post("/api/brain/episodes/:episodeId/detect-viral-moments", async (req, res) => {
    try {
      const { episodeId } = req.params;
      const episode = await storage.getEpisode(episodeId);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }

      const sources = await storage.getEpisodeSourcesByEpisode(episodeId);
      const source = sources[0];
      if (!source) {
        return res.status(400).json({ error: "No episode source found. The episode needs a transcript first." });
      }

      const segments = await storage.getSegmentsByEpisode(episodeId);
      if (segments.length === 0) {
        return res.status(400).json({ error: "Episode has no transcript. Submit it for transcription first." });
      }

      const job = await storage.createJob({
        type: "detect_viral_moments",
        episodeSourceId: source.id,
        pipelineStage: "INTEL",
        result: { episodeId },
      });

      res.json({ jobId: job.id, status: "queued", episodeId });
    } catch (error) {
      console.error("Error queueing detect-viral-moments job:", error);
      res.status(500).json({ error: "Failed to queue viral moment detection" });
    }
  });

  // ============ 12. Enhanced Processing Status (T004) ============

  app.get("/api/brain/episodes/:episodeId/processing-status", async (req, res) => {
    try {
      const { episodeId } = req.params;
      const episode = await storage.getEpisode(episodeId);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }

      const podcast = await storage.getPodcast(episode.podcastId);

      const [segments, moments, jobs] = await Promise.all([
        storage.getSegmentsByEpisode(episodeId),
        storage.getViralMomentsByEpisode(episodeId),
        db.execute(sql`
          SELECT j.type, j.status, j.result, j.started_at, j.updated_at, j.last_error
          FROM jobs j
          JOIN episode_sources es ON j.episode_source_id = es.id
          WHERE es.episode_id = ${episodeId}
            AND j.type IN ('youtube_transcript', 'transcribe', 'detect_viral_moments', 'generate_key_moments')
          ORDER BY j.created_at DESC
        `),
      ]);

      const jobRows = jobs.rows as any[];

      const transcriptJob = jobRows.find((j: any) => j.type === "youtube_transcript" || j.type === "transcribe");
      const viralJob = jobRows.find((j: any) => j.type === "detect_viral_moments");

      let transcriptionStatus: string;
      let transcriptionProvider: string | null = null;
      if (segments.length > 0) {
        transcriptionStatus = "ready";
        if (transcriptJob?.result) {
          try {
            const result = typeof transcriptJob.result === "string" ? JSON.parse(transcriptJob.result) : transcriptJob.result;
            transcriptionProvider = result.provider || result.transcriptionTier || null;
          } catch {}
        }
      } else if (transcriptJob?.status === "failed") {
        transcriptionStatus = "failed";
      } else if (transcriptJob?.status === "processing") {
        transcriptionStatus = "processing";
      } else if (transcriptJob) {
        transcriptionStatus = "pending";
      } else {
        transcriptionStatus = "not_started";
      }

      let viralMomentsStatus: string;
      if (moments.length > 0) {
        viralMomentsStatus = "ready";
      } else if (viralJob?.status === "failed") {
        viralMomentsStatus = "failed";
      } else if (viralJob?.status === "processing") {
        viralMomentsStatus = "processing";
      } else if (viralJob) {
        viralMomentsStatus = "pending";
      } else {
        viralMomentsStatus = "not_started";
      }

      let overallStatus: string;
      if (transcriptionStatus === "failed" || viralMomentsStatus === "failed") {
        overallStatus = "failed";
      } else if (transcriptionStatus === "ready" && (viralMomentsStatus === "ready" || viralMomentsStatus === "not_started")) {
        overallStatus = "complete";
      } else if (transcriptionStatus === "not_started" && viralMomentsStatus === "not_started") {
        overallStatus = "not_started";
      } else {
        overallStatus = "processing";
      }

      res.json({
        episodeId,
        episodeTitle: episode.title,
        podcastTitle: podcast?.title ?? null,
        overallStatus,
        steps: {
          transcription: {
            status: transcriptionStatus,
            provider: transcriptionProvider,
            segmentCount: segments.length,
          },
          viralMoments: {
            status: viralMomentsStatus,
            count: moments.length,
          },
        },
        errors: [
          ...(transcriptJob?.status === "failed" ? [{ step: "transcription", error: transcriptJob.last_error }] : []),
          ...(viralJob?.status === "failed" ? [{ step: "viral_moments", error: viralJob.last_error }] : []),
        ],
      });
    } catch (error) {
      console.error("Error getting processing status:", error);
      res.status(500).json({ error: "Failed to get processing status" });
    }
  });

  // ============ 13. Semantic Search ============

  app.get("/api/brain/search", async (req, res) => {
    try {
      const q = req.query.q as string;
      if (!q || q.trim().length === 0) {
        return res.status(400).json({ error: "Query parameter 'q' is required" });
      }
      const limit = parseInt(req.query.limit as string) || 20;
      const episodeId = req.query.episodeId as string | undefined;
      const claimOnly = req.query.claimOnly === "true";

      const { semanticSearch } = await import("./search/semanticSearch");
      const filters: Record<string, any> = {};
      if (episodeId) filters.episodeIds = [episodeId];
      if (claimOnly) filters.claimOnly = true;

      const results = await semanticSearch({
        query: q,
        limit,
        filters: Object.keys(filters).length > 0 ? filters : undefined,
      });
      res.json(results);
    } catch (error) {
      console.error("Error in brain semantic search:", error);
      res.status(500).json({ error: "Failed to perform semantic search" });
    }
  });

  // ============ 14. Zoom Meeting Metadata ============

  app.get("/api/brain/zoom/meetings", async (req, res) => {
    try {
      const limitVal = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const offset = parseInt(req.query.offset as string) || 0;
      const company = req.query.company as string | undefined;
      const after = req.query.after as string | undefined;
      const before = req.query.before as string | undefined;

      const conditions = [];
      if (company) {
        conditions.push(ilike(zoomMeetings.companyName, `%${company}%`));
      }
      if (after) {
        conditions.push(gte(zoomMeetings.startTime, new Date(after)));
      }
      if (before) {
        conditions.push(lte(zoomMeetings.startTime, new Date(before)));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const meetings = await db
        .select({
          zoomMeetingId: zoomMeetings.zoomMeetingId,
          topic: zoomMeetings.topic,
          startTime: zoomMeetings.startTime,
          durationSec: zoomMeetings.durationSec,
          hostEmail: zoomMeetings.hostEmail,
          companyName: zoomMeetings.companyName,
          contactName: zoomMeetings.contactName,
          meetingDate: zoomMeetings.meetingDate,
          notes: zoomMeetings.notes,
          tags: zoomMeetings.tags,
        })
        .from(zoomMeetings)
        .where(whereClause)
        .orderBy(desc(zoomMeetings.startTime))
        .limit(limitVal)
        .offset(offset);

      const transcripts = await db
        .select({ zoomMeetingId: zoomTranscripts.zoomMeetingId })
        .from(zoomTranscripts);
      const transcriptSet = new Set(transcripts.map(t => t.zoomMeetingId));

      const zoomEpisodes = await db
        .select({ id: episodes.id, externalEpisodeId: episodes.externalEpisodeId })
        .from(episodes)
        .where(eq(episodes.sourceType, "zoom"));
      const episodeMap = new Map(zoomEpisodes.map(e => [e.externalEpisodeId, e.id]));

      const analyses = await db
        .select({ episodeId: episodeZoomAnalysis.episodeId })
        .from(episodeZoomAnalysis);
      const analyzedSet = new Set(analyses.map(a => a.episodeId));

      const result = meetings.map(m => {
        const episodeId = episodeMap.get(m.zoomMeetingId) || null;
        return {
          ...m,
          hasTranscript: transcriptSet.has(m.zoomMeetingId),
          episodeId,
          hasAnalysis: episodeId ? analyzedSet.has(episodeId) : false,
        };
      });

      res.json({ total: result.length, offset, limit: limitVal, meetings: result });
    } catch (error) {
      console.error("Error listing zoom meetings:", error);
      res.status(500).json({ error: "Failed to list zoom meetings" });
    }
  });

  app.get("/api/brain/zoom/meetings/:meetingId", async (req, res) => {
    try {
      const { meetingId } = req.params;

      const [meeting] = await db
        .select()
        .from(zoomMeetings)
        .where(eq(zoomMeetings.zoomMeetingId, meetingId))
        .limit(1);

      if (!meeting) {
        return res.status(404).json({ error: "Meeting not found" });
      }

      const [transcript] = await db
        .select({ id: zoomTranscripts.id, hasSpeakerLabels: zoomTranscripts.hasSpeakerLabels })
        .from(zoomTranscripts)
        .where(eq(zoomTranscripts.zoomMeetingId, meetingId))
        .limit(1);

      const [episode] = await db
        .select({ id: episodes.id, title: episodes.title })
        .from(episodes)
        .where(and(eq(episodes.sourceType, "zoom"), eq(episodes.externalEpisodeId, meetingId)))
        .limit(1);

      let analysisSummary = null;
      if (episode) {
        const [analysis] = await db
          .select({ analysisVersion: episodeZoomAnalysis.analysisVersion, createdAt: episodeZoomAnalysis.createdAt })
          .from(episodeZoomAnalysis)
          .where(eq(episodeZoomAnalysis.episodeId, episode.id))
          .limit(1);

        if (analysis) {
          const claimCounts = await db
            .select({ claimKind: claimInstances.claimKind, count: count() })
            .from(claimInstances)
            .where(eq(claimInstances.episodeId, episode.id))
            .groupBy(claimInstances.claimKind);

          analysisSummary = {
            analysisVersion: analysis.analysisVersion,
            analyzedAt: analysis.createdAt,
            claimCounts: Object.fromEntries(claimCounts.map(c => [c.claimKind, Number(c.count)])),
          };
        }
      }

      const { rawZoomJson, id, ...meetingData } = meeting;

      res.json({
        ...meetingData,
        hasTranscript: !!transcript,
        hasSpeakerLabels: transcript?.hasSpeakerLabels || false,
        episodeId: episode?.id || null,
        analysis: analysisSummary,
      });
    } catch (error) {
      console.error("Error getting zoom meeting:", error);
      res.status(500).json({ error: "Failed to get zoom meeting" });
    }
  });

  // ============ Import Zoom Recording from Shared Link ============

  app.post("/api/brain/zoom/import-shared-link", async (req: any, res) => {
    try {
      const { url, autoConvert = true, autoAnalyze = true } = req.body;

      if (!url || typeof url !== "string") {
        return res.status(400).json({ error: "url is required (shared Zoom recording link)" });
      }

      const zoomUrlPattern = /zoom\.[a-z]+\/rec\/(play|share)\//i;
      if (!zoomUrlPattern.test(url)) {
        return res.status(400).json({
          error: "Invalid URL format. Expected a Zoom shared recording link (e.g. https://zoom.us/rec/play/...)",
        });
      }

      console.log(`[BRAIN-API] Zoom shared link import: ${url}`);
      const result = await importFromSharedLink(url);

      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error || "Import failed" });
      }

      let episodeId: string | number | null = null;
      let analysisJobId: string | null = null;

      if (autoConvert && result.transcriptFound) {
        try {
          const convResult = await convertZoomMeetingToEpisode(result.meetingId);
          if (convResult.episodeId) {
            episodeId = convResult.episodeId;
            console.log(`[BRAIN-API] Converted to episode ${episodeId}`);

            if (autoAnalyze) {
              const [job] = await db
                .insert(jobs)
                .values({
                  type: "analyze_zoom_call",
                  status: "pending",
                  result: { episodeId },
                })
                .returning({ id: jobs.id });
              analysisJobId = job.id;
              console.log(`[BRAIN-API] Queued analysis job ${analysisJobId}`);
            }
          }
        } catch (convErr: any) {
          console.error(`[BRAIN-API] Auto-convert error: ${convErr.message}`);
        }
      }

      res.status(201).json({
        success: true,
        meetingId: result.meetingId,
        topic: result.topic,
        duration: result.duration,
        startTime: result.startTime,
        transcriptFound: result.transcriptFound,
        utteranceCount: result.utteranceCount,
        hasSpeakers: result.hasSpeakers,
        episodeId,
        analysisJobId,
      });
    } catch (error: any) {
      console.error("Error importing shared Zoom link:", error);
      res.status(500).json({ error: error.message || "Failed to import shared Zoom link" });
    }
  });

  // ============ CROSS-EPISODE SYNTHESIS ============

  app.post("/api/brain/episodes/synthesize", async (req: any, res) => {
    try {
      const { episodeIds, query, outputFormat = "structured" } = req.body;

      if (!episodeIds || !Array.isArray(episodeIds) || episodeIds.length < 2) {
        return res.status(400).json({ error: "episodeIds must be an array of at least 2 episode IDs" });
      }
      if (episodeIds.length > 50) {
        return res.status(400).json({ error: "Maximum 50 episodes per synthesis request" });
      }
      if (!query || typeof query !== "string" || query.trim().length < 5) {
        return res.status(400).json({ error: "query is required (minimum 5 characters)" });
      }

      console.log(`[BRAIN-API] Cross-episode synthesis: ${episodeIds.length} episodes, query: "${query.substring(0, 80)}"`);

      const { runCrossEpisodeSynthesis } = await import("./services/cross-episode-synthesis");

      const { synthesis, meta } = await runCrossEpisodeSynthesis(episodeIds, {
        query,
        outputFormat,
      });

      if (meta.episodesAnalyzed === 0) {
        return res.status(422).json({ error: "None of the specified episodes have transcripts ready" });
      }

      console.log(`[BRAIN-API] Synthesis complete: ${synthesis.themes.length} themes, ${synthesis.patterns.length} patterns`);

      res.json({
        synthesis,
        meta: {
          ...meta,
          query,
          outputFormat,
        },
      });
    } catch (error: any) {
      console.error("Error in cross-episode synthesis:", error);
      res.status(500).json({ error: error.message || "Synthesis failed" });
    }
  });

  // ============ CLIP RENDERING ============

  const VALID_CLIP_PLATFORMS = ["tiktok", "reels", "shorts"] as const;
  const VALID_CLIP_CAPTION_STYLES = ["highlight", "subtitle", "bold"] as const;
  const CAPTION_STYLE_MAP_BRAIN: Record<string, string> = {
    highlight: "karaoke",
    subtitle: "subtitle",
    bold: "bold",
  };

  // POST /api/brain/clips — queue a rendered clip job
  app.post("/api/brain/clips", async (req: any, res) => {
    try {
      const { momentId, platform, captionStyle, notifyEmail, adjustedStart, adjustedEnd } = req.body;

      if (!momentId || !platform || !captionStyle) {
        return res.status(400).json({ error: "momentId, platform, and captionStyle are required" });
      }
      if (!VALID_CLIP_PLATFORMS.includes(platform)) {
        return res.status(400).json({ error: `Invalid platform. Must be one of: ${VALID_CLIP_PLATFORMS.join(", ")}` });
      }
      if (!VALID_CLIP_CAPTION_STYLES.includes(captionStyle)) {
        return res.status(400).json({ error: `Invalid captionStyle. Must be one of: ${VALID_CLIP_CAPTION_STYLES.join(", ")}` });
      }

      const moment = await storage.getViralMoment(momentId);
      if (!moment) {
        return res.status(404).json({ error: "Viral moment not found" });
      }

      const sources = await storage.getEpisodeSourcesByEpisode(moment.episodeId);
      const youtubeSource = sources.find((s: any) => s.platform === "youtube" && s.sourceUrl);
      if (!youtubeSource) {
        return res.status(400).json({ error: "No YouTube source available for this episode" });
      }

      const internalCaptionType = CAPTION_STYLE_MAP_BRAIN[captionStyle] || "karaoke";
      const platformForOptimize = platform === "reels" ? "instagram" : platform === "shorts" ? "youtube" : "tiktok";

      await storage.updateViralMomentClipStatus(moment.id, "pending", null, null);
      if (moment.captionedPath) await storage.updateViralMomentCaptionedPath(moment.id, null as any);
      if (moment.optimizedPath) await storage.updateViralMomentOptimizedPath(moment.id, null as any, platformForOptimize);

      // Use the brain API key's id as the owner for this clip job
      const apiKeyId = req.brainApiKey?.id || "brain_api";

      const extractJob = await storage.createJob({
        type: "extract_clip",
        episodeSourceId: youtubeSource.id,
        pipelineStage: "INTEL",
        result: {
          viralMomentId: moment.id,
          userId: apiKeyId,
          captionType: internalCaptionType,
          adjustedStart: adjustedStart != null ? Math.floor(adjustedStart) : undefined,
          adjustedEnd: adjustedEnd != null ? Math.floor(adjustedEnd) : undefined,
          hookEnabled: true,
          addWatermark: false,
        },
      });

      const clipJob = await storage.createClipJob({
        userId: apiKeyId,
        momentId: moment.id,
        episodeId: moment.episodeId,
        platform,
        captionStyle,
        status: "queued",
        adjustedStart: adjustedStart != null ? Math.floor(adjustedStart) : undefined,
        adjustedEnd: adjustedEnd != null ? Math.floor(adjustedEnd) : undefined,
        internalJobId: extractJob.id,
        notifyEmail: notifyEmail || undefined,
      });

      console.log(`[BRAIN-CLIPS] Queued clip job=${clipJob.id} moment=${momentId} platform=${platform} caption=${captionStyle}`);

      res.status(201).json({
        jobId: clipJob.id,
        status: "queued",
        momentId,
        platform,
        captionStyle,
      });
    } catch (error) {
      console.error("Error queueing clip job:", error);
      res.status(500).json({ error: "Failed to queue clip job" });
    }
  });

  // GET /api/brain/clips/:jobId — poll clip job status + get download URL
  app.get("/api/brain/clips/:jobId", async (req: any, res) => {
    try {
      const clipJob = await storage.getClipJob(req.params.jobId);
      if (!clipJob) {
        return res.status(404).json({ error: "Clip job not found" });
      }

      // Complete with download URL already set
      if (clipJob.status === "complete" && clipJob.downloadUrl) {
        const url = clipJob.downloadUrl;
        const safeUrl = (url.startsWith("/tmp/") || url.startsWith("/home/"))
          ? `https://poddna.io/api/creator/clip-download/${clipJob.id}`
          : url;
        return res.json({ jobId: clipJob.id, status: "complete", downloadUrl: safeUrl });
      }

      if (clipJob.status === "failed") {
        return res.json({ jobId: clipJob.id, status: "failed", error: clipJob.error || "Processing failed" });
      }

      // Check the underlying moment for progress
      const moment = await storage.getViralMoment(clipJob.momentId);
      if (!moment) {
        await storage.updateClipJob(clipJob.id, { status: "failed", error: "Viral moment no longer exists" });
        return res.json({ jobId: clipJob.id, status: "failed", error: "Viral moment no longer exists" });
      }

      if (moment.clipStatus === "failed") {
        await storage.updateClipJob(clipJob.id, { status: "failed", error: moment.clipError || "Extraction failed" });
        return res.json({ jobId: clipJob.id, status: "failed", error: moment.clipError || "Extraction failed" });
      }

      if (!moment.videoPath || moment.clipStatus !== "ready") {
        await storage.updateClipJob(clipJob.id, { status: "extracting" });
        return res.json({ jobId: clipJob.id, status: "extracting" });
      }

      const finalPath = moment.captionedPath;
      if (!finalPath) {
        const internalCaptionType = CAPTION_STYLE_MAP_BRAIN[clipJob.captionStyle] || "karaoke";
        const existingCaptionJob = await db.execute(sql`
          SELECT id FROM jobs
          WHERE type = 'burn_captions'
            AND status IN ('pending', 'processing')
            AND result::text LIKE ${'%' + moment.id + '%'}
          LIMIT 1
        `);
        if (existingCaptionJob.rows.length === 0) {
          const episodeSources = await storage.getEpisodeSourcesByEpisode(moment.episodeId);
          const ytSource = episodeSources.find((s: any) => s.platform === "youtube");
          await storage.createJob({
            type: "burn_captions",
            episodeSourceId: ytSource?.id || null,
            pipelineStage: "INTEL",
            result: { viralMomentId: moment.id, captionType: internalCaptionType },
          });
        }
        await storage.updateClipJob(clipJob.id, { status: "captioning" });
        return res.json({ jobId: clipJob.id, status: "captioning" });
      }

      // Upload to object storage and mark complete
      let downloadUrl: string;
      if (finalPath.startsWith("https://")) {
        downloadUrl = finalPath;
      } else {
        try {
          const fsPromises = await import("fs/promises");
          const privateDir = process.env.PRIVATE_OBJECT_DIR;
          if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR not configured");
          const fileBuffer = await fsPromises.readFile(finalPath);
          const objectPath = `${privateDir}/clips/${clipJob.id}.mp4`;
          const parts = objectPath.startsWith("/") ? objectPath.slice(1).split("/") : objectPath.split("/");
          const bucketName = parts[0];
          const objectName = parts.slice(1).join("/");
          const bucket = objectStorageClient.bucket(bucketName);
          const file = bucket.file(objectName);
          await file.save(fileBuffer, { contentType: "video/mp4" });
          const [signedUrl] = await file.getSignedUrl({
            version: "v4",
            action: "read",
            expires: Date.now() + 24 * 60 * 60 * 1000,
          });
          downloadUrl = signedUrl;
        } catch {
          downloadUrl = `https://poddna.io/api/creator/clip-download/${clipJob.id}`;
        }
      }

      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await storage.updateClipJob(clipJob.id, {
        status: "complete",
        downloadUrl: downloadUrl.startsWith("https://poddna.io/api/") ? finalPath : downloadUrl,
        downloadUrlExpiresAt: expiresAt,
        completedAt: new Date(),
      });

      if (clipJob.notifyEmail && !clipJob.notifySent) {
        const episode = await storage.getEpisode(clipJob.episodeId);
        sendClipReadyEmail(
          clipJob.notifyEmail,
          episode?.title || "Your episode",
          moment.suggestedTitle || "Viral moment",
          clipJob.platform,
          downloadUrl,
          expiresAt
        ).catch(() => {});
        await storage.updateClipJob(clipJob.id, { notifySent: true });
      }

      return res.json({ jobId: clipJob.id, status: "complete", downloadUrl, expiresAt });
    } catch (error) {
      console.error("Error checking clip status:", error);
      res.status(500).json({ error: "Failed to check clip status" });
    }
  });
}
