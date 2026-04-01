import { storage } from "../storage";
import { callGeminiJson, GeminiError } from "../ai/geminiClient";
import { AffiliateEntitiesResponseSchema, type AffiliateEntity } from "../ai/schemas";
import type { InsertEntity, InsertEntityMention } from "@shared/schema";

export interface ExtractedAffiliateEntity {
  name: string;
  type: "product" | "book" | "software" | "service" | "company" | "tool" | "framework" | "platform" | "app" | "community" | "newsletter" | "podcast" | "course" | "other";
  category: string;
  description: string;
  quote: string;
  speaker: string;
  context: string;
  sentiment: "positive" | "neutral" | "negative";
  confidence: number;
  timestamp?: number;
  segmentIndex?: number;
  hasAffiliateProgram: boolean;
}

export interface AffiliateExtractionResult {
  entities: ExtractedAffiliateEntity[];
  success: boolean;
  error?: string;
}

interface TranscriptSegmentForExtraction {
  index: number;
  text: string;
  speaker: string | null;
  startTime: number | null;
}

export async function extractAffiliateEntitiesFromTranscript(
  episodeId: string,
  segments: TranscriptSegmentForExtraction[],
  episodeTitle: string,
  podcastTitle: string
): Promise<AffiliateExtractionResult> {
  try {
    console.log(`[AFFILIATE EXTRACTION] Starting for episode: ${episodeId}`);
    console.log(`[AFFILIATE EXTRACTION] Processing ${segments.length} segments`);

    if (segments.length < 5) {
      console.log(`[AFFILIATE EXTRACTION] Too few segments, skipping`);
      return { entities: [], success: true };
    }

    const formattedTranscript = segments
      .map((s, i) => `[${i}] ${s.speaker || 'Unknown'} (${Math.floor((s.startTime || 0) / 60)}:${String((s.startTime || 0) % 60).padStart(2, '0')}): ${s.text}`)
      .join('\n');

    const truncatedTranscript = formattedTranscript.slice(0, 50000);

    const prompt = `You are an entity extraction API for affiliate marketing.
Input: A podcast transcript from "${podcastTitle}" - Episode: "${episodeTitle}"
Output: JSON array of products, tools, books, and services mentioned that could have affiliate programs.

For EACH entity found, extract:
- name: Canonical product/tool name (e.g., "Notion", "ChatGPT", "Atomic Habits")
- type: product | book | software | service | company | tool | framework | platform | app | other
- category: productivity | ai | marketing | finance | health | education | development | other
- description: What it is in 1 sentence
- quote: EXACT 8-15 word quote from transcript where mentioned (copy verbatim)
- speaker: Who mentioned it (extract from transcript, e.g., "Marina Mogilko" or "Guest")
- context: Why/how they use it (1 sentence, e.g., "Uses for team documentation")
- sentiment: positive | neutral | negative
- confidence: 0.0-1.0 how certain this is a real product/tool
- segmentIndex: Which [index] number the quote is from
- hasAffiliateProgram: true if likely has affiliate program (SaaS, books, major products)

Focus on:
1. SaaS products/tools (Notion, Linear, Figma, Superhuman, etc.)
2. AI tools (ChatGPT, Claude, Midjourney, etc.)
3. Books by specific title
4. Productivity apps
5. Development tools (GitHub, Replit, VS Code, etc.)
6. Marketing tools
7. Finance/investing tools

SKIP:
- Generic mentions ("an app", "some tool")
- The podcast itself
- Social media platforms unless used as tools (LinkedIn for sales is ok)
- Basic utilities (email, calendar unless specific product)

Return JSON array only. No markdown, no explanations.

Transcript:
${truncatedTranscript}`;

    const rawEntities = await callGeminiJson(
      "gemini-2.5-flash",
      prompt,
      AffiliateEntitiesResponseSchema,
      { maxOutputTokens: 8192 }
    );

    const entities: ExtractedAffiliateEntity[] = rawEntities
      .filter((e) => e.confidence >= 0.5)
      .map((e) => {
        const segmentIdx = e.segmentIndex ?? 0;
        const timestamp = segments[segmentIdx]?.startTime ?? undefined;
        
        return {
          name: e.name.trim(),
          type: e.type,
          category: e.category || "other",
          description: e.description || "",
          quote: e.quote.slice(0, 300),
          speaker: e.speaker || "Unknown",
          context: e.context || "",
          sentiment: e.sentiment || "neutral",
          confidence: e.confidence,
          timestamp,
          segmentIndex: segmentIdx,
          hasAffiliateProgram: e.hasAffiliateProgram ?? false,
        };
      });

    console.log(`[AFFILIATE EXTRACTION] Found ${entities.length} entities for episode ${episodeId}`);
    
    return {
      entities,
      success: true
    };

  } catch (error: any) {
    console.error("[AFFILIATE EXTRACTION ERROR]", error);
    
    if (error instanceof GeminiError) {
      throw error;
    }
    
    return {
      entities: [],
      success: false,
      error: error.message
    };
  }
}

function mapTypeToEntityType(type: string): "product" | "book" | "restaurant" | "venue" | "service" | "app" | "other" {
  switch (type) {
    case "product":
    case "software":
    case "tool":
      return "product";
    case "book":
      return "book";
    case "service":
      return "service";
    case "framework":
    case "company":
    case "other":
    default:
      return "other";
  }
}

function mapTypeToAffiliateNetwork(type: string, hasAffiliateProgram: boolean): string | null {
  if (!hasAffiliateProgram) return null;
  
  switch (type) {
    case "book":
      return "amazon";
    case "software":
    case "tool":
    case "service":
      return "custom";
    default:
      return null;
  }
}

export async function processAndStoreAffiliateEntities(
  episodeId: string,
  extractedEntities: ExtractedAffiliateEntity[]
): Promise<{ created: number; linked: number }> {
  let created = 0;
  let linked = 0;

  for (const extracted of extractedEntities) {
    try {
      let entity = await storage.getEntityByName(extracted.name);
      
      if (!entity) {
        const newEntity: InsertEntity = {
          name: extracted.name,
          type: mapTypeToEntityType(extracted.type),
          description: extracted.description,
          affiliateNetwork: mapTypeToAffiliateNetwork(extracted.type, extracted.hasAffiliateProgram),
          affiliateUrl: null,
          isActive: true,
          isVerified: false,
        };
        entity = await storage.createEntity(newEntity);
        created++;
        console.log(`[AFFILIATE EXTRACTION] Created entity: ${entity.name} (${entity.type})`);
      }

      const existingMention = await storage.getEntityMentionByEpisodeAndEntity(
        episodeId,
        entity.id
      );

      if (!existingMention) {
        const structuredMention = {
          quote: extracted.quote,
          speaker: extracted.speaker,
          context: extracted.context,
          sentiment: extracted.sentiment,
          confidence: extracted.confidence,
        };
        const mentionText = JSON.stringify(structuredMention);
        
        const mention: InsertEntityMention = {
          episodeId,
          entityId: entity.id,
          mentionText,
          timestamp: extracted.timestamp ?? null,
          isAutoExtracted: true,
          isApproved: false,
          displayOrder: 0,
        };
        await storage.createEntityMention(mention);
        linked++;
        console.log(`[AFFILIATE EXTRACTION] Linked "${entity.name}" to episode with quote: "${extracted.quote.slice(0, 50)}..."`);
      }

    } catch (error) {
      console.error(`[AFFILIATE EXTRACTION] Error processing entity "${extracted.name}":`, error);
    }
  }

  console.log(`[AFFILIATE EXTRACTION] Complete: ${created} entities created, ${linked} mentions added`);
  return { created, linked };
}

export async function extractAndStoreAffiliateEntitiesForEpisode(
  episodeId: string
): Promise<{ success: boolean; created: number; linked: number; error?: string }> {
  const episode = await storage.getEpisode(episodeId);
  if (!episode) {
    return { success: false, created: 0, linked: 0, error: "Episode not found" };
  }

  const podcast = await storage.getPodcast(episode.podcastId);
  if (!podcast) {
    return { success: false, created: 0, linked: 0, error: "Podcast not found" };
  }

  const segments = await storage.getSegmentsByEpisode(episodeId);
  if (segments.length === 0) {
    return { success: false, created: 0, linked: 0, error: "No transcript segments found" };
  }

  const formattedSegments: TranscriptSegmentForExtraction[] = segments.map((s: { text: string; speaker: string | null; startTime: number }, i: number) => ({
    index: i,
    text: s.text,
    speaker: s.speaker,
    startTime: s.startTime,
  }));

  const result = await extractAffiliateEntitiesFromTranscript(
    episodeId,
    formattedSegments,
    episode.title,
    podcast.title
  );
  
  if (!result.success) {
    return { success: false, created: 0, linked: 0, error: result.error };
  }

  if (result.entities.length === 0) {
    return { success: true, created: 0, linked: 0 };
  }

  const { created, linked } = await processAndStoreAffiliateEntities(episodeId, result.entities);
  
  return { success: true, created, linked };
}
