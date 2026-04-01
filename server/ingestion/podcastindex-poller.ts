import { storage } from "../storage";
import type { ProgramSource, InsertIngestionEvent } from "@shared/schema";

export interface PodcastIndexPollResult {
  sourceId: string;
  queryOrFeedId: string;
  totalItems: number;
  newEvents: number;
  duplicates: number;
  errors: string[];
}

export interface PodcastIndexEpisodePayload {
  feedId: number;
  id: number;
  guid: string;
  title: string;
  description: string | null;
  datePublished: number | null;
  enclosureUrl: string | null;
  enclosureType: string | null;
  duration: number | null;
  feedTitle: string | null;
  feedUrl: string | null;
  image: string | null;
}

let podcastIndexApi: any = null;

async function getPodcastIndexClient() {
  if (podcastIndexApi) return podcastIndexApi;
  
  const apiKey = process.env.PODCASTINDEX_API_KEY;
  const apiSecret = process.env.PODCASTINDEX_API_SECRET;
  
  if (!apiKey || !apiSecret) {
    throw new Error("PodcastIndex API credentials not configured");
  }
  
  const PodcastIndexApi = (await import("podcast-index-api")).default;
  podcastIndexApi = PodcastIndexApi(apiKey, apiSecret);
  return podcastIndexApi;
}

export async function pollPodcastIndexFeed(source: ProgramSource): Promise<PodcastIndexPollResult> {
  const result: PodcastIndexPollResult = {
    sourceId: source.id,
    queryOrFeedId: source.value || "",
    totalItems: 0,
    newEvents: 0,
    duplicates: 0,
    errors: [],
  };

  if (source.type !== "podcastindex_feed") {
    result.errors.push(`Invalid source type: ${source.type}, expected podcastindex_feed`);
    return result;
  }

  const feedId = source.value;
  if (!feedId) {
    result.errors.push("No feed ID provided");
    return result;
  }

  console.log(`[PI-POLLER] Polling PodcastIndex feed: ${feedId}`);

  try {
    const api = await getPodcastIndexClient();
    const response = await api.episodesByFeedId(parseInt(feedId, 10), { max: 100 });
    
    if (!response || response.status !== "true" || !response.items) {
      result.errors.push(`Failed to fetch episodes from PodcastIndex feed ${feedId}`);
      return result;
    }

    result.totalItems = response.items.length;
    console.log(`[PI-POLLER] Found ${result.totalItems} episodes in feed ${feedId}`);

    for (const item of response.items) {
      const guid = item.guid || item.enclosureUrl || String(item.id);
      const dedupeKey = `pi_feed:${source.id}:${guid}`;

      const payload: PodcastIndexEpisodePayload = {
        feedId: item.feedId,
        id: item.id,
        guid,
        title: item.title || "Untitled",
        description: item.description || null,
        datePublished: item.datePublished || null,
        enclosureUrl: item.enclosureUrl || null,
        enclosureType: item.enclosureType || null,
        duration: item.duration || null,
        feedTitle: item.feedTitle || null,
        feedUrl: item.feedUrl || null,
        image: item.image || item.feedImage || null,
      };

      try {
        const eventData: InsertIngestionEvent = {
          programId: source.programId,
          sourceId: source.id,
          type: "new_episode_found",
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
          result.errors.push(`Failed to create event for "${item.title}": ${error.message}`);
        }
      }
    }

    await storage.updateProgramSourcePolledAt(source.id);

    console.log(`[PI-POLLER] Feed ${feedId} completed: ${result.newEvents} new, ${result.duplicates} duplicates, ${result.errors.length} errors`);

  } catch (error: any) {
    const errorMessage = `Failed to poll PodcastIndex feed: ${error.message}`;
    result.errors.push(errorMessage);
    console.error(`[PI-POLLER] ${errorMessage}`);
  }

  return result;
}

export async function pollPodcastIndexQuery(source: ProgramSource): Promise<PodcastIndexPollResult> {
  const result: PodcastIndexPollResult = {
    sourceId: source.id,
    queryOrFeedId: source.value || "",
    totalItems: 0,
    newEvents: 0,
    duplicates: 0,
    errors: [],
  };

  if (source.type !== "podcastindex_query") {
    result.errors.push(`Invalid source type: ${source.type}, expected podcastindex_query`);
    return result;
  }

  const query = source.value;
  if (!query) {
    result.errors.push("No search query provided");
    return result;
  }

  console.log(`[PI-POLLER] Searching PodcastIndex for: "${query}"`);

  try {
    const api = await getPodcastIndexClient();
    const response = await api.searchEpisodes(query, { max: 50 });
    
    if (!response || response.status !== "true" || !response.items) {
      result.errors.push(`Failed to search PodcastIndex for "${query}"`);
      return result;
    }

    result.totalItems = response.items.length;
    console.log(`[PI-POLLER] Found ${result.totalItems} episodes for query "${query}"`);

    for (const item of response.items) {
      const guid = item.guid || item.enclosureUrl || String(item.id);
      const dedupeKey = `pi_query:${source.id}:${guid}`;

      const payload: PodcastIndexEpisodePayload = {
        feedId: item.feedId,
        id: item.id,
        guid,
        title: item.title || "Untitled",
        description: item.description || null,
        datePublished: item.datePublished || null,
        enclosureUrl: item.enclosureUrl || null,
        enclosureType: item.enclosureType || null,
        duration: item.duration || null,
        feedTitle: item.feedTitle || null,
        feedUrl: item.feedUrl || null,
        image: item.image || item.feedImage || null,
      };

      try {
        const eventData: InsertIngestionEvent = {
          programId: source.programId,
          sourceId: source.id,
          type: "new_episode_found",
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
          result.errors.push(`Failed to create event for "${item.title}": ${error.message}`);
        }
      }
    }

    await storage.updateProgramSourcePolledAt(source.id);

    console.log(`[PI-POLLER] Query "${query}" completed: ${result.newEvents} new, ${result.duplicates} duplicates, ${result.errors.length} errors`);

  } catch (error: any) {
    const errorMessage = `Failed to poll PodcastIndex query: ${error.message}`;
    result.errors.push(errorMessage);
    console.error(`[PI-POLLER] ${errorMessage}`);
  }

  return result;
}
