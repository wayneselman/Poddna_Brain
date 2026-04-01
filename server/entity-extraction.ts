import { storage } from "./storage";
import { callGeminiJson, GeminiError } from "./ai/geminiClient";
import { AiEntitiesResponseSchema, type AiEntity } from "./ai/schemas";
import type { InsertEntity, InsertEntityMention } from "@shared/schema";

export interface ExtractedEntity {
  name: string;
  type: "product" | "book" | "restaurant" | "venue" | "service" | "software" | "other";
  description: string;
  mentionContext: string;
  confidence: number;
  suggestedAffiliateType?: "amazon" | "opentable" | "booking" | "yelp" | "custom" | null;
}

export interface ExtractionResult {
  entities: ExtractedEntity[];
  success: boolean;
  error?: string;
}

export async function extractEntitiesFromTranscript(
  episodeId: string,
  transcriptText: string
): Promise<ExtractionResult> {
  try {
    console.log(`[ENTITY EXTRACTION] Starting entity extraction for episode: ${episodeId}`);
    console.log(`[ENTITY EXTRACTION] Transcript length: ${transcriptText.length} characters`);

    if (transcriptText.length < 100) {
      console.log(`[ENTITY EXTRACTION] Transcript too short, skipping extraction`);
      return { entities: [], success: true };
    }

    const truncatedText = transcriptText.slice(0, 30000);

    const prompt = `You are an entity extraction API.
Input: a podcast transcript.
Output: JSON ONLY, matching this TypeScript shape:

type Entity = {
  name: string;
  type: "product" | "book" | "restaurant" | "venue" | "service" | "software" | "other";
  description: string;
  mentionContext: string;
  confidence: number;
  suggestedAffiliateType: "amazon" | "opentable" | "booking" | "yelp" | "custom" | null;
};

type EntityOutput = Entity[];

Field definitions:
- name: exact name of the product/book/restaurant/etc
- type: entity category
- description: brief description of what it is
- mentionContext: relevant quote where mentioned (max 200 chars)
- confidence: 0.0-1.0 certainty this is a real entity
- suggestedAffiliateType: amazon (products/books), opentable (restaurants), booking (hotels/venues), yelp (local businesses), custom (other services), null (not monetizable)

Focus on:
- Books by title and author
- Specific products, brands, tools
- Restaurants or cafes by name
- Hotels, venues, locations
- Software, apps, services
- Companies or brands

Skip generic mentions like "a book" or "some restaurant" - only specific named entities.

JSON ONLY. No explanations. No markdown.

Transcript:
${truncatedText}`;

    const rawEntities = await callGeminiJson(
      "gemini-2.5-flash",
      prompt,
      AiEntitiesResponseSchema,
      { maxOutputTokens: 4096 }
    );

    const entities: ExtractedEntity[] = rawEntities
      .filter((e) => e.confidence >= 0.5)
      .map((e) => ({
        name: e.name.trim(),
        type: e.type,
        description: e.description.trim(),
        mentionContext: e.mentionContext.slice(0, 500),
        confidence: e.confidence,
        suggestedAffiliateType: e.suggestedAffiliateType ?? null,
      }));

    console.log(`[ENTITY EXTRACTION] Extracted ${entities.length} entities from episode ${episodeId}`);

    return {
      entities,
      success: true
    };

  } catch (error: any) {
    console.error("[ENTITY EXTRACTION ERROR]", error);
    
    // Re-throw GeminiErrors so job runner can classify them
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

export async function processAndStoreEntities(
  episodeId: string,
  extractedEntities: ExtractedEntity[]
): Promise<{ created: number; linked: number }> {
  let created = 0;
  let linked = 0;

  for (const extracted of extractedEntities) {
    try {
      let entity = await storage.getEntityByName(extracted.name);
      
      if (!entity) {
        const newEntity: InsertEntity = {
          name: extracted.name,
          type: extracted.type,
          description: extracted.description,
          affiliateNetwork: extracted.suggestedAffiliateType,
          affiliateUrl: null,
          isActive: true
        };
        entity = await storage.createEntity(newEntity);
        created++;
        console.log(`[ENTITY EXTRACTION] Created new entity: ${entity.name}`);
      }

      const existingMention = await storage.getEntityMentionByEpisodeAndEntity(
        episodeId,
        entity.id
      );

      if (!existingMention) {
        const mention: InsertEntityMention = {
          episodeId,
          entityId: entity.id,
          mentionText: extracted.mentionContext,
          isAutoExtracted: true,
          isApproved: false,
          displayOrder: 0
        };
        await storage.createEntityMention(mention);
        linked++;
        console.log(`[ENTITY EXTRACTION] Linked entity "${entity.name}" to episode ${episodeId}`);
      }

    } catch (error) {
      console.error(`[ENTITY EXTRACTION] Error processing entity "${extracted.name}":`, error);
    }
  }

  console.log(`[ENTITY EXTRACTION] Complete: ${created} entities created, ${linked} mentions added`);
  return { created, linked };
}

export async function extractAndStoreEntitiesForEpisode(
  episodeId: string,
  transcriptText: string
): Promise<{ success: boolean; created: number; linked: number; error?: string }> {
  const result = await extractEntitiesFromTranscript(episodeId, transcriptText);
  
  if (!result.success) {
    return { success: false, created: 0, linked: 0, error: result.error };
  }

  if (result.entities.length === 0) {
    return { success: true, created: 0, linked: 0 };
  }

  const { created, linked } = await processAndStoreEntities(episodeId, result.entities);
  
  return { success: true, created, linked };
}
