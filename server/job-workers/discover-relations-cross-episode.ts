import { storage } from "../storage";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { callGeminiJson, GeminiError } from "../ai/geminiClient";
import { z } from "zod";
import type { Job } from "@shared/schema";

export interface CrossEpisodeRelationResult {
  candidatePairs: number;
  recurrencesFound: number;
  geminiValidated: number;
  geminiRejected: number;
  errors: number;
}

const COSINE_SIMILARITY_THRESHOLD = 0.82;
const ANN_CANDIDATES_PER_STATEMENT = 10;
const GEMINI_BATCH_SIZE = 20;
const MIN_GEMINI_CONFIDENCE = 0.7;

interface AnnCandidate {
  anchorId: string;
  anchorText: string;
  anchorEpisodeId: string;
  anchorStartTime: number;
  matchId: string;
  matchText: string;
  matchEpisodeId: string;
  matchStartTime: number;
  similarity: number;
}

const RecurrenceValidationResultSchema = z.object({
  results: z.array(z.object({
    pairId: z.string(),
    isRecurrence: z.boolean(),
    confidence: z.number().min(0).max(1),
  })),
});

function buildValidationPrompt(pairs: Array<{ pairId: string; textA: string; textB: string; episodeTitleA: string; episodeTitleB: string }>): string {
  const pairsJson = pairs.map(p => ({
    pairId: p.pairId,
    statementA: p.textA,
    statementB: p.textB,
    episodeA: p.episodeTitleA,
    episodeB: p.episodeTitleB,
  }));

  return `You are a recurrence detection API for podcast analysis.
You receive pairs of statements from DIFFERENT episodes. Determine if each pair represents the same idea/claim being repeated (recurrence) vs merely related or topically similar.

A "recurrence" means the speaker is making the SAME core point, claim, or recommendation in both episodes — even if worded differently. Paraphrases count. Minor elaboration counts.

NOT a recurrence:
- Statements on the same topic but making different points
- Complementary ideas that build on each other
- General platitudes that happen to overlap

Output JSON ONLY matching this shape:
{
  "results": [
    { "pairId": string, "isRecurrence": boolean, "confidence": number }
  ]
}

Rules:
- pairId MUST match the input pair ID exactly
- isRecurrence: true only if the core claim/idea is the SAME
- confidence: 0.0-1.0 certainty of your classification
- When in doubt, prefer false (not a recurrence)

JSON ONLY. No explanations. No markdown.

Pairs:
${JSON.stringify(pairsJson, null, 2)}`;
}

export async function handleDiscoverRelationsCrossEpisodeJob(
  job: Job,
  onProgress?: (message: string, percentage: number) => void
): Promise<CrossEpisodeRelationResult> {
  const rawResult = job.result;
  const payload: { episodeId?: string } = typeof rawResult === "string"
    ? ((() => { try { return JSON.parse(rawResult); } catch { return {}; } })())
    : ((rawResult as { episodeId?: string }) ?? {});
  const episodeId: string | undefined = payload.episodeId;

  if (!episodeId) {
    throw new GeminiError("Missing episodeId in job payload", false, "INVALID_PAYLOAD");
  }

  console.log(`[CROSS-EPISODE] Starting recurrence detection for episode ${episodeId}`);
  onProgress?.("Fetching episode info...", 5);

  const episode = await storage.getEpisode(episodeId);
  if (!episode) {
    throw new GeminiError(`Episode not found: ${episodeId}`, false, "NOT_FOUND");
  }

  const podcastId = episode.podcastId;

  onProgress?.("Finding semantically similar statements across episodes...", 10);

  const annResults = await db.execute(sql`
    WITH anchor_statements AS (
      SELECT s.id, s.text, s.episode_id, s.start_time, s.embedding_vector
      FROM statements s
      INNER JOIN statement_classifications sc ON sc.statement_id = s.id
      WHERE s.episode_id = ${episodeId}
        AND s.embedding_vector IS NOT NULL
        AND sc.claim_flag = true
    )
    SELECT
      a.id AS anchor_id,
      a.text AS anchor_text,
      a.episode_id AS anchor_episode_id,
      COALESCE(a.start_time, 0) AS anchor_start_time,
      m.id AS match_id,
      m.text AS match_text,
      m.episode_id AS match_episode_id,
      COALESCE(m.start_time, 0) AS match_start_time,
      1 - (a.embedding_vector <=> m.embedding_vector) AS similarity
    FROM anchor_statements a
    CROSS JOIN LATERAL (
      SELECT s2.id, s2.text, s2.episode_id, s2.start_time, s2.embedding_vector
      FROM statements s2
      INNER JOIN episodes e2 ON e2.id = s2.episode_id
      WHERE s2.episode_id != a.episode_id
        AND e2.podcast_id = ${podcastId}
        AND s2.embedding_vector IS NOT NULL
      ORDER BY s2.embedding_vector <=> a.embedding_vector
      LIMIT ${ANN_CANDIDATES_PER_STATEMENT}
    ) m
    WHERE 1 - (a.embedding_vector <=> m.embedding_vector) >= ${COSINE_SIMILARITY_THRESHOLD}
  `);

  const candidates = annResults.rows as unknown as Array<{
    anchor_id: string;
    anchor_text: string;
    anchor_episode_id: string;
    anchor_start_time: number;
    match_id: string;
    match_text: string;
    match_episode_id: string;
    match_start_time: number;
    similarity: number;
  }>;

  console.log(`[CROSS-EPISODE] Found ${candidates.length} candidate pairs above ${COSINE_SIMILARITY_THRESHOLD} threshold`);

  if (candidates.length === 0) {
    onProgress?.("No cross-episode matches found", 100);
    return { candidatePairs: 0, recurrencesFound: 0, geminiValidated: 0, geminiRejected: 0, errors: 0 };
  }

  onProgress?.("Checking topic overlap for candidates...", 25);

  const allStatementIds = Array.from(new Set([
    ...candidates.map(c => c.anchor_id),
    ...candidates.map(c => c.match_id),
  ]));
  const idsArray = `{${allStatementIds.map(id => `"${id}"`).join(",")}}`;

  const topicResults = await db.execute(sql`
    SELECT statement_id, topic_id
    FROM statement_topics
    WHERE statement_id = ANY(${idsArray}::text[])
  `);

  const topicsByStatement = new Map<string, Set<string>>();
  for (const row of topicResults.rows as Array<{ statement_id: string; topic_id: string }>) {
    if (!topicsByStatement.has(row.statement_id)) {
      topicsByStatement.set(row.statement_id, new Set());
    }
    topicsByStatement.get(row.statement_id)!.add(row.topic_id);
  }

  const filteredCandidates = candidates.filter(c => {
    const anchorTopics = topicsByStatement.get(c.anchor_id);
    const matchTopics = topicsByStatement.get(c.match_id);
    if (!anchorTopics || !matchTopics) return true;
    for (const t of anchorTopics) {
      if (matchTopics.has(t)) return true;
    }
    return false;
  });

  console.log(`[CROSS-EPISODE] After topic filter: ${filteredCandidates.length} candidates (from ${candidates.length})`);

  if (filteredCandidates.length === 0) {
    onProgress?.("No candidates passed topic overlap filter", 100);
    return { candidatePairs: candidates.length, recurrencesFound: 0, geminiValidated: 0, geminiRejected: 0, errors: 0 };
  }

  const deduped = new Map<string, typeof filteredCandidates[0]>();
  for (const c of filteredCandidates) {
    const key = [c.anchor_id, c.match_id].sort().join(":");
    const existing = deduped.get(key);
    if (!existing || c.similarity > existing.similarity) {
      deduped.set(key, c);
    }
  }
  const uniqueCandidates = Array.from(deduped.values());

  console.log(`[CROSS-EPISODE] Unique candidate pairs: ${uniqueCandidates.length}`);

  onProgress?.("Deleting existing cross-episode relations for this episode...", 30);
  try {
    const deleted = await storage.deleteRelationsForEpisode(episodeId, "cross_episode");
    console.log(`[CROSS-EPISODE] Deleted ${deleted} existing cross-episode relations`);
  } catch (err: any) {
    console.error(`[CROSS-EPISODE] Error deleting old relations:`, err.message);
  }

  const allEpisodeIds = Array.from(new Set([
    ...uniqueCandidates.map(c => c.anchor_episode_id),
    ...uniqueCandidates.map(c => c.match_episode_id),
  ]));
  const episodeTitles = new Map<string, string>();
  for (const epId of allEpisodeIds) {
    const ep = await storage.getEpisode(epId);
    if (ep) episodeTitles.set(epId, ep.title);
  }

  const batches: typeof uniqueCandidates[] = [];
  for (let i = 0; i < uniqueCandidates.length; i += GEMINI_BATCH_SIZE) {
    batches.push(uniqueCandidates.slice(i, i + GEMINI_BATCH_SIZE));
  }

  let geminiValidated = 0;
  let geminiRejected = 0;
  let recurrencesFound = 0;
  let errors = 0;

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx];
    const progress = 35 + Math.round((batchIdx / batches.length) * 55);
    onProgress?.(`Validating batch ${batchIdx + 1}/${batches.length} with AI...`, progress);

    const pairs = batch.map((c, idx) => ({
      pairId: `pair-${batchIdx * GEMINI_BATCH_SIZE + idx}`,
      textA: c.anchor_text,
      textB: c.match_text,
      episodeTitleA: episodeTitles.get(c.anchor_episode_id) || "Unknown",
      episodeTitleB: episodeTitles.get(c.match_episode_id) || "Unknown",
    }));

    const pairIdToCandidateMap = new Map<string, typeof batch[0]>();
    batch.forEach((c, idx) => {
      pairIdToCandidateMap.set(`pair-${batchIdx * GEMINI_BATCH_SIZE + idx}`, c);
    });

    try {
      const prompt = buildValidationPrompt(pairs);
      const response = await callGeminiJson(
        "gemini-2.5-flash",
        prompt,
        RecurrenceValidationResultSchema,
        { temperature: 0.1, maxOutputTokens: 4096 }
      );

      for (const result of response.results) {
        const candidate = pairIdToCandidateMap.get(result.pairId);
        if (!candidate) {
          console.warn(`[CROSS-EPISODE] Unknown pairId: ${result.pairId}`);
          continue;
        }

        if (!result.isRecurrence || result.confidence < MIN_GEMINI_CONFIDENCE) {
          geminiRejected++;
          continue;
        }

        geminiValidated++;

        const finalConfidence = Math.min(1, (candidate.similarity + result.confidence) / 2);

        try {
          await storage.upsertRelation({
            episodeId: candidate.anchor_episode_id,
            statementAId: candidate.anchor_id,
            statementBId: candidate.match_id,
            relation: "recurrence",
            scope: "cross_episode",
            confidence: finalConfidence,
          });
          recurrencesFound++;
        } catch (err: any) {
          console.error(`[CROSS-EPISODE] Failed to upsert relation:`, err.message);
          errors++;
        }
      }
    } catch (err: any) {
      console.error(`[CROSS-EPISODE] Batch ${batchIdx + 1} failed:`, err.message);
      if (err instanceof GeminiError && !err.transient) {
        throw err;
      }
      errors += batch.length;
    }
  }

  onProgress?.("Cross-episode recurrence detection complete", 100);

  console.log(`[CROSS-EPISODE] Complete: ${recurrencesFound} recurrences found (validated=${geminiValidated}, rejected=${geminiRejected}, errors=${errors})`);

  return {
    candidatePairs: uniqueCandidates.length,
    recurrencesFound,
    geminiValidated,
    geminiRejected,
    errors,
  };
}
