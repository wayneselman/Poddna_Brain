import { storage } from "../storage";
import type { Job, Episode, EpisodeSource, Podcast } from "@shared/schema";
import { Innertube } from "youtubei.js";
import { 
  computeConfidenceScore, 
  shouldAutoAccept, 
  computeFallbackDeadline 
} from "../youtube-confidence-scorer";

// Result type for YouTube video search
interface YouTubeSearchResult {
  videoId: string;
  videoUrl: string;
  videoTitle: string;
  channelId?: string;
  channelName?: string;
  durationSeconds?: number;
  publishedAt?: Date;
}

// Search YouTube for episode video when no video source exists
// Uses channel-constrained search when podcast has youtubeChannelId, falls back to global search
async function searchYouTubeForEpisode(
  episodeTitle: string,
  podcast: Podcast | null
): Promise<YouTubeSearchResult | null> {
  try {
    const yt = await Innertube.create();
    const podcastTitle = podcast?.title || "";
    const youtubeChannelId = podcast?.youtubeChannelId;
    
    // If podcast has anchored YouTube channel, try channel-constrained search first
    if (youtubeChannelId) {
      console.log(`[EPISODE-IMPORT] Trying channel-constrained search (channel: ${youtubeChannelId})`);
      const channelResult = await searchYouTubeByChannel(yt, youtubeChannelId, episodeTitle);
      if (channelResult) {
        console.log(`[EPISODE-IMPORT] Found match via channel search: "${channelResult.videoTitle}"`);
        return channelResult;
      }
      console.log(`[EPISODE-IMPORT] No channel match found, falling back to global search`);
    }
    
    // Global search fallback
    const searchQuery = `${podcastTitle} ${episodeTitle}`;
    console.log(`[EPISODE-IMPORT] Searching YouTube for: "${searchQuery}"`);
    
    const search = await yt.search(searchQuery);
    
    if (!search.videos || search.videos.length === 0) {
      console.log(`[EPISODE-IMPORT] No YouTube videos found for query`);
      return null;
    }
    
    // Get the first video result
    const video = search.videos[0] as any;
    const videoId = video.id || video.video_id;
    const videoTitle = video.title?.text || video.title || "Unknown";
    
    if (!videoId) {
      console.log(`[EPISODE-IMPORT] First result has no video ID`);
      return null;
    }
    
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    console.log(`[EPISODE-IMPORT] Found YouTube match: "${videoTitle}" (${videoId})`);
    
    // Extract channel info if available
    const channelId = video.author?.id || video.channel?.id;
    const channelName = video.author?.name || video.channel?.name;
    
    // Extract duration (in seconds) if available
    let durationSeconds: number | undefined;
    if (video.duration?.seconds) {
      durationSeconds = video.duration.seconds;
    }
    
    return { 
      videoId, 
      videoUrl, 
      videoTitle,
      channelId,
      channelName,
      durationSeconds,
    };
  } catch (error: any) {
    console.error(`[EPISODE-IMPORT] YouTube search failed:`, error.message);
    return null;
  }
}

// Search within a specific YouTube channel for videos matching the episode title
async function searchYouTubeByChannel(
  yt: Innertube,
  channelId: string,
  episodeTitle: string
): Promise<YouTubeSearchResult | null> {
  try {
    // Get the channel
    const channel = await yt.getChannel(channelId);
    if (!channel) {
      console.log(`[EPISODE-IMPORT] Channel not found: ${channelId}`);
      return null;
    }
    
    // Search within channel videos
    const videos = await channel.getVideos();
    if (!videos || !videos.videos || videos.videos.length === 0) {
      console.log(`[EPISODE-IMPORT] No videos found in channel`);
      return null;
    }
    
    // Simple title matching - find best match by checking if episode title words appear in video title
    const episodeWords = episodeTitle.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    
    let bestMatch: any = null;
    let bestScore = 0;
    
    for (const video of videos.videos as any[]) {
      const videoTitle = (video.title?.text || video.title || "").toLowerCase();
      let score = 0;
      
      for (const word of episodeWords) {
        if (videoTitle.includes(word)) {
          score++;
        }
      }
      
      // Require at least 30% of words to match
      if (score > bestScore && score >= episodeWords.length * 0.3) {
        bestScore = score;
        bestMatch = video;
      }
    }
    
    if (!bestMatch) {
      return null;
    }
    
    const videoId = bestMatch.id || bestMatch.video_id;
    if (!videoId) {
      return null;
    }
    
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const videoTitle = bestMatch.title?.text || bestMatch.title || "Unknown";
    
    // Extract duration if available
    let durationSeconds: number | undefined;
    if (bestMatch.duration?.seconds) {
      durationSeconds = bestMatch.duration.seconds;
    }
    
    return {
      videoId,
      videoUrl,
      videoTitle,
      channelId,
      channelName: channel.metadata?.title || undefined,
      durationSeconds,
    };
  } catch (error: any) {
    console.error(`[EPISODE-IMPORT] Channel search failed:`, error.message);
    return null;
  }
}

export async function handleEpisodeImportJob(
  job: Job,
  onProgress: (message: string, percentage: number) => void
): Promise<{ type: string; episodeId: string; nextJob?: string }> {
  onProgress("Starting episode import job", 0);
  
  if (!job.episodeSourceId) {
    throw new Error(`Job ${job.id} has no episodeSourceId`);
  }
  
  const source = await storage.getEpisodeSource(job.episodeSourceId);
  if (!source) {
    throw new Error(`Episode source not found: ${job.episodeSourceId}`);
  }
  
  const episode = await storage.getEpisode(source.episodeId);
  if (!episode) {
    throw new Error(`Episode not found: ${source.episodeId}`);
  }
  
  onProgress("Loading episode metadata", 20);
  
  await storage.updateEpisode(episode.id, {
    processingStatus: "importing",
  });
  
  onProgress("Normalizing episode metadata", 40);
  
  const audioUrl = episode.mediaUrl || source.sourceUrl;
  const videoUrl = episode.videoUrl || (source.kind === "video" ? source.sourceUrl : null);
  
  const updates: Partial<Episode> = {
    processingStatus: "ready_for_analysis",
  };
  
  if (!episode.mediaUrl && audioUrl) {
    updates.mediaUrl = audioUrl;
  }
  if (!episode.videoUrl && videoUrl) {
    updates.videoUrl = videoUrl;
  }
  
  await storage.updateEpisode(episode.id, updates);
  
  // Check if episode has any video sources
  const existingSources = await storage.getEpisodeSourcesByEpisode(episode.id);
  const hasVideoSource = existingSources.some((s: EpisodeSource) => s.kind === "video");
  
  // If no video source, search YouTube for matching video using candidate system
  if (!hasVideoSource) {
    onProgress("Searching YouTube for video...", 50);
    
    const podcast = await storage.getPodcast(episode.podcastId);
    
    const youtubeResult = await searchYouTubeForEpisode(episode.title, podcast || null);
    
    if (youtubeResult) {
      const { confidenceScore, signals } = computeConfidenceScore(
        episode.title,
        episode.duration,
        episode.publishedAt,
        podcast || null,
        youtubeResult.videoTitle,
        youtubeResult.durationSeconds,
        youtubeResult.channelId,
        youtubeResult.publishedAt
      );
      
      console.log(`[EPISODE-IMPORT] YouTube candidate score: ${confidenceScore} (signals: ${JSON.stringify(signals)})`);
      
      const candidate = await storage.createEpisodeCandidate({
        episodeId: episode.id,
        youtubeVideoId: youtubeResult.videoId,
        youtubeVideoUrl: youtubeResult.videoUrl,
        youtubeChannelId: youtubeResult.channelId || null,
        youtubeChannelName: youtubeResult.channelName || null,
        videoTitle: youtubeResult.videoTitle,
        videoDurationSeconds: youtubeResult.durationSeconds || null,
        videoPublishedAt: youtubeResult.publishedAt || null,
        confidenceScore,
        signals: signals as any,
        status: "pending",
      });
      
      console.log(`[EPISODE-IMPORT] Created candidate ${candidate.id} for episode ${episode.id}`);
      
      if (shouldAutoAccept(confidenceScore)) {
        console.log(`[EPISODE-IMPORT] Auto-accepting high-confidence match (score: ${confidenceScore})`);
        
        await storage.updateEpisodeCandidate(candidate.id, { status: "accepted" });
        
        const videoSource = await storage.createEpisodeSource({
          episodeId: episode.id,
          kind: "video",
          platform: "youtube",
          sourceUrl: youtubeResult.videoUrl,
          isCanonical: false,
        });
        
        console.log(`[EPISODE-IMPORT] Created YouTube source ${videoSource.id} from auto-accepted candidate`);
        
        await storage.updateEpisode(episode.id, { resolutionStatus: "resolved" });
        
        await storage.createJob({
          episodeSourceId: videoSource.id,
          type: "youtube_transcript",
          status: "pending",
        });
        
        console.log(`[EPISODE-IMPORT] Queued youtube_transcript job for source ${videoSource.id}`);
      } else {
        console.log(`[EPISODE-IMPORT] Low-confidence match (score: ${confidenceScore}), setting for review`);
        
        const fallbackAt = computeFallbackDeadline(72);
        await storage.updateEpisode(episode.id, {
          resolutionStatus: "awaiting_review",
          resolutionFallbackAt: fallbackAt,
        });
        
        console.log(`[EPISODE-IMPORT] Episode set to AWAITING_REVIEW with fallback at ${fallbackAt.toISOString()}`);
      }
    } else {
      console.log(`[EPISODE-IMPORT] No YouTube match found, marking as unresolved`);
      
      const fallbackAt = computeFallbackDeadline(72);
      await storage.updateEpisode(episode.id, {
        resolutionStatus: "unresolved",
        resolutionFallbackAt: fallbackAt,
      });
    }
  }
  
  onProgress("Queuing transcript job", 70);
  
  const transcriptJob = await storage.createJob({
    episodeSourceId: source.id,
    type: "episode_transcript",
    status: "pending",
  });
  
  onProgress("Episode import complete", 100);
  
  console.log(`[EPISODE-IMPORT] Episode ${episode.id} imported, transcript job ${transcriptJob.id} queued`);
  
  return {
    type: "episode_import",
    episodeId: episode.id,
    nextJob: transcriptJob.id,
  };
}
