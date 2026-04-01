import { storage } from "../storage";
import type { InsertEpisode } from "@shared/schema";

export class EpisodeService {
  async getEpisode(id: string) {
    return storage.getEpisode(id);
  }

  async getAllEpisodes() {
    return storage.getAllEpisodes();
  }

  async getCuratedEpisodes() {
    return storage.getCuratedEpisodes();
  }

  async getEpisodesByPodcast(podcastId: string) {
    return storage.getEpisodesByPodcast(podcastId);
  }

  async createEpisode(data: InsertEpisode) {
    return storage.createEpisode(data);
  }

  async updateEpisode(id: string, data: Partial<InsertEpisode>) {
    return storage.updateEpisode(id, data);
  }

  async deleteEpisode(id: string) {
    return storage.deleteEpisode(id);
  }

  async getSegmentsByEpisode(episodeId: string) {
    return storage.getSegmentsByEpisode(episodeId);
  }

  async getEpisodeSegmentsByEpisode(episodeId: string) {
    return storage.getEpisodeSegmentsByEpisode(episodeId);
  }

  async getAnnotationsByEpisode(episodeId: string) {
    return storage.getAnnotationsByEpisode(episodeId);
  }

  async getMusicDetectionsByEpisode(episodeId: string) {
    return storage.getMusicDetectionsByEpisode(episodeId);
  }

  async getClipsByEpisode(episodeId: string) {
    return storage.getClipsByEpisode(episodeId);
  }

  async getSponsorSegmentsByEpisode(episodeId: string) {
    return storage.getSponsorSegmentsByEpisode(episodeId);
  }

  async getClaimsByEpisodeId(episodeId: string) {
    return storage.getClaimsByEpisodeId(episodeId);
  }

  async getEntityMentionsByEpisode(episodeId: string) {
    return storage.getEntityMentionsByEpisode(episodeId);
  }

  async getEpisodeSourcesByEpisode(episodeId: string) {
    return storage.getEpisodeSourcesByEpisode(episodeId);
  }

  async getJobsByEpisodeSource(episodeSourceId: string) {
    return storage.getJobsByEpisodeSource(episodeSourceId);
  }

  /**
   * Returns all episodes enriched with hasTranscript flag.
   * Used by GET /api/episodes
   */
  async listEpisodesWithEnrichment() {
    const episodes = await storage.getAllEpisodes();
    
    const episodesWithTranscriptStatus = await Promise.all(
      episodes.map(async (episode) => {
        const segments = await storage.getSegmentsByEpisode(episode.id);
        return {
          ...episode,
          hasTranscript: segments.length > 0,
        };
      })
    );
    
    return episodesWithTranscriptStatus;
  }

  /**
   * Returns episode with sources and canonical source ID.
   * Used by GET /api/episodes/:id
   */
  async getEpisodeWithSources(id: string) {
    const episode = await storage.getEpisode(id);
    if (!episode) {
      return null;
    }
    
    const [segments, sources] = await Promise.all([
      storage.getSegmentsByEpisode(episode.id),
      storage.getEpisodeSourcesByEpisode(episode.id),
    ]);

    const canonicalSource = sources.find(s => s.isCanonical);
    
    return {
      ...episode,
      hasTranscript: segments.length > 0,
      sources,
      canonicalSourceId: canonicalSource?.id || null,
    };
  }

  /**
   * Returns episode processing status including transcript and music status.
   * Used by GET /api/episodes/:id/status
   */
  async getEpisodeStatus(episodeId: string) {
    const episode = await storage.getEpisode(episodeId);
    if (!episode) {
      return null;
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

    return {
      transcriptStatus,
      musicStatus,
      hasTranscript: segments.length > 0,
      hasMusic: musicDetections.length > 0,
      segmentCount: segments.length,
      musicCount: musicDetections.length,
      processingStatus: episode.processingStatus || "new",
      lastError: episode.lastError,
    };
  }

  /**
   * Returns all episodes enriched with podcast details, annotation counts, music counts, and transcript status.
   * Used by GET /api/episodes/enriched
   */
  async getEnrichedEpisodes() {
    const [episodes, podcasts] = await Promise.all([
      storage.getAllEpisodes(),
      storage.getAllPodcasts(),
    ]);
    const podcastMap = new Map(podcasts.map(p => [p.id, p]));

    const enrichedEpisodes = await Promise.all(
      episodes.map(async (ep) => {
        const podcast = podcastMap.get(ep.podcastId);
        const [annotations, musicDetections, segments] = await Promise.all([
          storage.getAnnotationsByEpisode(ep.id),
          storage.getMusicDetectionsByEpisode(ep.id),
          storage.getSegmentsByEpisode(ep.id),
        ]);

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

    return enrichedEpisodes;
  }

  /**
   * Returns curated episodes enriched with podcast details for catalog display.
   * Used by GET /api/episodes/catalog
   */
  async getCatalogEpisodes() {
    const [episodes, podcasts] = await Promise.all([
      storage.getCuratedEpisodes(),
      storage.getAllPodcasts(),
    ]);
    const podcastMap = new Map(podcasts.map(p => [p.id, p]));

    const catalogEpisodes = await Promise.all(
      episodes.map(async (ep) => {
        const podcast = podcastMap.get(ep.podcastId);
        const segments = await storage.getSegmentsByEpisode(ep.id);

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
        };
      })
    );

    return catalogEpisodes;
  }

  /**
   * Returns top moments for an episode based on engagement or AI content.
   * Used by GET /api/episodes/:id/moments
   */
  async getEpisodeMoments(episodeId: string, limit: number = 5) {
    const segments = await storage.getEpisodeSegmentsByEpisode(episodeId);
    if (!segments || segments.length === 0) {
      return [];
    }

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

    let candidates = engagementBased.length > 0 ? engagementBased : aiBased;

    if (engagementBased.length > 0) {
      candidates.sort((a, b) => (b.seg.engagementScore || 0) - (a.seg.engagementScore || 0));
    } else {
      candidates.sort((a, b) => {
        const aScore = (a.seg.summary?.length || 0) + (a.seg.label?.length || 0);
        const bScore = (b.seg.summary?.length || 0) + (b.seg.label?.length || 0);
        return bScore - aScore;
      });
    }

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

    return moments;
  }

  /**
   * Imports an episode with podcast lookup/creation and duplicate detection.
   * Used by POST /api/episodes/import
   */
  async importEpisode(podcastData: {
    title: string;
    description?: string | null;
    artworkUrl?: string | null;
    host?: string | null;
    podcastIndexFeedId?: string | null;
  }, episodeData: {
    title: string;
    audioUrl: string;
    description?: string | null;
    duration?: number;
    publishedAt?: string | null;
    transcriptUrl?: string | null;
    transcriptType?: string | null;
    chaptersUrl?: string | null;
    videoUrl?: string | null;
  }) {
    // Find or create podcast
    let podcast = null;

    if (podcastData.podcastIndexFeedId) {
      const podcasts = await storage.getAllPodcasts();
      podcast = podcasts.find(p => p.podcastIndexFeedId === podcastData.podcastIndexFeedId);
    }

    if (!podcast) {
      const podcasts = await storage.getAllPodcasts();
      podcast = podcasts.find(p => p.title.toLowerCase() === podcastData.title.toLowerCase());
    }

    const isNewPodcast = !podcast;
    if (!podcast) {
      podcast = await storage.createPodcast({
        title: podcastData.title,
        description: podcastData.description || null,
        artworkUrl: podcastData.artworkUrl || null,
        host: podcastData.host || "Unknown Host",
        podcastIndexFeedId: podcastData.podcastIndexFeedId || null,
      });
      console.log(`[EPISODE_IMPORT] Created new podcast: ${podcast.title} (${podcast.id})`);
    }

    // Check for existing episode
    const existingEpisodes = await storage.getEpisodesByPodcast(podcast.id);
    let existingEpisode = existingEpisodes.find(ep =>
      ep.mediaUrl && ep.mediaUrl.toLowerCase() === episodeData.audioUrl.toLowerCase()
    );

    if (!existingEpisode) {
      existingEpisode = existingEpisodes.find(ep =>
        ep.title.toLowerCase() === episodeData.title.toLowerCase()
      );
    }

    if (existingEpisode) {
      console.log(`[EPISODE_IMPORT] Episode already exists: ${existingEpisode.title} (${existingEpisode.id})`);
      return {
        success: true,
        isNew: false,
        isNewPodcast: false,
        episode: existingEpisode,
        podcast,
        message: "Episode already exists in PodDNA",
      };
    }

    // Create episode
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

    // Create audio source
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

    // Create video source if provided
    if (episodeData.videoUrl) {
      try {
        const videoId = this.getYouTubeVideoId(episodeData.videoUrl);
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

    return {
      success: true,
      isNew: true,
      isNewPodcast,
      episode,
      podcast,
    };
  }

  /**
   * Returns paginated episodes sorted by annotation count.
   * Used by GET /api/episodes/most-annotated
   */
  async getMostAnnotatedEpisodes(params: { page?: number; pageSize?: number }) {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 20;
    
    const result = await storage.getMostAnnotatedEpisodes({ page, pageSize });
    
    return {
      episodes: result.episodes,
      pagination: {
        page,
        pageSize,
        totalCount: result.totalCount,
        totalPages: Math.ceil(result.totalCount / pageSize),
      },
    };
  }

  private getYouTubeVideoId(url: string): string | null {
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
}

export const episodeService = new EpisodeService();
