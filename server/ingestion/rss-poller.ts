import Parser from "rss-parser";
import { storage } from "../storage";
import type { ProgramSource, InsertIngestionEvent } from "@shared/schema";

const parser = new Parser({
  timeout: 30000,
  headers: {
    "User-Agent": "PODDNA/1.0 (Podcast Annotation Platform)",
  },
});

export interface RssPollResult {
  sourceId: string;
  feedTitle: string | null;
  totalItems: number;
  newEvents: number;
  duplicates: number;
  errors: string[];
}

export interface RssEpisodePayload {
  guid: string;
  title: string;
  description: string | null;
  pubDate: string | null;
  enclosureUrl: string | null;
  enclosureType: string | null;
  duration: string | null;
  link: string | null;
  author: string | null;
  imageUrl: string | null;
}

export async function pollRssSource(source: ProgramSource, options: { maxItems?: number } = {}): Promise<RssPollResult> {
  const result: RssPollResult = {
    sourceId: source.id,
    feedTitle: null,
    totalItems: 0,
    newEvents: 0,
    duplicates: 0,
    errors: [],
  };

  if (source.type !== "rss_url") {
    result.errors.push(`Invalid source type: ${source.type}, expected rss_url`);
    return result;
  }

  const feedUrl = source.value;
  if (!feedUrl) {
    result.errors.push("No feed URL provided");
    return result;
  }

  console.log(`[RSS-POLLER] Polling RSS feed: ${feedUrl}`);

  try {
    const feed = await parser.parseURL(feedUrl);
    result.feedTitle = feed.title || null;
    result.totalItems = feed.items?.length || 0;

    // Limit to recent episodes (default 20 for matching with YouTube)
    const maxItems = options.maxItems ?? 20;
    const items = (feed.items || []).slice(0, maxItems);

    console.log(`[RSS-POLLER] Found ${result.totalItems} items, processing ${items.length} recent items from feed: ${result.feedTitle}`);

    for (const item of items) {
      const guid = item.guid || item.link || item.title || "";
      if (!guid) {
        result.errors.push(`Skipping item with no guid/link/title`);
        continue;
      }

      const pubDate = item.pubDate || item.isoDate || null;
      const dedupeKey = `rss:${source.id}:${guid}`;

      const payload: RssEpisodePayload = {
        guid,
        title: item.title || "Untitled",
        description: item.contentSnippet || item.content || null,
        pubDate,
        enclosureUrl: item.enclosure?.url || null,
        enclosureType: item.enclosure?.type || null,
        duration: (item as any).itunes?.duration || null,
        link: item.link || null,
        author: item.creator || (item as any).itunes?.author || null,
        imageUrl: (item as any).itunes?.image || null,
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

    console.log(`[RSS-POLLER] Completed: ${result.newEvents} new, ${result.duplicates} duplicates, ${result.errors.length} errors`);

  } catch (error: any) {
    const errorMessage = `Failed to parse RSS feed: ${error.message}`;
    result.errors.push(errorMessage);
    console.error(`[RSS-POLLER] ${errorMessage}`);
  }

  return result;
}

export async function pollAllRssSources(programId: string): Promise<RssPollResult[]> {
  const sources = await storage.getProgramSources(programId);
  const rssSources = sources.filter(s => s.type === "rss_url" && s.enabled);
  
  const results: RssPollResult[] = [];
  for (const source of rssSources) {
    const result = await pollRssSource(source);
    results.push(result);
  }
  
  return results;
}
