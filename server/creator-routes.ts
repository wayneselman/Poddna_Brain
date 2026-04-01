import express from "express";
import type { Express, Request, Response } from "express";
import { storage } from "./storage";
import { optionalAuth } from "./replitAuth";
import { getUncachableStripeClient, getStripePublishableKey } from "./stripeClient";
import { objectStorageClient } from "./objectStorage";
import { sendClipReadyEmail } from "./email";
import { db } from "./db";
import { sql } from "drizzle-orm";
import * as fsPromises from "fs/promises";
import * as path from "path";

const YOUTUBE_VIDEO_ID_REGEX = /(?:v=|\/shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

const SHOW_PROFILE_MILESTONES = [5, 10, 15, 20, 30, 50, 75, 100];

async function checkShowProfileMilestone(podcastId: string): Promise<void> {
  try {
    const result = await db.execute(sql`
      SELECT COUNT(DISTINCT e.id) as cnt
      FROM episodes e
      JOIN statements s ON s.episode_id = e.id
      WHERE e.podcast_id = ${podcastId}
    `);
    const episodeCount = parseInt(result.rows[0]?.cnt as string) || 0;

    if (!SHOW_PROFILE_MILESTONES.includes(episodeCount)) return;

    const existingJobs = await db.execute(sql`
      SELECT id FROM jobs
      WHERE type = 'compute_show_profile'
        AND status IN ('pending', 'running')
        AND result::text LIKE ${'%' + podcastId + '%'}
      LIMIT 1
    `);
    if (existingJobs.rows.length > 0) return;

    await storage.createJob({
      type: "compute_show_profile",
      result: { podcastId },
      status: "pending",
    });
    console.log(`[SHOW-PROFILE] Triggered compute_show_profile for podcast ${podcastId} at milestone ${episodeCount} episodes`);
  } catch (err) {
    console.error(`[SHOW-PROFILE] Error checking milestone for podcast ${podcastId}:`, err);
  }
}

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const MAX_ANALYSES_PER_DAY = 3;

const CAPTION_STYLE_MAP: Record<string, string> = {
  highlight: "karaoke",
  subtitle: "subtitle",
  bold: "bold",
};

const VALID_PLATFORMS = ["tiktok", "reels", "shorts"] as const;
const VALID_CAPTION_STYLES = ["highlight", "subtitle", "bold"] as const;

function getClientIp(req: Request): string {
  return (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "unknown";
}

function checkRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    return { allowed: true, remaining: MAX_ANALYSES_PER_DAY - 1 };
  }
  if (entry.count >= MAX_ANALYSES_PER_DAY) {
    return { allowed: false, remaining: 0 };
  }
  return { allowed: true, remaining: MAX_ANALYSES_PER_DAY - entry.count - 1 };
}

function recordAnalysis(ip: string): void {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  const resetAt = now + 24 * 60 * 60 * 1000;
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt });
  } else {
    entry.count++;
  }
}

export function registerCreatorRoutes(app: Express): void {

  app.post("/api/creator/validate", async (req: Request, res: Response) => {
    try {
      const { youtubeUrl } = req.body;
      if (!youtubeUrl) {
        return res.status(400).json({ valid: false, error: "youtubeUrl is required" });
      }

      const videoIdMatch = youtubeUrl.match(YOUTUBE_VIDEO_ID_REGEX);
      if (!videoIdMatch) {
        return res.status(400).json({ valid: false, error: "Could not extract video ID from URL. Please provide a valid YouTube URL." });
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
        console.log("[CREATOR] youtubei.js failed, using oEmbed fallback:", ytError.message?.slice(0, 100));
        if (ytError.message?.includes("age")) {
          return res.json({ valid: false, error: "This video is age-restricted and cannot be processed." });
        }
        if (ytError.message?.includes("private") || ytError.message?.includes("unavailable")) {
          return res.json({ valid: false, error: "This video is private or unavailable." });
        }

        try {
          const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${youtubeVideoId}&format=json`;
          const oembedRes = await fetch(oembedUrl);
          if (!oembedRes.ok) {
            return res.json({ valid: false, error: "Could not access this video. It may be private, deleted, or region-restricted." });
          }
          const oembedData = await oembedRes.json();
          title = oembedData.title || "Unknown";
          hasCaptions = true;
          usedFallback = true;
        } catch {
          return res.json({ valid: false, error: "Could not access this video. It may be private, deleted, or region-restricted." });
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
        const existingMoments = await storage.getViralMomentsByEpisode(existingSource.episodeId);
        if (existingMoments.length > 0) {
          alreadyProcessed = true;
          existingEpisodeId = existingSource.episodeId;
        }
      }

      const estimatedMinutes = usedFallback ? 5 : Math.max(2, Math.round(durationSeconds / 60 * 0.3));

      res.json({
        valid: true,
        youtubeVideoId,
        title,
        durationSeconds,
        durationFormatted: durationSeconds > 0
          ? `${Math.floor(durationSeconds / 60)}:${String(durationSeconds % 60).padStart(2, "0")}`
          : "",
        thumbnail,
        hasCaptions,
        alreadyProcessed,
        existingEpisodeId,
        estimatedProcessingMinutes: estimatedMinutes,
      });
    } catch (error) {
      console.error("[CREATOR] Validate error:", error);
      res.status(500).json({ valid: false, error: "Validation failed. Please try again." });
    }
  });

  app.post("/api/creator/analyze", async (req: Request, res: Response) => {
    try {
      const { youtubeUrl, title: providedTitle } = req.body;
      if (!youtubeUrl) {
        return res.status(400).json({ error: "youtubeUrl is required" });
      }

      const ip = getClientIp(req);
      const { allowed, remaining } = checkRateLimit(ip);

      const videoIdMatch = youtubeUrl.match(YOUTUBE_VIDEO_ID_REGEX);
      if (!videoIdMatch) {
        return res.status(400).json({ error: "Invalid YouTube URL" });
      }
      const youtubeVideoId = videoIdMatch[1];

      const existingSource = await storage.getEpisodeSourceByYouTubeId(youtubeVideoId);
      if (existingSource) {
        const episodeId = existingSource.episodeId;
        const moments = await storage.getViralMomentsByEpisode(episodeId);
        if (moments.length > 0) {
          return res.json({
            id: "existing",
            status: "complete",
            episodeId,
            alreadyProcessed: true,
            remaining,
          });
        }
      }

      if (!allowed) {
        return res.status(429).json({
          error: "You've reached the free daily limit of 3 analyses. Upgrade to Creator tier for unlimited access.",
          remaining: 0,
        });
      }

      const request = await storage.createIngestionRequest({
        type: "youtube_url",
        sourceUrl: youtubeUrl,
        priority: "normal",
        metadata: {
          analysisTypes: ["viral_moments"],
          sourceUrl: youtubeUrl,
          creatorFlow: true,
        },
      });

      const existingSourceForIngest = await storage.getEpisodeSourceByYouTubeId(youtubeVideoId);
      if (existingSourceForIngest) {
        const episodeId = existingSourceForIngest.episodeId;

        if (providedTitle && providedTitle !== "Unknown") {
          try {
            const ep = await storage.getEpisode(episodeId);
            if (ep && (!ep.title || ep.title === "Unknown")) {
              await storage.updateEpisode(episodeId, { title: providedTitle });
              console.log(`[CREATOR] Updated episode title from "Unknown" to "${providedTitle}"`);
            }
          } catch {}
        }

        await storage.updateIngestionRequest(request.id, {
          episodeId,
          status: "processing",
          processingSteps: [{ step: "episode_lookup", status: "complete", completedAt: new Date().toISOString() }],
        });

        const existingSegments = await storage.getSegmentsByEpisode(episodeId);
        if (existingSegments.length > 0) {
          const job = await storage.createJob({
            type: "detect_viral_moments",
            episodeSourceId: existingSourceForIngest.id,
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
          const job = await storage.createJob({
            type: "youtube_transcript",
            episodeSourceId: existingSourceForIngest.id,
            pipelineStage: "INGEST",
            result: { episodeId, ingestionRequestId: request.id, analysisTypes: ["viral_moments"] },
          });
          await storage.updateIngestionRequest(request.id, {
            jobIds: [job.id],
            processingSteps: [
              { step: "episode_lookup", status: "complete", completedAt: new Date().toISOString() },
              { step: "transcript", status: "processing" },
            ],
          });
        }
      } else {
        const { nanoid } = await import("nanoid");
        const episodeId = nanoid();
        const podcastId = nanoid();

        const podcast = await storage.createPodcast({
          id: podcastId,
          title: "Creator Upload",
          host: "Creator",
          feedUrl: youtubeUrl,
        });

        const episode = await storage.createEpisode({
          id: episodeId,
          podcastId: podcastId,
          title: providedTitle || "Processing...",
          mediaUrl: youtubeUrl,
          publishedAt: new Date(),
          duration: 0,
          type: "video",
        });

        const sourceId = nanoid();
        await storage.createEpisodeSource({
          id: sourceId,
          episodeId,
          kind: "video",
          platform: "youtube",
          sourceUrl: youtubeUrl,
          isCanonical: true,
        });

        const job = await storage.createJob({
          type: "youtube_transcript",
          episodeSourceId: sourceId,
          pipelineStage: "INGEST",
          result: { episodeId, ingestionRequestId: request.id, analysisTypes: ["viral_moments"] },
        });

        await storage.updateIngestionRequest(request.id, {
          episodeId,
          jobIds: [job.id],
          status: "processing",
          processingSteps: [
            { step: "episode_created", status: "complete", completedAt: new Date().toISOString() },
            { step: "transcript", status: "processing" },
          ],
        });
      }

      recordAnalysis(ip);

      res.status(201).json({
        id: request.id,
        status: "processing",
        remaining: remaining,
      });
    } catch (error) {
      console.error("[CREATOR] Analyze error:", error);
      res.status(500).json({ error: "Failed to start analysis. Please try again." });
    }
  });

  app.get("/api/creator/status/:id", async (req: Request, res: Response) => {
    try {
      const request = await storage.getIngestionRequest(req.params.id);
      if (!request) {
        return res.status(404).json({ error: "Analysis not found" });
      }

      const meta = request.metadata as Record<string, any> || {};
      const response: Record<string, any> = {
        id: request.id,
        status: request.status,
        episodeId: request.episodeId,
        processingSteps: request.processingSteps || [],
        createdAt: request.createdAt,
      };

      if (request.episodeId) {
        const episode = await storage.getEpisode(request.episodeId);
        if (episode) {
          response.episodeTitle = episode.title;
          response.episodeDuration = episode.duration;
        }

        const segments = await storage.getSegmentsByEpisode(request.episodeId);
        const moments = await storage.getViralMomentsByEpisode(request.episodeId);
        const wantsViral = Array.isArray(meta.analysisTypes) && meta.analysisTypes.includes("viral_moments");

        response.progress = {
          transcriptReady: segments.length > 0,
          transcriptSegments: segments.length,
          viralMomentsReady: moments.length > 0,
          viralMomentsCount: moments.length,
        };

        if (segments.length > 0 && wantsViral && moments.length > 0 && request.status !== "complete") {
          await storage.updateIngestionRequest(request.id, {
            status: "complete",
            completedAt: new Date(),
            processingSteps: [
              { step: "transcript", status: "complete", completedAt: new Date().toISOString() },
              { step: "viral_moments", status: "complete", completedAt: new Date().toISOString(), count: moments.length },
            ],
          });
          response.status = "complete";

          if (episode?.podcastId) {
            checkShowProfileMilestone(episode.podcastId);
          }
        } else if (segments.length > 0 && !wantsViral && request.status !== "complete") {
          await storage.updateIngestionRequest(request.id, {
            status: "complete",
            completedAt: new Date(),
          });
          response.status = "complete";
        }
      }

      res.json(response);
    } catch (error) {
      console.error("[CREATOR] Status error:", error);
      res.status(500).json({ error: "Failed to get status" });
    }
  });

  app.get("/api/creator/results/:episodeId", async (req: Request, res: Response) => {
    try {
      const { episodeId } = req.params;
      const episode = await storage.getEpisode(episodeId);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }

      const sources = await storage.getEpisodeSourcesByEpisode(episodeId);
      const youtubeSource = sources.find((s: any) => s.platform === "youtube");
      const youtubeVideoId = youtubeSource?.sourceUrl?.match(YOUTUBE_VIDEO_ID_REGEX)?.[1] || null;

      const allMoments = await storage.getViralMomentsByEpisode(episodeId);
      const sorted = [...allMoments].sort((a: any, b: any) => (b.viralityScore || 0) - (a.viralityScore || 0));
      const dedupedMoments: typeof sorted = [];
      for (const m of sorted) {
        const overlaps = dedupedMoments.some((kept: any) => {
          const overlapStart = Math.max(m.startTime, kept.startTime);
          const overlapEnd = Math.min(m.endTime, kept.endTime);
          if (overlapEnd <= overlapStart) return false;
          const overlapDur = overlapEnd - overlapStart;
          const shorterDur = Math.min(m.endTime - m.startTime, kept.endTime - kept.startTime);
          return overlapDur / shorterDur > 0.5;
        });
        if (!overlaps) dedupedMoments.push(m);
      }
      const mapped = dedupedMoments.map((m: any) => ({
        id: m.id,
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
        platform: m.platform,
        displayOrder: m.displayOrder,
      }));

      const episodeTitle = episode.title;

      res.json({
        episodeId,
        episodeTitle,
        duration: episode.duration,
        youtubeVideoId,
        mediaUrl: episode.mediaUrl || youtubeSource?.sourceUrl || null,
        count: mapped.length,
        moments: mapped,
      });
    } catch (error) {
      console.error("[CREATOR] Results error:", error);
      res.status(500).json({ error: "Failed to get results" });
    }
  });

  app.post("/api/creator/capture-email", async (req: Request, res: Response) => {
    try {
      const { email, episodeId, ingestionId } = req.body;
      if (!email || typeof email !== "string") {
        return res.status(400).json({ error: "Email is required" });
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: "Please enter a valid email address" });
      }

      const existing = await storage.getCreatorLeadsByEmail(email.toLowerCase().trim());
      const alreadyCaptured = existing.some(
        (l) => l.episodeId === (episodeId || null) && l.ingestionId === (ingestionId || null)
      );

      if (!alreadyCaptured) {
        await storage.createCreatorLead({
          email: email.toLowerCase().trim(),
          episodeId: episodeId || null,
          ingestionId: ingestionId || null,
          source: "processing_page",
        });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("[CREATOR] Email capture error:", error);
      res.status(500).json({ error: "Failed to save email" });
    }
  });

  const FREE_CLIP_LIMIT = 3;

  app.get("/api/creator/auth/user", optionalAuth, async (req: any, res: Response) => {
    try {
      if (!req.user) {
        return res.json({ authenticated: false });
      }
      const user = await storage.getUser(req.user.claims?.sub || req.user.id);
      if (!user) {
        return res.json({ authenticated: false });
      }
      const isAdmin = user.role === "admin";
      const effectiveTier = isAdmin ? "creator" : user.subscriptionTier;
      const isPaidOrAdmin = isAdmin || effectiveTier === "creator" || effectiveTier === "pro";
      res.json({
        authenticated: true,
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        subscriptionTier: effectiveTier,
        clipsDownloaded: user.clipsDownloaded,
        clipsRemaining: isPaidOrAdmin ? null : Math.max(0, FREE_CLIP_LIMIT - (user.clipsDownloaded || 0)),
        stripeCustomerId: user.stripeCustomerId,
      });
    } catch (error) {
      console.error("[CREATOR] Auth user error:", error);
      res.json({ authenticated: false });
    }
  });

  app.get("/api/creator/stripe-key", async (_req: Request, res: Response) => {
    try {
      const key = await getStripePublishableKey();
      res.json({ publishableKey: key });
    } catch (error) {
      console.error("[CREATOR] Stripe key error:", error);
      res.status(500).json({ error: "Failed to get Stripe key" });
    }
  });

  app.post("/api/creator/checkout", optionalAuth, async (req: any, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Login required to subscribe" });
      }
      const userId = req.user.claims?.sub || req.user.id;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }

      const stripe = await getUncachableStripeClient();
      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email || undefined,
          metadata: { userId: user.id },
        });
        customerId = customer.id;
        await storage.updateUserStripeFields(user.id, { stripeCustomerId: customerId });
      }

      const products = await stripe.products.search({ query: "name:'Creator Plan'" });
      let priceId: string | null = null;
      if (products.data.length > 0) {
        const prices = await stripe.prices.list({ product: products.data[0].id, active: true });
        if (prices.data.length > 0) {
          priceId = prices.data[0].id;
        }
      }

      if (!priceId) {
        return res.status(500).json({ error: "Creator plan not configured. Please contact support." });
      }

      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ["card"],
        line_items: [{ price: priceId, quantity: 1 }],
        mode: "subscription",
        success_url: `${baseUrl}/creator/dashboard?checkout=success`,
        cancel_url: `${baseUrl}/creator`,
        metadata: { userId: user.id },
      });

      res.json({ url: session.url });
    } catch (error) {
      console.error("[CREATOR] Checkout error:", error);
      res.status(500).json({ error: "Failed to create checkout session" });
    }
  });

  app.post("/api/creator/portal", optionalAuth, async (req: any, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Login required" });
      }
      const userId = req.user.claims?.sub || req.user.id;
      const user = await storage.getUser(userId);
      if (!user?.stripeCustomerId) {
        return res.status(400).json({ error: "No subscription found" });
      }

      const stripe = await getUncachableStripeClient();
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const session = await stripe.billingPortal.sessions.create({
        customer: user.stripeCustomerId,
        return_url: `${baseUrl}/creator/dashboard`,
      });
      res.json({ url: session.url });
    } catch (error) {
      console.error("[CREATOR] Portal error:", error);
      res.status(500).json({ error: "Failed to create portal session" });
    }
  });

  app.post("/api/creator/track-download", optionalAuth, async (req: any, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Login required to download clips" });
      }
      const userId = req.user.claims?.sub || req.user.id;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }

      const isAdmin = user.role === "admin";
      const isPaid = isAdmin || user.subscriptionTier === "creator" || user.subscriptionTier === "pro";
      if (!isPaid && (user.clipsDownloaded || 0) >= FREE_CLIP_LIMIT) {
        return res.status(403).json({
          error: "Free clip limit reached. Upgrade to Creator plan for unlimited downloads.",
          clipsDownloaded: user.clipsDownloaded,
          clipsRemaining: 0,
          requiresUpgrade: true,
        });
      }

      const { youtubeVideoId, startTime, momentId } = req.body;

      const newCount = await storage.incrementClipsDownloaded(userId);
      const clipsRemaining = isPaid ? null : Math.max(0, FREE_CLIP_LIMIT - newCount);

      if (isPaid && momentId) {
        const downloadUrl = youtubeVideoId && startTime != null
          ? `https://youtu.be/${youtubeVideoId}?t=${Math.floor(startTime)}`
          : undefined;
        res.json({
          success: true,
          type: "creator_download",
          downloadUrl,
          clipsDownloaded: newCount,
          clipsRemaining,
        });
      } else {
        const downloadUrl = youtubeVideoId && startTime != null
          ? `https://youtu.be/${youtubeVideoId}?t=${Math.floor(startTime)}`
          : undefined;
        res.json({
          success: true,
          type: "youtube_link",
          downloadUrl,
          clipsDownloaded: newCount,
          clipsRemaining,
        });
      }
    } catch (error) {
      console.error("[CREATOR] Track download error:", error);
      res.status(500).json({ error: "Failed to track download" });
    }
  });

  app.post("/api/creator/track-episode", optionalAuth, async (req: any, res: Response) => {
    try {
      if (!req.user) {
        return res.json({ tracked: false });
      }
      const userId = req.user.claims?.sub || req.user.id;
      const { episodeId, youtubeVideoId, title, thumbnail, viralMomentCount } = req.body;
      if (!episodeId) {
        return res.status(400).json({ error: "episodeId required" });
      }

      const existing = await storage.getCreatorProcessedEpisodeByUserAndEpisode(userId, episodeId);
      if (existing) {
        return res.json({ tracked: true, alreadyExists: true });
      }

      await storage.createCreatorProcessedEpisode({
        userId,
        episodeId,
        youtubeVideoId: youtubeVideoId || null,
        title: title || null,
        thumbnail: thumbnail || null,
        viralMomentCount: viralMomentCount || 0,
      });
      res.json({ tracked: true });
    } catch (error) {
      console.error("[CREATOR] Track episode error:", error);
      res.status(500).json({ error: "Failed to track episode" });
    }
  });

  app.get("/api/creator/dashboard-data", optionalAuth, async (req: any, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Login required" });
      }
      const userId = req.user.claims?.sub || req.user.id;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }

      const rawEpisodes = await storage.getCreatorProcessedEpisodes(userId);
      const isAdmin = user.role === "admin";
      const effectiveTier = isAdmin ? "creator" : user.subscriptionTier;
      const isPaidOrAdmin = isAdmin || effectiveTier === "creator" || effectiveTier === "pro";

      const episodeIds = rawEpisodes.map((cpe: any) => cpe.episodeId).filter(Boolean) as string[];
      const clipJobs = await storage.getClipJobsByUser(userId, 10);
      const clipEpisodeIds = clipJobs.map((cj: any) => cj.episodeId).filter(Boolean) as string[];
      const clipMomentIds = clipJobs.map((cj: any) => cj.momentId).filter(Boolean) as string[];

      const allEpisodeIds = Array.from(new Set([...episodeIds, ...clipEpisodeIds]));

      const [availableTags, fullEpisodesArr, momentCounts, clipMomentsArr] = await Promise.all([
        storage.getDistinctTags(userId),
        storage.getEpisodesByIds(allEpisodeIds),
        storage.getViralMomentCountsByEpisodeIds(episodeIds),
        storage.getViralMomentsByIds(clipMomentIds),
      ]);

      const episodeMap = new Map(fullEpisodesArr.map(e => [e.id, e]));
      const momentMap = new Map(clipMomentsArr.map(m => [m.id, m]));

      const podcastEpisodeCounts: Record<string, number> = {};
      const podcastIdSet = new Set<string>();

      const episodes = rawEpisodes.map((cpe: any) => {
        const fullEpisode = cpe.episodeId ? episodeMap.get(cpe.episodeId) : undefined;
        const liveTitle = fullEpisode?.title && fullEpisode.title !== "Unknown" ? fullEpisode.title : (cpe.title || "Unknown");
        const liveThumbnail = (fullEpisode as any)?.thumbnailUrl || cpe.thumbnail;
        const liveMomentCount = cpe.episodeId ? (momentCounts[cpe.episodeId] || cpe.viralMomentCount || 0) : (cpe.viralMomentCount || 0);

        if (fullEpisode?.podcastId) {
          podcastIdSet.add(fullEpisode.podcastId);
          podcastEpisodeCounts[fullEpisode.podcastId] = (podcastEpisodeCounts[fullEpisode.podcastId] || 0) + 1;
        }

        return {
          ...cpe,
          title: liveTitle,
          thumbnail: liveThumbnail,
          viralMomentCount: liveMomentCount,
        };
      });

      const enrichedClips = clipJobs.map((cj: any) => {
        const episode = episodeMap.get(cj.episodeId);
        const moment = momentMap.get(cj.momentId);
        const isExpired = cj.downloadUrlExpiresAt && new Date() > cj.downloadUrlExpiresAt;
        return {
          id: cj.id,
          momentId: cj.momentId,
          episodeId: cj.episodeId,
          platform: cj.platform,
          captionStyle: cj.captionStyle,
          status: isExpired && cj.status === "complete" ? "expired" : cj.status,
          downloadUrl: isExpired ? null : (cj.downloadUrl?.startsWith("/tmp/") || cj.downloadUrl?.startsWith("/home/") ? `/api/creator/clip-download/${cj.id}` : cj.downloadUrl),
          downloadUrlExpiresAt: cj.downloadUrlExpiresAt,
          createdAt: cj.createdAt,
          completedAt: cj.completedAt,
          error: cj.error,
          episodeTitle: episode?.title || null,
          momentTitle: moment?.suggestedTitle || null,
        };
      });

      const podcastIds = Array.from(podcastIdSet);
      const showIntelligenceAvailable = Object.values(podcastEpisodeCounts).some(c => c >= 5);

      let showProfiles: any[] = [];
      if (podcastIds.length > 0) {
        const podcastDetailPromises = podcastIds.map(id => storage.getPodcast(id));
        const [allProfiles, ...podcastDetails] = await Promise.all([
          storage.getShowProfilesForPodcasts(podcastIds),
          ...podcastDetailPromises,
        ]);
        const podcastMap = new Map(podcastDetails.filter(Boolean).map(p => [p!.id, p!]));

        const readyProfiles = allProfiles.filter((p: any) => p.episodeCount >= 5 && p.status === "ready");
        showProfiles = readyProfiles.map((profile: any) => {
          const podcast = podcastMap.get(profile.podcastId);
          return {
            ...profile,
            podcastTitle: podcast?.title || "Unknown Podcast",
            podcastArtworkUrl: podcast?.artworkUrl || null,
          };
        });
      }

      res.json({
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          subscriptionTier: effectiveTier,
          clipsDownloaded: user.clipsDownloaded,
          clipsRemaining: isPaidOrAdmin ? null : Math.max(0, FREE_CLIP_LIMIT - (user.clipsDownloaded || 0)),
        },
        episodes,
        availableTags,
        recentClips: enrichedClips,
        showIntelligenceAvailable,
        episodeCountsByPodcast: podcastEpisodeCounts,
        showProfiles,
      });
    } catch (error) {
      console.error("[CREATOR] Dashboard data error:", error);
      res.status(500).json({ error: "Failed to load dashboard" });
    }
  });

  app.delete("/api/creator/episodes/:id", optionalAuth, async (req: any, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Login required" });
      }
      const userId = req.user.claims?.sub || req.user.id;
      const episodeId = req.params.id;
      if (!episodeId) {
        return res.status(400).json({ error: "Episode ID required" });
      }
      const deleted = await storage.deleteCreatorProcessedEpisode(episodeId, userId);
      if (!deleted) {
        return res.status(404).json({ error: "Episode not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("[CREATOR] Delete episode error:", error);
      res.status(500).json({ error: "Failed to delete episode" });
    }
  });

  app.delete("/api/creator/clips/:id", optionalAuth, async (req: any, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Login required" });
      }
      const userId = req.user.claims?.sub || req.user.id;
      const clipId = req.params.id;
      if (!clipId) {
        return res.status(400).json({ error: "Clip ID required" });
      }
      const deleted = await storage.deleteClipJob(clipId, userId);
      if (!deleted) {
        return res.status(404).json({ error: "Clip not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("[CREATOR] Delete clip error:", error);
      res.status(500).json({ error: "Failed to delete clip" });
    }
  });

  app.patch("/api/creator/episodes/:id/tags", optionalAuth, async (req: any, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Login required" });
      }
      const userId = req.user.claims?.sub || req.user.id;
      const episodeId = req.params.id;
      if (!episodeId) {
        return res.status(400).json({ error: "Episode ID required" });
      }

      let { tags } = req.body;
      if (!Array.isArray(tags)) {
        return res.status(400).json({ error: "tags must be an array" });
      }

      tags = tags
        .map((t: any) => String(t).toLowerCase().trim())
        .filter((t: string) => t.length > 0 && t.length <= 30);
      tags = [...new Set(tags)].slice(0, 10);

      const updated = await storage.updateEpisodeTags(episodeId, userId, tags);
      if (!updated) {
        return res.status(404).json({ error: "Episode not found" });
      }
      res.json({ success: true, tags });
    } catch (error) {
      console.error("[CREATOR] Update episode tags error:", error);
      res.status(500).json({ error: "Failed to update tags" });
    }
  });

  app.get("/api/creator/tags", optionalAuth, async (req: any, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Login required" });
      }
      const userId = req.user.claims?.sub || req.user.id;
      const tags = await storage.getDistinctTags(userId);
      res.json({ tags });
    } catch (error) {
      console.error("[CREATOR] Get tags error:", error);
      res.status(500).json({ error: "Failed to get tags" });
    }
  });

  app.post("/api/creator/compute-show-profile", optionalAuth, async (req: any, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Login required" });
      }
      const userId = req.user.claims?.sub || req.user.id;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }

      const isAdmin = user.role === "admin";
      const isPaid = isAdmin || user.subscriptionTier === "creator" || user.subscriptionTier === "pro";
      if (!isPaid) {
        return res.status(403).json({ error: "Creator plan required" });
      }

      const { podcastId, tag } = req.body;
      if (!podcastId) {
        return res.status(400).json({ error: "podcastId is required" });
      }

      const payload: any = { podcastId };
      if (tag && typeof tag === "string") {
        payload.tag = tag.toLowerCase().trim();
      }

      await storage.createJob({
        type: "compute_show_profile",
        payload: JSON.stringify(payload),
        status: "pending",
        priority: 5,
        entityId: podcastId,
        entityType: "podcast",
      });

      res.json({ success: true, message: "Show profile computation queued" });
    } catch (error) {
      console.error("[CREATOR] Compute show profile error:", error);
      res.status(500).json({ error: "Failed to queue computation" });
    }
  });

  app.post("/api/creator/process-clip", optionalAuth, async (req: any, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Login required" });
      }
      const userId = req.user.claims?.sub || req.user.id;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }

      const isAdmin = user.role === "admin";
      const isPaid = isAdmin || user.subscriptionTier === "creator" || user.subscriptionTier === "pro";
      if (!isPaid) {
        return res.status(403).json({ error: "Creator plan required for MP4 clip processing. Upgrade to unlock." });
      }

      const { momentId, platform, captionStyle, userEmail, adjustedStart, adjustedEnd, hookText, hookEnabled } = req.body;

      if (!momentId || !platform || !captionStyle) {
        return res.status(400).json({ error: "momentId, platform, and captionStyle are required" });
      }
      if (!VALID_PLATFORMS.includes(platform)) {
        return res.status(400).json({ error: `Invalid platform. Must be one of: ${VALID_PLATFORMS.join(", ")}` });
      }
      if (!VALID_CAPTION_STYLES.includes(captionStyle)) {
        return res.status(400).json({ error: `Invalid captionStyle. Must be one of: ${VALID_CAPTION_STYLES.join(", ")}` });
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

      const internalCaptionType = CAPTION_STYLE_MAP[captionStyle] || "karaoke";
      const platformForOptimize = platform === "reels" ? "instagram" : platform === "shorts" ? "youtube" : "tiktok";

      await storage.updateViralMomentClipStatus(moment.id, "pending", null, null);
      if (moment.captionedPath) await storage.updateViralMomentCaptionedPath(moment.id, null as any);
      if (moment.optimizedPath) await storage.updateViralMomentOptimizedPath(moment.id, null as any, platformForOptimize);

      const addWatermark = !isPaid;

      const extractJob = await storage.createJob({
        type: "extract_clip",
        episodeSourceId: youtubeSource.id,
        pipelineStage: "INTEL",
        result: {
          viralMomentId: moment.id,
          userId,
          captionType: internalCaptionType,
          adjustedStart: adjustedStart != null ? Math.floor(adjustedStart) : undefined,
          adjustedEnd: adjustedEnd != null ? Math.floor(adjustedEnd) : undefined,
          hookText: hookText ?? undefined,
          hookEnabled: hookEnabled !== false,
          addWatermark,
        },
      });

      const clipJob = await storage.createClipJob({
        userId,
        momentId: moment.id,
        episodeId: moment.episodeId,
        platform,
        captionStyle,
        status: "queued",
        adjustedStart: adjustedStart != null ? Math.floor(adjustedStart) : undefined,
        adjustedEnd: adjustedEnd != null ? Math.floor(adjustedEnd) : undefined,
        internalJobId: extractJob.id,
        notifyEmail: userEmail || user.email || undefined,
      });

      console.log(`[CREATOR] Process-clip: job=${clipJob.id}, moment=${momentId}, platform=${platform}, caption=${captionStyle}→${internalCaptionType}`);

      res.json({ jobId: clipJob.id });
    } catch (error) {
      console.error("[CREATOR] Process-clip error:", error);
      res.status(500).json({ error: "Failed to start clip processing" });
    }
  });

  app.get("/api/creator/clip-status/:jobId", optionalAuth, async (req: any, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Login required" });
      }
      const userId = req.user.claims?.sub || req.user.id;
      const clipJob = await storage.getClipJob(req.params.jobId);
      if (!clipJob) {
        return res.status(404).json({ error: "Clip job not found" });
      }
      if (clipJob.userId !== userId) {
        const user = await storage.getUser(userId);
        if (user?.role !== "admin") {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      if (clipJob.status === "complete" && clipJob.downloadUrl) {
        const url = clipJob.downloadUrl;
        const safeUrl = (url.startsWith("/tmp/") || url.startsWith("/home/")) ? `/api/creator/clip-download/${clipJob.id}` : url;
        return res.json({ status: "complete", downloadUrl: safeUrl });
      }
      if (clipJob.status === "failed") {
        return res.json({ status: "failed", error: clipJob.error || "Processing failed" });
      }

      const moment = await storage.getViralMoment(clipJob.momentId);
      if (!moment) {
        await storage.updateClipJob(clipJob.id, { status: "failed", error: "Viral moment no longer exists" });
        return res.json({ status: "failed", error: "Viral moment no longer exists" });
      }

      if (moment.clipStatus === "failed") {
        await storage.updateClipJob(clipJob.id, { status: "failed", error: moment.clipError || "Extraction failed" });
        return res.json({ status: "failed", error: moment.clipError || "Extraction failed" });
      }

      if (!moment.videoPath || moment.clipStatus !== "ready") {
        await storage.updateClipJob(clipJob.id, { status: "extracting" });
        return res.json({ status: "extracting" });
      }

      const finalPath = moment.captionedPath;
      if (!finalPath) {
        const internalCaptionType = CAPTION_STYLE_MAP[clipJob.captionStyle] || "karaoke";
        const existingCaptionJob = await checkExistingJob(moment.id, "burn_captions");
        if (!existingCaptionJob) {
          const sources = await storage.getEpisodeSourcesByEpisode(moment.episodeId);
          const youtubeSource = sources.find((s: any) => s.platform === "youtube");
          await storage.createJob({
            type: "burn_captions",
            episodeSourceId: youtubeSource?.id || null,
            pipelineStage: "INTEL",
            result: { viralMomentId: moment.id, captionType: internalCaptionType },
          });
        }
        await storage.updateClipJob(clipJob.id, { status: "captioning" });
        return res.json({ status: "captioning" });
      }

      let downloadUrl: string;
      if (finalPath.startsWith("https://")) {
        downloadUrl = finalPath;
      } else {
        try {
          downloadUrl = await uploadClipToObjectStorage(finalPath, clipJob.id);
        } catch (uploadErr) {
          console.error("[CREATOR] Object storage upload failed, serving locally:", uploadErr);
          downloadUrl = `/api/creator/clip-download/${clipJob.id}`;
        }
      }

      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await storage.updateClipJob(clipJob.id, {
        status: "complete",
        downloadUrl: downloadUrl.startsWith("/api/") ? finalPath : downloadUrl,
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

      return res.json({ status: "complete", downloadUrl });
    } catch (error) {
      console.error("[CREATOR] Clip-status error:", error);
      res.status(500).json({ error: "Failed to check clip status" });
    }
  });

  app.post("/api/creator/clip-notify-email",
    express.text({ type: "text/plain" }),
    optionalAuth,
    async (req: any, res: Response) => {
    try {
      let body: any;
      if (typeof req.body === "string") {
        try { body = JSON.parse(req.body); } catch { return res.status(400).json({ error: "Invalid JSON" }); }
      } else {
        body = req.body;
      }

      const { jobId, email } = body;
      if (!jobId || !email) {
        return res.status(400).json({ error: "jobId and email are required" });
      }

      const clipJob = await storage.getClipJob(jobId);
      if (!clipJob) {
        return res.status(404).json({ error: "Clip job not found" });
      }

      await storage.updateClipJob(jobId, { notifyEmail: email });

      if (clipJob.status === "complete" && clipJob.downloadUrl && !clipJob.notifySent) {
        const episode = await storage.getEpisode(clipJob.episodeId);
        const moment = await storage.getViralMoment(clipJob.momentId);
        sendClipReadyEmail(
          email,
          episode?.title || "Your episode",
          moment?.suggestedTitle || "Viral moment",
          clipJob.platform,
          clipJob.downloadUrl,
          clipJob.downloadUrlExpiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000)
        ).catch(() => {});
        await storage.updateClipJob(jobId, { notifySent: true });
      }

      res.json({ registered: true });
    } catch (error) {
      console.error("[CREATOR] Clip-notify-email error:", error);
      res.status(500).json({ error: "Failed to register email notification" });
    }
  });

  app.get("/api/creator/clip-download/:jobId", optionalAuth, async (req: any, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Login required" });
      }
      const userId = req.user.claims?.sub || req.user.id;
      const clipJob = await storage.getClipJob(req.params.jobId);
      if (!clipJob) {
        return res.status(404).json({ error: "Clip job not found" });
      }
      if (clipJob.userId !== userId) {
        const user = await storage.getUser(userId);
        if (user?.role !== "admin") {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      if (clipJob.status !== "complete" || !clipJob.downloadUrl) {
        return res.status(400).json({ error: "Clip not ready for download" });
      }

      if (clipJob.downloadUrlExpiresAt && new Date() > clipJob.downloadUrlExpiresAt) {
        try {
          const privateDir = process.env.PRIVATE_OBJECT_DIR || "";
          const objectPath = `${privateDir}/clips/${clipJob.id}.mp4`;
          const parts = objectPath.startsWith("/") ? objectPath.slice(1).split("/") : objectPath.split("/");
          const bucketName = parts[0];
          const objectName = parts.slice(1).join("/");
          const bucket = objectStorageClient.bucket(bucketName);
          const file = bucket.file(objectName);
          await file.delete().catch(() => {});
        } catch {}
        await storage.updateClipJob(clipJob.id, { downloadUrl: null as any, downloadUrlExpiresAt: null as any });
        return res.status(410).json({ error: "Download link expired. Please re-process the clip." });
      }

      const url = clipJob.downloadUrl;
      if (url.startsWith("/tmp/") || url.startsWith("/home/")) {
        let filePath = url;
        let fileExists = false;
        try {
          await fsPromises.access(filePath);
          const stat = await fsPromises.stat(filePath);
          fileExists = stat.size > 1000;
        } catch {}

        if (!fileExists) {
          console.log(`[CLIP-DOWNLOAD] File missing at ${filePath}, attempting re-upload to object storage...`);
          const moment = await storage.getViralMoment(clipJob.momentId);
          if (!moment) {
            return res.status(404).json({ error: "Clip data no longer available." });
          }
          const candidatePaths = [moment.captionedPath, moment.videoPath].filter(Boolean);
          let foundPath: string | null = null;
          for (const p of candidatePaths) {
            try {
              await fsPromises.access(p!);
              const s = await fsPromises.stat(p!);
              if (s.size > 1000) { foundPath = p!; break; }
            } catch {}
          }

          if (!foundPath) {
            const { extractYouTubeClip } = await import("./services/clip-extractor");
            const { EpisodeSource } = await import("@shared/schema");
            const sources = await storage.getEpisodeSourcesByEpisode(moment.episodeId);
            const ytSource = sources.find((s: any) => s.platform === "youtube" && s.sourceUrl);
            if (!ytSource?.sourceUrl) {
              return res.status(404).json({ error: "Cannot re-extract clip — no YouTube source." });
            }
            console.log(`[CLIP-DOWNLOAD] Re-extracting clip for moment ${moment.id}...`);
            try {
              const extracted = await extractYouTubeClip(ytSource.sourceUrl, moment.startTime, moment.endTime);
              foundPath = extracted.clipPath;
              await storage.updateViralMomentClipStatus(moment.id, "ready", foundPath, null);
            } catch (extractErr: any) {
              console.error(`[CLIP-DOWNLOAD] Re-extraction failed:`, extractErr.message);
              return res.status(503).json({ error: "Clip temporarily unavailable. Please try again in a few minutes." });
            }
          }

          try {
            const newUrl = await uploadClipToObjectStorage(foundPath, clipJob.id);
            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
            await storage.updateClipJob(clipJob.id, { downloadUrl: newUrl, downloadUrlExpiresAt: expiresAt });
            console.log(`[CLIP-DOWNLOAD] Re-uploaded to object storage, redirecting`);
            return res.redirect(newUrl);
          } catch {
            filePath = foundPath;
          }
        }

        const filename = path.basename(filePath);
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.setHeader("Content-Type", "video/mp4");
        const stat = await fsPromises.stat(filePath);
        res.setHeader("Content-Length", stat.size);
        const stream = (await import("fs")).createReadStream(filePath);
        stream.pipe(res);
      } else {
        res.redirect(url);
      }
    } catch (error) {
      console.error("[CREATOR] Clip-download error:", error);
      res.status(500).json({ error: "Failed to download clip" });
    }
  });
}

async function checkExistingJob(momentId: string, jobType: string): Promise<boolean> {
  try {
    const allJobs = await storage.getJobsByType(jobType);
    return allJobs.some((j: any) => {
      const payload = j.result as any;
      return payload?.viralMomentId === momentId && (j.status === "pending" || j.status === "running");
    });
  } catch {
    return false;
  }
}

async function uploadClipToObjectStorage(localPath: string, clipJobId: string): Promise<string> {
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) {
    throw new Error("PRIVATE_OBJECT_DIR not configured");
  }

  const fileBuffer = await fsPromises.readFile(localPath);

  const objectPath = `${privateDir}/clips/${clipJobId}.mp4`;
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

  console.log(`[CREATOR] Uploaded clip to object storage: ${objectName} (${(fileBuffer.length / 1024 / 1024).toFixed(1)}MB)`);

  return signedUrl;
}
