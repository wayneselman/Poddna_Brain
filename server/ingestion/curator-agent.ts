import { z } from "zod";
import { callGeminiJson, GeminiError } from "../ai/geminiClient";
import { storage } from "../storage";
import type { IngestionEvent, Program, Episode, Podcast } from "@shared/schema";
import { nanoid } from "nanoid";

// Schema for the agent output
const agentDecisionSchema = z.object({
  eventId: z.string(),
  action: z.enum(["catalog", "resolve", "ignore", "review"]),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
  constraintsChecked: z.object({
    withinCatalogLimit: z.boolean(),
    withinResolveLimit: z.boolean(),
  }),
});

const agentOutputSchema = z.object({
  decisions: z.array(agentDecisionSchema),
  summary: z.object({
    catalogCount: z.number(),
    resolveCount: z.number(),
    ignoreCount: z.number(),
    reviewCount: z.number().optional(),
    notes: z.string(),
  }),
});

export type AgentDecision = z.infer<typeof agentDecisionSchema>;
export type AgentOutput = z.infer<typeof agentOutputSchema>;

// Input types for the agent
interface EventInput {
  eventId: string;
  type: string;
  title: string;
  publishedAt: string | null;
  duration: number | null;
  sourceLabel: string | null;
  episodeExists: boolean;
  transcriptStatus: string | null;
  resolutionStatus: string | null;
  podcastHasYoutubeChannel: boolean;
}

interface AgentInput {
  programId: string;
  programName: string;
  budgets: {
    maxCatalogPerDay: number;
    remainingCatalog: number;
    maxResolvePerDay: number;
    remainingResolve: number;
  };
  filters: {
    languages?: string[];
    minDurationSec?: number;
    maxDurationSec?: number;
  };
  transcriptPrefs: {
    preferYouTube?: boolean;
    requireTranscript?: boolean;
  };
  events: EventInput[];
}

const CURATOR_PROMPT = `You are an AI curator for a podcast ingestion system. Your job is to analyze ingestion events and recommend actions.

## Decision Rules

**Recommend "catalog" when:**
- Event is new (no existing episode)
- Within catalog budget limit
- Matches program filters (if any)

**Recommend "resolve" when:**
- Episode already exists (episodeExists = true)
- Podcast has a YouTube channel (podcastHasYoutubeChannel = true)
- resolutionStatus is not "resolved"
- Within resolve budget limit

**Recommend "ignore" when:**
- Event is duplicate or already processed
- Outside program filters (duration, language)
- No remaining budget capacity
- Episode already fully resolved

**Recommend "review" when (rare):**
- Ambiguous metadata that humans should check
- Conflicting information

## Guidelines
- Be conservative: bias toward "ignore" over noisy recommendations
- High confidence (0.8+) for clear-cut cases
- Lower confidence (0.5-0.7) for edge cases
- Never exceed budget limits
- Keep reasons concise but informative

## Input
{INPUT_JSON}

## Output Format
Return a JSON object with this exact structure:
{
  "decisions": [
    {
      "eventId": "event-id",
      "action": "catalog" | "resolve" | "ignore" | "review",
      "confidence": 0.0-1.0,
      "reason": "Brief explanation",
      "constraintsChecked": {
        "withinCatalogLimit": true/false,
        "withinResolveLimit": true/false
      }
    }
  ],
  "summary": {
    "catalogCount": number,
    "resolveCount": number,
    "ignoreCount": number,
    "reviewCount": number,
    "notes": "Overall summary of decisions"
  }
}`;

async function buildEventInput(
  event: IngestionEvent,
  episodeCache: Map<string, Episode | null>,
  podcastCache: Map<string, Podcast | null>,
  sourceLabels: Map<string, string>
): Promise<EventInput> {
  const payload = event.payload as any;
  
  // Get episode if exists
  let episode: Episode | null = null;
  if (event.episodeId) {
    if (episodeCache.has(event.episodeId)) {
      episode = episodeCache.get(event.episodeId) || null;
    } else {
      episode = await storage.getEpisode(event.episodeId) || null;
      episodeCache.set(event.episodeId, episode);
    }
  }
  
  // Get podcast to check for YouTube channel
  let podcast: Podcast | null = null;
  const podcastId = episode?.podcastId || payload.podcastId;
  if (podcastId) {
    if (podcastCache.has(podcastId)) {
      podcast = podcastCache.get(podcastId) || null;
    } else {
      podcast = await storage.getPodcast(podcastId) || null;
      podcastCache.set(podcastId, podcast);
    }
  }
  
  return {
    eventId: event.id,
    type: event.type,
    title: payload.title || payload.episodeTitle || "Unknown",
    publishedAt: payload.pubDate || payload.publishedAt || null,
    duration: payload.duration || payload.durationSec || null,
    sourceLabel: sourceLabels.get(event.sourceId || "") || null,
    episodeExists: !!event.episodeId,
    transcriptStatus: episode?.transcriptStatus || null,
    resolutionStatus: event.actionStatus === "resolved" ? "resolved" : 
                       event.actionStatus === "resolution_queued" ? "queued" : "unresolved",
    podcastHasYoutubeChannel: !!(podcast?.youtubeChannelId),
  };
}

export interface CuratorAgentResult {
  success: boolean;
  agentRunId: string;
  output?: AgentOutput;
  recommendationsCreated: number;
  error?: string;
}

export async function runCuratorAgent(
  program: Program,
  options: {
    maxEvents?: number;
    recencyHours?: number;
  } = {}
): Promise<CuratorAgentResult> {
  const { maxEvents = 100, recencyHours = 72 } = options;
  const agentRunId = `run_${nanoid(12)}`;
  
  console.log(`[CURATOR-AGENT] Starting run ${agentRunId} for program ${program.id}`);
  
  try {
    // Parse program config
    const config = program.config as any || {};
    const budgets = config.budgets || {};
    const filters = config.filters || {};
    const transcriptPrefs = config.transcriptPrefs || {};
    
    const maxCatalogPerDay = budgets.maxCatalogPerDay ?? 50;
    const maxResolvePerDay = budgets.maxResolvePerDay ?? 20;
    
    // Get today's usage
    const dailyCounts = await storage.getDailyRecommendationCounts(program.id);
    const usedCatalog = dailyCounts.catalog || 0;
    const usedResolve = dailyCounts.tier1 || 0; // tier1 maps to resolve
    
    const remainingCatalog = Math.max(0, maxCatalogPerDay - usedCatalog);
    const remainingResolve = Math.max(0, maxResolvePerDay - usedResolve);
    
    console.log(`[CURATOR-AGENT] Budgets - Catalog: ${remainingCatalog}/${maxCatalogPerDay}, Resolve: ${remainingResolve}/${maxResolvePerDay}`);
    
    // Get unprocessed events (pending or cataloged but not resolved)
    const allEvents = await storage.getUnprocessedEvents(program.id, maxEvents);
    
    // Filter to recent events
    const cutoffTime = new Date(Date.now() - recencyHours * 60 * 60 * 1000);
    const recentEvents = allEvents.filter(e => new Date(e.observedAt) >= cutoffTime);
    
    console.log(`[CURATOR-AGENT] Found ${recentEvents.length} events within ${recencyHours}h window`);
    
    if (recentEvents.length === 0) {
      return {
        success: true,
        agentRunId,
        recommendationsCreated: 0,
        output: {
          decisions: [],
          summary: {
            catalogCount: 0,
            resolveCount: 0,
            ignoreCount: 0,
            reviewCount: 0,
            notes: "No events to process",
          },
        },
      };
    }
    
    // Get source labels for context
    const sources = await storage.getProgramSources(program.id);
    const sourceLabels = new Map(sources.map(s => [s.id, s.label || s.value]));
    
    // Build event inputs with caching
    const episodeCache = new Map<string, Episode | null>();
    const podcastCache = new Map<string, Podcast | null>();
    
    const eventInputs: EventInput[] = [];
    for (const event of recentEvents) {
      const input = await buildEventInput(event, episodeCache, podcastCache, sourceLabels);
      eventInputs.push(input);
    }
    
    // Build agent input
    const agentInput: AgentInput = {
      programId: program.id,
      programName: program.name,
      budgets: {
        maxCatalogPerDay,
        remainingCatalog,
        maxResolvePerDay,
        remainingResolve,
      },
      filters: {
        languages: filters.languages,
        minDurationSec: filters.minDurationSec,
        maxDurationSec: filters.maxDurationSec,
      },
      transcriptPrefs: {
        preferYouTube: transcriptPrefs.preferYouTube,
        requireTranscript: transcriptPrefs.requireTranscript,
      },
      events: eventInputs,
    };
    
    // Build prompt
    const prompt = CURATOR_PROMPT.replace("{INPUT_JSON}", JSON.stringify(agentInput, null, 2));
    
    console.log(`[CURATOR-AGENT] Calling Gemini with ${eventInputs.length} events...`);
    
    // Call Gemini with low temperature for consistency
    const output = await callGeminiJson(
      "gemini-2.5-flash",
      prompt,
      agentOutputSchema,
      { temperature: 0.2, maxOutputTokens: 8192 }
    );
    
    console.log(`[CURATOR-AGENT] Received ${output.decisions.length} decisions`);
    
    // Create recommendations in database
    const recommendations = output.decisions.map(decision => ({
      programId: program.id,
      eventId: decision.eventId,
      targetType: "episode" as const,
      targetId: decision.eventId, // Use eventId as target for now
      action: decision.action,
      confidence: decision.confidence,
      reason: decision.reason,
      status: "pending" as const,
      agentRunId,
      modelInfo: { provider: "gemini", model: "gemini-2.5-flash", version: "2.5" },
    }));
    
    if (recommendations.length > 0) {
      await storage.createRecommendations(recommendations);
      console.log(`[CURATOR-AGENT] Created ${recommendations.length} recommendations`);
    }
    
    // Update program's lastAgentRun
    await storage.updateProgramLastAgentRun(program.id);
    
    return {
      success: true,
      agentRunId,
      output,
      recommendationsCreated: recommendations.length,
    };
    
  } catch (err: any) {
    console.error(`[CURATOR-AGENT] Error in run ${agentRunId}:`, err);
    
    const errorMessage = err instanceof GeminiError 
      ? `AI error: ${err.message}` 
      : err.message || "Unknown error";
    
    return {
      success: false,
      agentRunId,
      recommendationsCreated: 0,
      error: errorMessage,
    };
  }
}
