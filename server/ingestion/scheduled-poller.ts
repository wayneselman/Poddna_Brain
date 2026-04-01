import { storage } from "../storage";
import { pollRssSource } from "./rss-poller";
import { pollYouTubeChannel } from "./youtube-poller";
import { pollPodcastIndexFeed, pollPodcastIndexQuery } from "./podcastindex-poller";
import type { Program, ProgramSource } from "@shared/schema";

const POLL_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 hours
const MIN_POLL_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes minimum between polls of same source
const RATE_LIMIT_DELAY_MS = 1000; // 1 second between sources to avoid rate limiting

let isRunning = false;
let pollTimeoutId: NodeJS.Timeout | null = null;

export interface ScheduledPollSummary {
  programsPolled: number;
  sourcesPolled: number;
  totalNewEvents: number;
  errors: number;
  startedAt: Date;
  completedAt: Date;
}

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function pollSource(source: ProgramSource, programId: string): Promise<{ newEvents: number; error?: string }> {
  try {
    switch (source.type) {
      case "rss_url": {
        const result = await pollRssSource(source);
        await storage.updateProgramSourcePolledAt(source.id);
        return { 
          newEvents: result.newEvents, 
          error: result.errors.length > 0 ? result.errors.join("; ") : undefined 
        };
      }
      case "youtube_channel": {
        const result = await pollYouTubeChannel(source);
        await storage.updateProgramSourcePolledAt(source.id);
        return { 
          newEvents: result.newEvents, 
          error: result.errors.length > 0 ? result.errors.join("; ") : undefined 
        };
      }
      case "podcastindex_feed": {
        const result = await pollPodcastIndexFeed(source);
        await storage.updateProgramSourcePolledAt(source.id);
        return { 
          newEvents: result.newEvents, 
          error: result.errors.length > 0 ? result.errors.join("; ") : undefined 
        };
      }
      case "podcastindex_query": {
        const result = await pollPodcastIndexQuery(source);
        await storage.updateProgramSourcePolledAt(source.id);
        return { 
          newEvents: result.newEvents, 
          error: result.errors.length > 0 ? result.errors.join("; ") : undefined 
        };
      }
      default:
        return { newEvents: 0, error: `Unknown source type: ${source.type}` };
    }
  } catch (err: any) {
    console.error(`[SCHEDULED-POLLER] Error polling source ${source.id}:`, err.message);
    return { newEvents: 0, error: err.message };
  }
}

async function shouldPollSource(source: ProgramSource): Promise<boolean> {
  if (!source.enabled) return false;
  
  if (!source.lastPolledAt) return true;
  
  const lastPollTime = new Date(source.lastPolledAt).getTime();
  const now = Date.now();
  
  return (now - lastPollTime) >= MIN_POLL_INTERVAL_MS;
}

async function runScheduledPoll(): Promise<ScheduledPollSummary> {
  const startedAt = new Date();
  let programsPolled = 0;
  let sourcesPolled = 0;
  let totalNewEvents = 0;
  let errors = 0;

  console.log("[SCHEDULED-POLLER] Starting scheduled poll run...");

  try {
    const programs = await storage.getAllPrograms();
    const activePrograms = programs.filter(
      (p: Program) => p.status === "active"
    );

    console.log(`[SCHEDULED-POLLER] Found ${activePrograms.length} active program(s)`);

    for (const program of activePrograms) {
      const sources = await storage.getProgramSources(program.id);
      const enabledSources = sources.filter((s: ProgramSource) => s.enabled);
      
      if (enabledSources.length === 0) continue;

      console.log(`[SCHEDULED-POLLER] Polling ${enabledSources.length} source(s) for program: ${program.name}`);
      programsPolled++;

      for (const source of enabledSources) {
        const shouldPoll = await shouldPollSource(source);
        if (!shouldPoll) {
          console.log(`[SCHEDULED-POLLER] Skipping source ${source.id} - polled recently`);
          continue;
        }

        const result = await pollSource(source, program.id);
        sourcesPolled++;
        totalNewEvents += result.newEvents;
        
        if (result.error) {
          errors++;
          console.error(`[SCHEDULED-POLLER] Source ${source.id} error: ${result.error}`);
        } else {
          console.log(`[SCHEDULED-POLLER] Source ${source.id}: ${result.newEvents} new event(s)`);
        }

        await delay(RATE_LIMIT_DELAY_MS);
      }
    }
  } catch (err: any) {
    console.error("[SCHEDULED-POLLER] Fatal error during poll run:", err.message);
    errors++;
  }

  const completedAt = new Date();
  const duration = (completedAt.getTime() - startedAt.getTime()) / 1000;
  
  console.log(`[SCHEDULED-POLLER] Poll run complete in ${duration.toFixed(1)}s: ${programsPolled} programs, ${sourcesPolled} sources, ${totalNewEvents} new events, ${errors} errors`);

  return {
    programsPolled,
    sourcesPolled,
    totalNewEvents,
    errors,
    startedAt,
    completedAt,
  };
}

export function startScheduledPoller(): void {
  if (isRunning) {
    console.log("[SCHEDULED-POLLER] Already running");
    return;
  }

  isRunning = true;
  console.log(`[SCHEDULED-POLLER] Starting with ${POLL_INTERVAL_MS / 60000} minute interval`);

  async function pollLoop() {
    if (!isRunning) return;

    try {
      await runScheduledPoll();
    } catch (err: any) {
      console.error("[SCHEDULED-POLLER] Error in poll loop:", err.message);
    }

    if (isRunning) {
      pollTimeoutId = setTimeout(pollLoop, POLL_INTERVAL_MS);
    }
  }

  setTimeout(pollLoop, 5 * 60 * 1000);
}

export function stopScheduledPoller(): void {
  if (!isRunning) return;

  isRunning = false;
  if (pollTimeoutId) {
    clearTimeout(pollTimeoutId);
    pollTimeoutId = null;
  }
  console.log("[SCHEDULED-POLLER] Stopped");
}

export async function triggerManualPoll(): Promise<ScheduledPollSummary> {
  return runScheduledPoll();
}
