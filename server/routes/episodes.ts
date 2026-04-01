import { Router } from "express";
import { storage } from "../storage";
import { episodeService } from "../services/episode-service";
import { isAuthenticated, requireAdmin, requireAdminOrModerator } from "../replitAuth";
import { insertEpisodeSchema } from "@shared/schema";
import { enqueueEpisodePipelineJob } from "../youtube-job-helper";

export function buildEpisodesRouter(): Router {
  const router = Router();

  router.get("/", async (_req, res) => {
    try {
      const episodes = await episodeService.listEpisodesWithEnrichment();
      res.json(episodes);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch episodes" });
    }
  });

  router.get("/enriched", async (_req, res) => {
    try {
      const enrichedEpisodes = await episodeService.getEnrichedEpisodes();
      res.json(enrichedEpisodes);
    } catch (error) {
      console.error("[ERROR] Failed to fetch enriched episodes:", error);
      res.status(500).json({ error: "Failed to fetch enriched episodes" });
    }
  });

  router.get("/catalog", async (_req, res) => {
    try {
      const catalogEpisodes = await episodeService.getCatalogEpisodes();
      res.json(catalogEpisodes);
    } catch (error) {
      console.error("[ERROR] Failed to fetch catalog episodes:", error);
      res.status(500).json({ error: "Failed to fetch catalog episodes" });
    }
  });

  router.get("/most-annotated", async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize as string) || 20));
      
      const result = await episodeService.getMostAnnotatedEpisodes({ page, pageSize });
      res.json(result);
    } catch (error) {
      console.error("[ERROR] Failed to fetch most annotated episodes:", error);
      res.status(500).json({ error: "Failed to fetch most annotated episodes" });
    }
  });

  router.get("/:id", async (req, res) => {
    try {
      const episode = await episodeService.getEpisodeWithSources(req.params.id);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }
      res.json(episode);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch episode" });
    }
  });

  router.get("/:id/status", async (req, res) => {
    try {
      const status = await episodeService.getEpisodeStatus(req.params.id);
      if (!status) {
        return res.status(404).json({ error: "Episode not found" });
      }
      res.json(status);
    } catch (error) {
      console.error("[EPISODE_STATUS] Error:", error);
      res.status(500).json({ error: "Failed to fetch episode status" });
    }
  });

  router.post("/", async (req, res) => {
    try {
      const payload = {
        ...req.body,
        publishedAt: new Date(req.body.publishedAt),
      };
      const validated = insertEpisodeSchema.parse(payload);
      const episode = await episodeService.createEpisode(validated);
      res.status(201).json(episode);
    } catch (error) {
      console.error("[ERROR] Episode creation failed:", error);
      res.status(400).json({ error: "Invalid episode data" });
    }
  });

  router.patch("/:id", isAuthenticated, async (req, res) => {
    try {
      const payload = {
        ...req.body,
        publishedAt: req.body.publishedAt ? new Date(req.body.publishedAt) : undefined,
      };
      const episode = await episodeService.updateEpisode(req.params.id, payload);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }
      res.json(episode);
    } catch (error) {
      res.status(400).json({ error: "Failed to update episode" });
    }
  });

  router.delete("/:id", isAuthenticated, async (req, res) => {
    try {
      const deleted = await episodeService.deleteEpisode(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Episode not found" });
      }
      res.json({ message: "Episode deleted successfully" });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete episode" });
    }
  });

  router.post("/import", isAuthenticated, requireAdminOrModerator, async (req, res) => {
    try {
      const { podcast: podcastData, episode: episodeData } = req.body;

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

      const result = await episodeService.importEpisode(podcastData, episodeData);

      if (!result.isNew) {
        return res.json({
          success: result.success,
          isNew: result.isNew,
          isNewPodcast: result.isNewPodcast,
          episode: result.episode,
          podcast: result.podcast,
          message: result.message,
        });
      }

      // Enqueue pipeline job for new episodes (infrastructure concern stays in route)
      const pipelineResult = await enqueueEpisodePipelineJob(result.episode.id);
      if (pipelineResult.enqueued) {
        console.log(`[EPISODE_IMPORT] Enqueued pipeline job for: ${result.episode.title}`);
      } else {
        console.log(`[EPISODE_IMPORT] No source found for pipeline, episode: ${result.episode.title}`);
      }

      res.status(201).json({
        success: true,
        isNew: true,
        isNewPodcast: result.isNewPodcast,
        episode: result.episode,
        podcast: result.podcast,
        pipelineQueued: pipelineResult.enqueued,
        message: "Episode added to PodDNA and queued for processing"
      });
    } catch (error) {
      console.error("[EPISODE_IMPORT] Import error:", error);
      res.status(500).json({ error: "Failed to import episode" });
    }
  });

  router.get("/:id/segments", async (req, res) => {
    try {
      const segments = await episodeService.getSegmentsByEpisode(req.params.id);
      res.json(segments);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch segments" });
    }
  });

  router.get("/:id/episode-segments", async (req, res) => {
    try {
      const segments = await episodeService.getEpisodeSegmentsByEpisode(req.params.id);
      res.json(segments);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch episode segments" });
    }
  });

  router.get("/:id/moments", async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 5, 10);
      const moments = await episodeService.getEpisodeMoments(req.params.id, limit);
      res.json(moments);
    } catch (error) {
      console.error("[MOMENTS] Error:", error);
      res.status(500).json({ error: "Failed to fetch moments" });
    }
  });

  router.get("/:id/annotations", async (req, res) => {
    try {
      const annotations = await episodeService.getAnnotationsByEpisode(req.params.id);
      res.json(annotations);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch annotations" });
    }
  });

  router.get("/:id/music", async (req, res) => {
    try {
      const musicDetections = await episodeService.getMusicDetectionsByEpisode(req.params.id);
      res.json(musicDetections);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch music detections" });
    }
  });

  router.get("/:id/clips", async (req, res) => {
    try {
      const clips = await episodeService.getClipsByEpisode(req.params.id);
      res.json(clips);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch clips" });
    }
  });

  router.get("/:id/sponsors", async (req, res) => {
    try {
      const episode = await storage.getEpisode(req.params.id);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }
      
      const sponsors = await storage.getSponsorSegmentsByEpisode(req.params.id);
      res.json(sponsors);
    } catch (error) {
      console.error("[SPONSORS] Error fetching sponsors:", error);
      res.status(500).json({ error: "Failed to fetch sponsors" });
    }
  });

  router.get("/:id/claims", async (req, res) => {
    try {
      const episode = await storage.getEpisode(req.params.id);
      if (!episode) {
        return res.status(404).json({ error: "Episode not found" });
      }
      
      const claims = await storage.getClaimsByEpisodeId(req.params.id);
      res.json(claims);
    } catch (error) {
      console.error("[CLAIMS] Error fetching claims:", error);
      res.status(500).json({ error: "Failed to fetch claims" });
    }
  });

  router.get("/:id/entities", async (req, res) => {
    try {
      const mentions = await episodeService.getEntityMentionsByEpisode(req.params.id);
      res.json(mentions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch entities" });
    }
  });

  return router;
}
