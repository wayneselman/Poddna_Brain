import { Innertube } from "youtubei.js";
import { storage } from "../storage";
import type { ProgramSource, InsertIngestionEvent } from "@shared/schema";

export interface YouTubePollResult {
  sourceId: string;
  channelTitle: string | null;
  totalVideos: number;
  newEvents: number;
  duplicates: number;
  errors: string[];
}

export interface YouTubeVideoPayload {
  videoId: string;
  videoUrl: string;
  title: string;
  description: string | null;
  publishedAt: string | null;
  durationSeconds: number | null;
  channelId: string;
  channelTitle: string | null;
  thumbnailUrl: string | null;
}

function extractChannelIdentifier(input: string): string {
  // Handle full URLs like https://www.youtube.com/@TheDiaryOfACEO
  if (input.includes("youtube.com/")) {
    // Extract @handle from URL
    const handleMatch = input.match(/@([a-zA-Z0-9_-]+)/);
    if (handleMatch) {
      return `@${handleMatch[1]}`;
    }
    // Extract /channel/UC... format
    const channelMatch = input.match(/\/channel\/(UC[a-zA-Z0-9_-]+)/);
    if (channelMatch) {
      return channelMatch[1];
    }
    // Extract /c/name or /user/name format - use as-is for resolution
    const customMatch = input.match(/\/(c|user)\/([a-zA-Z0-9_-]+)/);
    if (customMatch) {
      return customMatch[2];
    }
  }
  // Already a handle or channel ID
  return input;
}

export async function pollYouTubeChannel(source: ProgramSource): Promise<YouTubePollResult> {
  const result: YouTubePollResult = {
    sourceId: source.id,
    channelTitle: null,
    totalVideos: 0,
    newEvents: 0,
    duplicates: 0,
    errors: [],
  };

  if (source.type !== "youtube_channel") {
    result.errors.push(`Invalid source type: ${source.type}, expected youtube_channel`);
    return result;
  }

  const rawValue = source.value;
  if (!rawValue) {
    result.errors.push("No channel ID provided");
    return result;
  }

  const channelId = extractChannelIdentifier(rawValue);
  console.log(`[YOUTUBE-POLLER] Polling YouTube channel: ${channelId} (from: ${rawValue})`);

  try {
    const yt = await Innertube.create();
    
    // Try to resolve handle to channel ID if needed
    let channel;
    try {
      channel = await yt.getChannel(channelId);
    } catch (e: any) {
      // If direct lookup fails and it's a handle, try resolving via search
      if (channelId.startsWith("@")) {
        console.log(`[YOUTUBE-POLLER] Direct lookup failed, trying to resolve handle: ${channelId}`);
        const searchResults = await yt.search(channelId, { type: "channel" });
        const channels = searchResults.results?.filter((r: any) => r.type === "Channel") || [];
        if (channels.length > 0) {
          const firstChannel = channels[0] as any;
          const resolvedId = firstChannel.id || firstChannel.author?.id;
          if (resolvedId) {
            console.log(`[YOUTUBE-POLLER] Resolved ${channelId} to ${resolvedId}`);
            channel = await yt.getChannel(resolvedId);
          }
        }
      }
      if (!channel) {
        throw e;
      }
    }
    if (!channel) {
      result.errors.push(`Channel not found: ${channelId}`);
      return result;
    }
    
    result.channelTitle = channel.metadata?.title || null;
    console.log(`[YOUTUBE-POLLER] Found channel: ${result.channelTitle}`);
    
    const videos = await channel.getVideos();
    if (!videos || !videos.videos || videos.videos.length === 0) {
      console.log(`[YOUTUBE-POLLER] No videos found in channel`);
      await storage.updateProgramSourcePolledAt(source.id);
      return result;
    }
    
    result.totalVideos = videos.videos.length;
    console.log(`[YOUTUBE-POLLER] Found ${result.totalVideos} videos`);

    for (const video of videos.videos as any[]) {
      const videoId = video.id || video.video_id;
      if (!videoId) {
        continue;
      }

      const title = video.title?.text || video.title || "Untitled";
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
      const dedupeKey = `youtube:${source.id}:${videoId}`;

      const payload: YouTubeVideoPayload = {
        videoId,
        videoUrl,
        title,
        description: video.description?.text || null,
        publishedAt: video.published?.text || null,
        durationSeconds: video.duration?.seconds || null,
        channelId,
        channelTitle: result.channelTitle,
        thumbnailUrl: video.thumbnails?.[0]?.url || null,
      };

      try {
        const eventData: InsertIngestionEvent = {
          programId: source.programId,
          sourceId: source.id,
          type: "youtube_upload_found",
          payload,
          dedupeKey,
          actionStatus: "pending",
        };

        await storage.createIngestionEvent(eventData);
        result.newEvents++;
      } catch (error: any) {
        if (error.code === "23505" || error.message?.includes("duplicate key")) {
          result.duplicates++;
        } else {
          result.errors.push(`Failed to create event for "${title}": ${error.message}`);
        }
      }
    }

    await storage.updateProgramSourcePolledAt(source.id);

    console.log(`[YOUTUBE-POLLER] Completed: ${result.newEvents} new, ${result.duplicates} duplicates, ${result.errors.length} errors`);

  } catch (error: any) {
    const errorMessage = `Failed to poll YouTube channel: ${error.message}`;
    result.errors.push(errorMessage);
    console.error(`[YOUTUBE-POLLER] ${errorMessage}`);
  }

  return result;
}

export async function pollAllYouTubeChannels(programId: string): Promise<YouTubePollResult[]> {
  const sources = await storage.getProgramSources(programId);
  const ytSources = sources.filter(s => s.type === "youtube_channel" && s.enabled);
  
  const results: YouTubePollResult[] = [];
  for (const source of ytSources) {
    const result = await pollYouTubeChannel(source);
    results.push(result);
  }
  
  return results;
}
