import { storage } from "../storage";
import { callClaudeJson, ClaudeError } from "../ai/claudeClient";
import { z } from "zod";
import type { Job } from "@shared/schema";
import { db } from "../db";
import { sql } from "drizzle-orm";

export interface DetectContradictionsJobResult {
  intraContradictions: number;
  crossContradictions: number;
  pairsAnalyzed: number;
}

const BATCH_SIZE = 20;
const MIN_CONFIDENCE = 0.7;
const CROSS_EPISODE_SIMILARITY_THRESHOLD = 0.75;
const CROSS_EPISODE_LIMIT = 100;
const MIN_STATEMENTS = 5;

interface ClassifiedStatement {
  id: string;
  text: string;
  start_time: number;
  speaker: string | null;
  certainty: number | null;
  polarity: string | null;
}

const IntraContradictionSchema = z.object({
  contradictions: z.array(z.object({
    statementAId: z.string(),
    statementBId: z.string(),
    explanation: z.string(),
    confidence: z.number().min(0).max(1),
  })),
});

const CrossContradictionSchema = z.object({
  contradictions: z.array(z.object({
    pairId: z.string(),
    isContradiction: z.boolean(),
    explanation: z.string(),
    confidence: z.number().min(0).max(1),
  })),
});

function buildIntraPrompt(title: string, stmts: ClassifiedStatement[]): string {
  const stmtList = stmts.map(s => ({
    id: s.id,
    text: s.text,
    speaker: s.speaker || "Unknown",
    certainty: s.certainty,
    polarity: s.polarity,
  }));

  return `Analyze these statements from podcast episode '${title}'. Identify any pairs that contradict each other. A contradiction means the statements make claims that cannot both be true.

Statements:
${JSON.stringify(stmtList, null, 2)}

Output JSON ONLY matching this shape:
{
  "contradictions": [
    { "statementAId": string, "statementBId": string, "explanation": string, "confidence": number }
  ]
}

Rules:
- statementAId and statementBId MUST be valid IDs from the input statements
- explanation: brief reason why these statements contradict
- confidence: 0.0-1.0 certainty that this is a genuine contradiction
- Only include pairs where the claims genuinely cannot both be true
- Do NOT flag mere differences in opinion or topic changes as contradictions
- If no contradictions are found, return an empty array

JSON ONLY. No explanations. No markdown.`;
}

function buildCrossPrompt(pairs: Array<{ pairId: string; textA: string; textB: string; speakerA: string; speakerB: string }>): string {
  return `You are a contradiction detection API for podcast analysis.
You receive pairs of statements from DIFFERENT episodes. Determine if each pair represents a genuine contradiction — meaning the two statements make claims that cannot both be true.

NOT a contradiction:
- Statements on the same topic but making compatible points
- Different opinions that can coexist
- Statements about different subjects or contexts
- Minor differences in phrasing

Output JSON ONLY matching this shape:
{
  "contradictions": [
    { "pairId": string, "isContradiction": boolean, "explanation": string, "confidence": number }
  ]
}

Rules:
- pairId MUST match the input pair ID exactly
- isContradiction: true only if the claims genuinely cannot both be true
- explanation: brief reason
- confidence: 0.0-1.0 certainty of your classification
- When in doubt, prefer false (not a contradiction)

JSON ONLY. No explanations. No markdown.

Pairs:
${JSON.stringify(pairs, null, 2)}`;
}

export async function handleDetectContradictionsJob(
  job: Job,
  onProgress: (msg: string, pct: number) => void
): Promise<DetectContradictionsJobResult> {
  const rawResult = job.result;
  const payload: { episodeId?: string } = typeof rawResult === "string"
    ? ((() => { try { return JSON.parse(rawResult); } catch { return {}; } })())
    : ((rawResult as { episodeId?: string }) ?? {});
  const episodeId: string | undefined = payload.episodeId;

  if (!episodeId) {
    throw new ClaudeError("Missing episodeId in job payload", false);
  }

  console.log(`[CONTRADICTIONS] Starting contradiction detection for episode ${episodeId}`);
  onProgress("Fetching episode info...", 5);

  const episode = await storage.getEpisode(episodeId);
  if (!episode) {
    throw new ClaudeError(`Episode not found: ${episodeId}`, false);
  }

  const podcast = await storage.getPodcast(episode.podcastId);
  if (!podcast) {
    throw new ClaudeError(`Podcast not found: ${episode.podcastId}`, false);
  }

  onProgress("Fetching classified statements...", 10);

  const stmtResults = await db.execute(sql`
    SELECT s.id, s.text, s.start_time, s.speaker, sc.certainty, sc.polarity
    FROM statements s
    LEFT JOIN statement_classifications sc ON s.id = sc.statement_id
    WHERE s.episode_id = ${episodeId}
      AND length(s.text) > 30
    ORDER BY s.start_time
  `);

  const statements = stmtResults.rows as unknown as ClassifiedStatement[];

  console.log(`[CONTRADICTIONS] Found ${statements.length} classified statements`);

  if (statements.length < MIN_STATEMENTS) {
    console.log(`[CONTRADICTIONS] Too few statements (${statements.length} < ${MIN_STATEMENTS}), skipping`);
    onProgress("Too few statements, skipping", 100);
    return { intraContradictions: 0, crossContradictions: 0, pairsAnalyzed: 0 };
  }

  let intraContradictions = 0;
  let crossContradictions = 0;
  let pairsAnalyzed = 0;

  // ─── INTRA-EPISODE DETECTION ───
  onProgress("Detecting intra-episode contradictions...", 15);

  const intraBatches: ClassifiedStatement[][] = [];
  for (let i = 0; i < statements.length; i += BATCH_SIZE) {
    intraBatches.push(statements.slice(i, i + BATCH_SIZE));
  }

  for (let batchIdx = 0; batchIdx < intraBatches.length; batchIdx++) {
    const batch = intraBatches[batchIdx];
    const progress = 15 + Math.round((batchIdx / intraBatches.length) * 35);
    onProgress(`Analyzing intra-episode batch ${batchIdx + 1}/${intraBatches.length}...`, progress);

    const validIds = new Set(batch.map(s => s.id));
    pairsAnalyzed += (batch.length * (batch.length - 1)) / 2;

    try {
      const prompt = buildIntraPrompt(episode.title, batch);
      const response = await callClaudeJson(prompt, IntraContradictionSchema, {
        temperature: 0.1,
        maxTokens: 4096,
      });

      for (const c of response.contradictions) {
        if (c.confidence < MIN_CONFIDENCE) continue;
        if (!validIds.has(c.statementAId) || !validIds.has(c.statementBId)) {
          console.warn(`[CONTRADICTIONS] Invalid statement IDs in intra result: ${c.statementAId}, ${c.statementBId}`);
          continue;
        }

        try {
          await storage.upsertRelation({
            episodeId,
            statementAId: c.statementAId,
            statementBId: c.statementBId,
            relation: "contradicts",
            scope: "intra_episode",
            confidence: c.confidence,
          });
          intraContradictions++;
        } catch (err: any) {
          console.error(`[CONTRADICTIONS] Failed to upsert intra relation:`, err.message);
        }
      }
    } catch (err: any) {
      console.error(`[CONTRADICTIONS] Intra batch ${batchIdx + 1} failed:`, err.message);
      if (err instanceof ClaudeError && !err.transient) {
        throw err;
      }
    }
  }

  console.log(`[CONTRADICTIONS] Intra-episode: found ${intraContradictions} contradictions`);

  // ─── CROSS-EPISODE DETECTION ───
  onProgress("Finding similar statements across episodes...", 55);

  let crossCandidates: Array<{
    s1_id: string;
    s1_text: string;
    s1_speaker: string | null;
    s2_id: string;
    s2_text: string;
    s2_episode_id: string;
    s2_speaker: string | null;
    similarity: number;
  }> = [];

  try {
    const crossResults = await db.execute(sql`
      SELECT
        s1.id AS s1_id,
        s1.text AS s1_text,
        s1.speaker AS s1_speaker,
        s2.id AS s2_id,
        s2.text AS s2_text,
        s2.episode_id AS s2_episode_id,
        s2.speaker AS s2_speaker,
        1 - (s2.embedding_vector <=> s1.embedding_vector) AS similarity
      FROM statements s1, statements s2
      WHERE s1.episode_id = ${episodeId}
        AND s2.episode_id != s1.episode_id
        AND s1.embedding_vector IS NOT NULL
        AND s2.embedding_vector IS NOT NULL
        AND 1 - (s2.embedding_vector <=> s1.embedding_vector) > ${CROSS_EPISODE_SIMILARITY_THRESHOLD}
      ORDER BY similarity DESC
      LIMIT ${CROSS_EPISODE_LIMIT}
    `);

    crossCandidates = crossResults.rows as unknown as typeof crossCandidates;
    console.log(`[CONTRADICTIONS] Found ${crossCandidates.length} cross-episode similar pairs`);
  } catch (err: any) {
    console.warn(`[CONTRADICTIONS] Cross-episode query failed (embedding_vector may not exist):`, err.message);
  }

  if (crossCandidates.length > 0) {
    const crossBatches: typeof crossCandidates[] = [];
    for (let i = 0; i < crossCandidates.length; i += BATCH_SIZE) {
      crossBatches.push(crossCandidates.slice(i, i + BATCH_SIZE));
    }

    for (let batchIdx = 0; batchIdx < crossBatches.length; batchIdx++) {
      const batch = crossBatches[batchIdx];
      const progress = 60 + Math.round((batchIdx / crossBatches.length) * 35);
      onProgress(`Validating cross-episode batch ${batchIdx + 1}/${crossBatches.length}...`, progress);

      pairsAnalyzed += batch.length;

      const pairs = batch.map((c, idx) => ({
        pairId: `cross-${batchIdx * BATCH_SIZE + idx}`,
        textA: c.s1_text,
        textB: c.s2_text,
        speakerA: c.s1_speaker || "Unknown",
        speakerB: c.s2_speaker || "Unknown",
      }));

      const pairIdToCandidate = new Map<string, typeof batch[0]>();
      batch.forEach((c, idx) => {
        pairIdToCandidate.set(`cross-${batchIdx * BATCH_SIZE + idx}`, c);
      });

      try {
        const prompt = buildCrossPrompt(pairs);
        const response = await callClaudeJson(prompt, CrossContradictionSchema, {
          temperature: 0.1,
          maxTokens: 4096,
        });

        for (const result of response.contradictions) {
          const candidate = pairIdToCandidate.get(result.pairId);
          if (!candidate) {
            console.warn(`[CONTRADICTIONS] Unknown pairId: ${result.pairId}`);
            continue;
          }

          if (!result.isContradiction || result.confidence < MIN_CONFIDENCE) {
            continue;
          }

          try {
            await storage.upsertRelation({
              episodeId,
              statementAId: candidate.s1_id,
              statementBId: candidate.s2_id,
              relation: "contradicts",
              scope: "cross_episode",
              confidence: result.confidence,
            });
            crossContradictions++;
          } catch (err: any) {
            console.error(`[CONTRADICTIONS] Failed to upsert cross relation:`, err.message);
          }
        }
      } catch (err: any) {
        console.error(`[CONTRADICTIONS] Cross batch ${batchIdx + 1} failed:`, err.message);
        if (err instanceof ClaudeError && !err.transient) {
          throw err;
        }
      }
    }
  }

  onProgress("Contradiction detection complete", 100);

  console.log(`[CONTRADICTIONS] Complete: intra=${intraContradictions}, cross=${crossContradictions}, pairsAnalyzed=${pairsAnalyzed}`);

  return {
    intraContradictions,
    crossContradictions,
    pairsAnalyzed,
  };
}
