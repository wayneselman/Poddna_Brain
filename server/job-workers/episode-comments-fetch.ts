import { Innertube } from "youtubei.js";
import { storage } from "../storage";
import { GeminiError } from "../ai/geminiClient";
import type { Job, EpisodeSource } from "@shared/schema";

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

interface YouTubeComment {
  id: string;
  text: string;
  authorName: string;
  authorChannelId: string;
  likeCount: number;
  replyCount: number;
  publishedAt: Date | null;
  rawTimestamp: string | null;
}

function extractTimestampReferences(text: string): string | null {
  const timestampPattern = /\b(\d{1,2}:?\d{2}(?::\d{2})?)\b/g;
  const matches = text.match(timestampPattern);
  return matches ? matches.join(",") : null;
}

function parseLikeCount(voteText: string | undefined): number {
  if (!voteText) return 0;
  const str = String(voteText).replace(/,/g, "");
  if (str.endsWith("K")) {
    return Math.round(parseFloat(str) * 1000);
  }
  if (str.endsWith("M")) {
    return Math.round(parseFloat(str) * 1000000);
  }
  return parseInt(str) || 0;
}

export async function handleEpisodeCommentsFetchJob(
  job: Job,
  onProgress: (message: string, percentage: number) => void
): Promise<{ type: string; episodeId: string; commentCount: number; nextJob?: string }> {
  onProgress("Starting comments fetch job", 0);
  
  const source = await storage.getEpisodeSource(job.episodeSourceId);
  if (!source) {
    throw new Error(`Episode source not found: ${job.episodeSourceId}`);
  }
  
  const episode = await storage.getEpisode(source.episodeId);
  if (!episode) {
    throw new Error(`Episode not found: ${source.episodeId}`);
  }
  
  const videoSource = await getVideoSource(source.episodeId);
  if (!videoSource || !videoSource.sourceUrl) {
    throw new Error("No YouTube video source found for this episode");
  }
  
  const videoId = extractYouTubeVideoId(videoSource.sourceUrl);
  if (!videoId) {
    throw new Error(`Could not extract YouTube video ID from URL: ${videoSource.sourceUrl}`);
  }
  
  onProgress(`Fetching comments for video ${videoId}`, 10);
  
  try {
    const yt = await Innertube.create();
    const comments: YouTubeComment[] = [];
    
    onProgress("Loading video comments", 20);
    
    const commentsSection = await yt.getComments(videoId);
    
    if (!commentsSection) {
      console.log(`[EPISODE-COMMENTS] No comments section available for video ${videoId}`);
      return {
        type: "episode_comments_fetch",
        episodeId: episode.id,
        commentCount: 0,
      };
    }
    
    let page = 0;
    const maxPages = 20;
    const maxComments = 2000;
    
    let currentSection = commentsSection;
    
    while (page < maxPages && comments.length < maxComments) {
      // Progress goes from 30 to 70 based on page progress
      const progressPct = 30 + Math.floor((page / maxPages) * 40);
      onProgress(`Processing page ${page + 1} (${comments.length} comments so far)`, progressPct);
      
      const contents = currentSection.contents;
      
      if (!contents || !Array.isArray(contents)) {
        console.log(`[EPISODE-COMMENTS] No contents on page ${page + 1} for video ${videoId}`);
        break;
      }
      
      const pageStartCount = comments.length;
      
      for (const thread of contents) {
        if (comments.length >= maxComments) break;
        
        const comment = thread.comment as any;
        if (!comment) continue;
        
        const commentText = comment.content?.text || "";
        const voteText = comment.vote_count?.text || comment.like_count?.toString() || "";
        const publishedText = comment.published?.text || "";
        
        comments.push({
          id: comment.comment_id || `${videoId}_${comments.length}`,
          text: commentText,
          authorName: comment.author?.name || "Unknown",
          authorChannelId: comment.author?.id || "",
          likeCount: parseLikeCount(voteText),
          replyCount: (thread as any).replies?.length || 0,
          publishedAt: publishedText ? parseYouTubeDate(publishedText) : null,
          rawTimestamp: extractTimestampReferences(commentText),
        });
      }
      
      console.log(`[EPISODE-COMMENTS] Page ${page + 1}: fetched ${comments.length - pageStartCount} comments (total: ${comments.length})`);
      
      page++;
      
      if (!currentSection.has_continuation || page >= maxPages) {
        if (!currentSection.has_continuation) {
          console.log(`[EPISODE-COMMENTS] No more pages available after page ${page}`);
        }
        break;
      }
      
      try {
        currentSection = await currentSection.getContinuation();
      } catch (contErr: any) {
        console.error(`[EPISODE-COMMENTS] Error getting continuation on page ${page}:`, contErr.message);
        break;
      }
    }
    
    onProgress(`Fetched ${comments.length} comments, storing...`, 70);
    
    const existingComments = await storage.getCommentsByEpisode(episode.id);
    const existingIds = new Set(existingComments.map(c => c.externalId));
    
    let newCount = 0;
    for (const comment of comments) {
      if (!existingIds.has(comment.id)) {
        await storage.createEpisodeComment({
          episodeId: episode.id,
          externalId: comment.id,
          authorName: comment.authorName,
          authorChannelId: comment.authorChannelId,
          text: comment.text,
          likeCount: comment.likeCount,
          replyCount: comment.replyCount,
          rawTimestamp: comment.rawTimestamp,
          publishedAt: comment.publishedAt,
        });
        newCount++;
      }
    }
    
    onProgress(`Stored ${newCount} new comments`, 90);
    
    const mapJob = await storage.createJob({
      episodeSourceId: source.id,
      type: "episode_comments_map",
      status: "pending",
    });
    
    onProgress("Comments fetch complete, queued mapping job", 100);
    
    console.log(`[EPISODE-COMMENTS] Fetched ${comments.length} comments (${newCount} new) for episode ${episode.id}, map job ${mapJob.id} queued`);
    
    return {
      type: "episode_comments_fetch",
      episodeId: episode.id,
      commentCount: comments.length,
      nextJob: mapJob.id,
    };
  } catch (err: any) {
    const msg: string = err?.message ?? String(err);
    console.error(`[EPISODE-COMMENTS] Error fetching comments for video ${videoId}:`, msg);

    // Detect permanently-disabled comments — never retryable
    const isDisabled =
      /comment.*disabled|disabled.*comment|comments.*turned off/i.test(msg) ||
      msg.includes("commentsDisabled") ||
      msg.includes("COMMENT_DISABLED");
    if (isDisabled) {
      throw new GeminiError(
        `Comments are permanently disabled for video ${videoId}`,
        false,
        "COMMENTS_DISABLED"
      );
    }

    throw err;
  }
}

async function getVideoSource(episodeId: string): Promise<EpisodeSource | null> {
  const sources = await storage.getEpisodeSourcesByEpisode(episodeId);
  
  // Check for YouTube sources - need to handle both youtube.com and youtu.be URLs
  // Also check platform field since some sources may have correct platform but different URL formats
  const isYouTubeSource = (s: EpisodeSource) => {
    if (s.platform === 'youtube') return true;
    if (!s.sourceUrl) return false;
    return s.sourceUrl.includes('youtube.com') || s.sourceUrl.includes('youtu.be');
  };
  
  // Prefer video kind, but fall back to audio kind if it's a YouTube source
  return sources.find((s: EpisodeSource) => s.kind === "video" && isYouTubeSource(s)) 
    || sources.find((s: EpisodeSource) => s.kind === "audio" && isYouTubeSource(s)) 
    || null;
}

function parseYouTubeDate(dateStr: string): Date | null {
  try {
    const now = new Date();
    
    const agoMatch = dateStr.match(/(\d+)\s*(second|minute|hour|day|week|month|year)s?\s*ago/i);
    if (agoMatch) {
      const num = parseInt(agoMatch[1]);
      const unit = agoMatch[2].toLowerCase();
      
      switch (unit) {
        case "second": return new Date(now.getTime() - num * 1000);
        case "minute": return new Date(now.getTime() - num * 60 * 1000);
        case "hour": return new Date(now.getTime() - num * 60 * 60 * 1000);
        case "day": return new Date(now.getTime() - num * 24 * 60 * 60 * 1000);
        case "week": return new Date(now.getTime() - num * 7 * 24 * 60 * 60 * 1000);
        case "month": return new Date(now.getTime() - num * 30 * 24 * 60 * 60 * 1000);
        case "year": return new Date(now.getTime() - num * 365 * 24 * 60 * 60 * 1000);
      }
    }
    
    return new Date(dateStr);
  } catch {
    return null;
  }
}
