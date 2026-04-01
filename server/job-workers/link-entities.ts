import { storage } from "../storage";
import { callGeminiJson, GeminiError } from "../ai/geminiClient";
import { z } from "zod";
import type { Job, EntityMentionWithDetails, CanonicalEntityType, InsertCanonicalEntity, InsertEntityLink } from "@shared/schema";

export interface LinkEntitiesJobResult {
  linked: number;
  created: number;
  totalMentions: number;
  unlinked: number;
}

const BATCH_SIZE = 10;

const EntityTypeMapping: Record<string, CanonicalEntityType> = {
  product: "product",
  book: "book",
  restaurant: "company",
  venue: "place",
  service: "company",
  app: "product",
  other: "other",
};

const AiEntityLinkSchema = z.object({
  canonicalName: z.string(),
  type: z.enum(["person", "product", "book", "company", "place", "concept", "other"]),
  confidence: z.number().min(0).max(1),
});

const AiEntityLinkBatchResponseSchema = z.object({
  entities: z.array(z.object({
    mentionId: z.string(),
    canonicalName: z.string(),
    type: z.enum(["person", "product", "book", "company", "place", "concept", "other"]),
    confidence: z.number().min(0).max(1),
  })),
});

function mapEntityType(monetizationType: string): CanonicalEntityType {
  return EntityTypeMapping[monetizationType] || "other";
}

function buildPrompt(mentions: EntityMentionWithDetails[]): string {
  const mentionsText = mentions.map(m => 
    `[${m.id}] Entity: "${m.entity.name}" (type: ${m.entity.type})${m.mentionText ? `, context: "${m.mentionText}"` : ""}`
  ).join("\n");

  return `You are an entity canonicalization API.
Input: a list of entity mentions from a podcast.
Output: JSON ONLY, matching this TypeScript shape:

type EntityLink = {
  mentionId: string;
  canonicalName: string;
  type: "person" | "product" | "book" | "company" | "place" | "concept" | "other";
  confidence: number;
};

type EntityLinkOutput = {
  entities: EntityLink[];
};

Field definitions:
- mentionId: MUST match the [ID] shown in input
- canonicalName: proper casing, full name without abbreviations
- type: semantic type (person=individuals, product=software/gadgets, book=publications, company=brands/orgs, place=locations, concept=ideas/theories, other)
- confidence: 0.0-1.0 certainty of canonicalization

JSON ONLY. No explanations. No markdown.

Entity mentions:
${mentionsText}`;
}

export async function handleLinkEntitiesJob(
  job: Job,
  onProgress?: (message: string, percentage: number) => void
): Promise<LinkEntitiesJobResult> {
  console.log(`[LINK-ENTITIES] Starting job ${job.id}`);

  let source;
  try {
    source = await storage.getEpisodeSource(job.episodeSourceId);
  } catch (err: any) {
    throw new GeminiError(`Storage error fetching episode source: ${err.message}`, true, "STORAGE_ERROR");
  }

  if (!source) {
    throw new GeminiError(`Episode source not found: ${job.episodeSourceId}`, false, "NOT_FOUND");
  }

  const episodeId = source.episodeId;

  let mentions: EntityMentionWithDetails[];
  try {
    mentions = await storage.getEntityMentionsByEpisode(episodeId);
  } catch (err: any) {
    throw new GeminiError(`Storage error fetching entity mentions: ${err.message}`, true, "STORAGE_ERROR");
  }

  if (mentions.length === 0) {
    console.log(`[LINK-ENTITIES] No entity mentions found for episode ${episodeId}`);
    return { linked: 0, created: 0, totalMentions: 0, unlinked: 0 };
  }

  onProgress?.(`Linking ${mentions.length} entity mentions...`, 10);
  console.log(`[LINK-ENTITIES] Processing ${mentions.length} mentions`);

  let linked = 0;
  let created = 0;
  const linkedMentionIds = new Set<string>();

  const mentionsNeedingAI: EntityMentionWithDetails[] = [];

  for (const mention of mentions) {
    const mappedType = mapEntityType(mention.entity.type);
    
    try {
      const existing = await storage.findCanonicalEntityByNameAndType(mention.entity.name, mappedType);
      
      if (existing) {
        await storage.linkMentionToCanonical({
          mentionId: mention.id,
          canonicalId: existing.id,
          method: "exact-match",
          confidence: 0.95,
        });
        linked++;
        linkedMentionIds.add(mention.id);
        console.log(`[LINK-ENTITIES] Exact match: "${mention.entity.name}" → canonical ${existing.id}`);
      } else {
        mentionsNeedingAI.push(mention);
      }
    } catch (err: any) {
      console.warn(`[LINK-ENTITIES] Error checking exact match for mention ${mention.id}:`, err.message);
      mentionsNeedingAI.push(mention);
    }
  }

  const exactMatchProgress = 10 + Math.floor((linked / mentions.length) * 30);
  onProgress?.(`Exact matched ${linked}/${mentions.length}, ${mentionsNeedingAI.length} need AI...`, exactMatchProgress);
  console.log(`[LINK-ENTITIES] Exact matched: ${linked}, need AI: ${mentionsNeedingAI.length}`);

  if (mentionsNeedingAI.length > 0) {
    const totalBatches = Math.ceil(mentionsNeedingAI.length / BATCH_SIZE);

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const startIdx = batchIndex * BATCH_SIZE;
      const endIdx = Math.min(startIdx + BATCH_SIZE, mentionsNeedingAI.length);
      const batchMentions = mentionsNeedingAI.slice(startIdx, endIdx);

      const progress = 40 + Math.floor((batchIndex / totalBatches) * 50);
      onProgress?.(`AI linking batch ${batchIndex + 1}/${totalBatches}...`, progress);

      console.log(`[LINK-ENTITIES] AI batch ${batchIndex + 1}/${totalBatches} (${batchMentions.length} mentions)`);

      try {
        const prompt = buildPrompt(batchMentions);
        const response = await callGeminiJson(
          "gemini-2.5-flash",
          prompt,
          AiEntityLinkBatchResponseSchema,
          { temperature: 0.2, maxOutputTokens: 4096 }
        );

        const validMentionIds = new Set(batchMentions.map(m => m.id));

        for (const aiEntity of response.entities) {
          if (!validMentionIds.has(aiEntity.mentionId)) {
            console.warn(`[LINK-ENTITIES] Skipping unknown mentionId: ${aiEntity.mentionId}`);
            continue;
          }

          try {
            let canonical = await storage.findCanonicalEntityByNameAndType(
              aiEntity.canonicalName,
              aiEntity.type
            );

            if (!canonical) {
              canonical = await storage.createCanonicalEntity({
                name: aiEntity.canonicalName,
                type: aiEntity.type,
              });
              created++;
              console.log(`[LINK-ENTITIES] Created canonical: "${aiEntity.canonicalName}" (${aiEntity.type})`);
            }

            await storage.linkMentionToCanonical({
              mentionId: aiEntity.mentionId,
              canonicalId: canonical.id,
              method: "ai-assisted",
              confidence: aiEntity.confidence,
            });
            linked++;
            linkedMentionIds.add(aiEntity.mentionId);
          } catch (err: any) {
            console.warn(`[LINK-ENTITIES] Error linking mention ${aiEntity.mentionId}:`, err.message);
          }
        }

        console.log(`[LINK-ENTITIES] Batch ${batchIndex + 1}: processed ${response.entities.length} entities`);
      } catch (err: any) {
        if (err instanceof GeminiError) {
          throw err;
        }
        console.error(`[LINK-ENTITIES] Error processing batch ${batchIndex + 1}:`, err.message);
        throw new GeminiError(`AI processing error: ${err.message}`, true, "AI_ERROR");
      }
    }
  }

  const unlinkedMentions = mentions.filter(m => !linkedMentionIds.has(m.id));
  const unlinked = unlinkedMentions.length;
  
  if (unlinked > 0) {
    console.warn(`[LINK-ENTITIES] ${unlinked} mentions could not be linked:`, 
      unlinkedMentions.map(m => m.entity.name).join(", "));
  }

  onProgress?.("Entity linking complete", 100);
  console.log(`[LINK-ENTITIES] Completed: linked ${linked}, created ${created} canonicals, unlinked ${unlinked} for episode ${episodeId}`);

  return {
    linked,
    created,
    totalMentions: mentions.length,
    unlinked,
  };
}
