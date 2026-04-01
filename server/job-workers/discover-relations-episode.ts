import { storage } from "../storage";
import { callGeminiJson, GeminiError } from "../ai/geminiClient";
import { z } from "zod";
import type { Job } from "@shared/schema";

export interface RelationDiscoveryJobResult {
  candidatePairs: number;
  relationsFound: number;
  supportsCount: number;
  contradictsCount: number;
  extendsCount: number;
  unrelatedCount: number;
}

const ANCHOR_CANDIDATES_MAX = 15;
const TIME_WINDOW_MS = 10 * 60 * 1000;
const BATCH_SIZE = 12;

const RelationResultSchema = z.object({
  id: z.string(),
  relation: z.enum(["supports", "contradicts", "extends", "unrelated"]),
  confidence: z.number().min(0).max(1),
});

const RelationBatchResponseSchema = z.object({
  results: z.array(RelationResultSchema),
});

interface StatementWithContext {
  id: string;
  text: string;
  startTime: number;
  claimFlag: boolean;
  topicIds: string[];
  canonicalEntityIds: string[];
}

interface CandidatePair {
  id: string;
  statementA: StatementWithContext;
  statementB: StatementWithContext;
}

function hasOverlap(setA: string[], setB: string[]): boolean {
  const aSet = new Set(setA);
  return setB.some(b => aSet.has(b));
}

function generateCandidatePairs(statements: StatementWithContext[]): CandidatePair[] {
  const anchors = statements.filter(s => s.claimFlag);
  const pairs: CandidatePair[] = [];
  const seenPairs = new Set<string>();

  for (const anchor of anchors) {
    const candidates: Array<{ statement: StatementWithContext; score: number }> = [];

    for (const stmt of statements) {
      if (stmt.id === anchor.id) continue;
      if (stmt.startTime <= anchor.startTime) continue;

      const topicOverlap = hasOverlap(anchor.topicIds, stmt.topicIds);
      const entityOverlap = hasOverlap(anchor.canonicalEntityIds, stmt.canonicalEntityIds);

      if (!topicOverlap && !entityOverlap) continue;

      const timeDiff = Math.abs(stmt.startTime - anchor.startTime);
      const withinWindow = timeDiff <= TIME_WINDOW_MS;

      const overlapCount = 
        (topicOverlap ? anchor.topicIds.filter(t => stmt.topicIds.includes(t)).length : 0) +
        (entityOverlap ? anchor.canonicalEntityIds.filter(e => stmt.canonicalEntityIds.includes(e)).length : 0);

      const score = (withinWindow ? 100 : 0) + overlapCount * 10 - (timeDiff / 60000);

      candidates.push({ statement: stmt, score });
    }

    candidates.sort((a, b) => b.score - a.score);
    const topCandidates = candidates.slice(0, ANCHOR_CANDIDATES_MAX);

    for (const { statement } of topCandidates) {
      const pairKey = `${anchor.id}:${statement.id}`;
      if (seenPairs.has(pairKey)) continue;
      seenPairs.add(pairKey);

      pairs.push({
        id: `pair-${pairs.length + 1}`,
        statementA: anchor,
        statementB: statement,
      });
    }
  }

  return pairs;
}

function buildBatchPrompt(episodeTitle: string, pairs: CandidatePair[]): string {
  const pairsJson = pairs.map(p => ({
    id: p.id,
    statementA: p.statementA.text,
    statementB: p.statementB.text,
  }));

  return `You are a statement relation classifier API.
Input: pairs of podcast statements from "${episodeTitle}".
Output: JSON ONLY, matching this TypeScript shape:

type RelationResult = {
  id: string;
  relation: "supports" | "contradicts" | "extends" | "unrelated";
  confidence: number;
};

type RelationOutput = {
  results: RelationResult[];
};

Field definitions:
- id: MUST match the pair ID from input
- relation: how statementB relates to statementA
- confidence: 0.0-1.0 certainty of classification

Relation types:
- supports: B provides evidence, examples, or reinforcement for A
- contradicts: B directly conflicts with, negates, or counters A
- extends: B adds new information, elaborates, or builds upon A
- unrelated: no meaningful semantic relationship

Rules:
- Consider meaning and intent, not just keywords
- "contradicts" only for genuine conflicts
- "supports" requires B to strengthen A
- "extends" for nuance, detail, or new dimensions
- When in doubt, prefer "unrelated"

JSON ONLY. No explanations. No markdown.

Pairs:
${JSON.stringify(pairsJson, null, 2)}`;
}

export async function handleDiscoverRelationsEpisodeJob(
  job: Job,
  onProgress?: (message: string, percentage: number) => void
): Promise<RelationDiscoveryJobResult> {
  const payload = job.result as { episodeId: string } | null;
  if (!payload?.episodeId) {
    throw new GeminiError("Missing episodeId in job payload", false, "INVALID_PAYLOAD");
  }

  const episodeId = payload.episodeId;
  console.log(`[DISCOVER-RELATIONS] Starting for episode ${episodeId}`);

  onProgress?.("Fetching episode data...", 5);

  const episode = await storage.getEpisode(episodeId);
  if (!episode) {
    throw new GeminiError(`Episode not found: ${episodeId}`, false, "NOT_FOUND");
  }

  onProgress?.("Fetching statements with context...", 10);

  let statements: StatementWithContext[];
  try {
    statements = await storage.getStatementsWithRelationContext(episodeId);
  } catch (err: any) {
    throw new GeminiError(`Storage error: ${err.message}`, true, "STORAGE_ERROR");
  }

  if (statements.length === 0) {
    console.log("[DISCOVER-RELATIONS] No statements found for episode");
    return {
      candidatePairs: 0,
      relationsFound: 0,
      supportsCount: 0,
      contradictsCount: 0,
      extendsCount: 0,
      unrelatedCount: 0,
    };
  }

  const claimCount = statements.filter(s => s.claimFlag).length;
  console.log(`[DISCOVER-RELATIONS] Found ${statements.length} statements, ${claimCount} claims`);

  if (claimCount === 0) {
    console.log("[DISCOVER-RELATIONS] No claims found - skipping relation discovery");
    return {
      candidatePairs: 0,
      relationsFound: 0,
      supportsCount: 0,
      contradictsCount: 0,
      extendsCount: 0,
      unrelatedCount: 0,
    };
  }

  onProgress?.("Generating candidate pairs...", 15);

  const candidatePairs = generateCandidatePairs(statements);
  console.log(`[DISCOVER-RELATIONS] Generated ${candidatePairs.length} candidate pairs`);

  if (candidatePairs.length === 0) {
    console.log("[DISCOVER-RELATIONS] No candidate pairs - no topic/entity overlap");
    return {
      candidatePairs: 0,
      relationsFound: 0,
      supportsCount: 0,
      contradictsCount: 0,
      extendsCount: 0,
      unrelatedCount: 0,
    };
  }

  onProgress?.("Deleting existing intra-episode relations...", 20);
  
  try {
    const deleted = await storage.deleteRelationsForEpisode(episodeId, "intra_episode");
    console.log(`[DISCOVER-RELATIONS] Deleted ${deleted} existing relations`);
  } catch (err: any) {
    throw new GeminiError(`Error deleting relations: ${err.message}`, true, "STORAGE_ERROR");
  }

  const batches: CandidatePair[][] = [];
  for (let i = 0; i < candidatePairs.length; i += BATCH_SIZE) {
    batches.push(candidatePairs.slice(i, i + BATCH_SIZE));
  }

  let supportsCount = 0;
  let contradictsCount = 0;
  let extendsCount = 0;
  let unrelatedCount = 0;
  let relationsFound = 0;

  const pairIdMap = new Map<string, CandidatePair>();
  for (const pair of candidatePairs) {
    pairIdMap.set(pair.id, pair);
  }

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx];
    const progress = 25 + Math.round((batchIdx / batches.length) * 70);
    onProgress?.(`Processing batch ${batchIdx + 1}/${batches.length}...`, progress);

    const prompt = buildBatchPrompt(episode.title, batch);

    let response: z.infer<typeof RelationBatchResponseSchema>;
    try {
      response = await callGeminiJson(
        "gemini-2.5-flash",
        prompt,
        RelationBatchResponseSchema,
        { temperature: 0.2, maxOutputTokens: 4096 }
      );
    } catch (err: any) {
      console.error(`[DISCOVER-RELATIONS] Batch ${batchIdx + 1} failed:`, err.message);
      if (err instanceof GeminiError) throw err;
      throw new GeminiError(`Gemini API error: ${err.message}`, true, "GEMINI_ERROR");
    }

    for (const result of response.results) {
      const pair = pairIdMap.get(result.id);
      if (!pair) {
        console.warn(`[DISCOVER-RELATIONS] Unknown pair ID: ${result.id}`);
        continue;
      }

      if (result.relation === "unrelated") {
        unrelatedCount++;
        continue;
      }

      const confidence = Math.max(0, Math.min(1, result.confidence));

      try {
        await storage.upsertRelation({
          episodeId,
          statementAId: pair.statementA.id,
          statementBId: pair.statementB.id,
          relation: result.relation,
          scope: "intra_episode",
          confidence,
        });
        relationsFound++;

        switch (result.relation) {
          case "supports": supportsCount++; break;
          case "contradicts": contradictsCount++; break;
          case "extends": extendsCount++; break;
        }
      } catch (err: any) {
        console.error(`[DISCOVER-RELATIONS] Failed to upsert relation:`, err.message);
      }
    }
  }

  onProgress?.("Relation discovery complete", 100);

  console.log(`[DISCOVER-RELATIONS] Complete: ${relationsFound} relations (supports=${supportsCount}, contradicts=${contradictsCount}, extends=${extendsCount}, unrelated=${unrelatedCount})`);

  return {
    candidatePairs: candidatePairs.length,
    relationsFound,
    supportsCount,
    contradictsCount,
    extendsCount,
    unrelatedCount,
  };
}
