import { storage } from "../storage";
import { callGeminiJson, GeminiError } from "../ai/geminiClient";
import { z } from "zod";
import type { Job, Statement, InsertStatementClassification } from "@shared/schema";

export interface ClassifyClaimsJobResult {
  classified: number;
  totalStatements: number;
}

const BATCH_SIZE = 25;

const INITIAL_DELAY_MS = 3000;
const MAX_DELAY_MS = 60000;
const JITTER_FACTOR = 0.2;

function isRateLimitError(err: any): boolean {
  if (err instanceof GeminiError) {
    const code = String(err.code ?? "").toUpperCase();
    if (code === "RATE_LIMIT" || code === "RESOURCE_EXHAUSTED" || code === "429") return true;
    if (err.transient && (code === "429" || Number(err.code) === 429)) return true;
  }
  const status = err?.status ?? err?.code ?? err?.httpStatusCode;
  if (status === 429 || status === "429" || status === "RESOURCE_EXHAUSTED") return true;
  const msg = String(err?.message ?? "").toLowerCase();
  if (msg.includes("rate limit") || msg.includes("quota") || msg.includes("resource_exhausted")) return true;
  return false;
}

function applyJitter(ms: number): number {
  const jitter = ms * JITTER_FACTOR * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(ms + jitter));
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const AiStatementClassificationSchema = z.object({
  statementId: z.string(),
  claimFlag: z.boolean(),
  claimType: z.enum(["fact", "opinion", "advice", "anecdote", "question"]),
  certainty: z.number().min(0).max(1),
  polarity: z.enum(["supportive", "skeptical", "neutral"]),
  modality: z.enum(["certain", "uncertain", "speculative"]),
  sentiment: z.number().min(-1).max(1),
  emotionalTone: z.string().min(1),
});

const AiClassificationBatchResponseSchema = z.object({
  classifications: z.array(AiStatementClassificationSchema),
});

type AiStatementClassification = z.infer<typeof AiStatementClassificationSchema>;

function buildPrompt(statements: Statement[]): string {
  const statementsText = statements.map(s => 
    `[${s.id}] "${s.text}"`
  ).join("\n");

  return `You are a statement classification API.
Input: a list of podcast statements.
Output: JSON ONLY, matching this TypeScript shape:

type Classification = {
  statementId: string;
  claimFlag: boolean;
  claimType: "fact" | "opinion" | "advice" | "anecdote" | "question";
  certainty: number;
  polarity: "supportive" | "skeptical" | "neutral";
  modality: "certain" | "uncertain" | "speculative";
  sentiment: number;
  emotionalTone: string;
};

type ClassificationOutput = {
  classifications: Classification[];
};

Field definitions:
- statementId: MUST match the [ID] shown in input
- claimFlag: true if verifiable/arguable claim, false for questions/greetings/filler
- claimType: fact (verifiable), opinion (subjective), advice (recommendation), anecdote (personal story), question (interrogative)
- certainty: 0.0-1.0 speaker confidence
- polarity: speaker stance toward topic
- modality: degree of commitment to claim
- sentiment: -1.0 to 1.0 emotional valence
- emotionalTone: single word (calm, excited, angry, curious, etc.)

JSON ONLY. No explanations. No markdown.

Statements:
${statementsText}`;
}

export async function handleClassifyClaimsJob(
  job: Job,
  onProgress?: (message: string, percentage: number) => void
): Promise<ClassifyClaimsJobResult> {
  console.log(`[CLASSIFY-CLAIMS] Starting job ${job.id}`);

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

  let statements: Statement[];
  try {
    statements = await storage.getStatementsByEpisode(episodeId);
  } catch (err: any) {
    throw new GeminiError(`Storage error fetching statements: ${err.message}`, true, "STORAGE_ERROR");
  }

  if (statements.length === 0) {
    console.log(`[CLASSIFY-CLAIMS] No statements found for episode ${episodeId}`);
    return { classified: 0, totalStatements: 0 };
  }

  onProgress?.(`Classifying ${statements.length} statements...`, 10);
  console.log(`[CLASSIFY-CLAIMS] Processing ${statements.length} statements in batches of ${BATCH_SIZE}`);

  const allClassifications: InsertStatementClassification[] = [];
  const totalBatches = Math.ceil(statements.length / BATCH_SIZE);

  let currentDelay = INITIAL_DELAY_MS;

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const startIdx = batchIndex * BATCH_SIZE;
    const endIdx = Math.min(startIdx + BATCH_SIZE, statements.length);
    const batchStatements = statements.slice(startIdx, endIdx);

    const progress = 10 + Math.floor((batchIndex / totalBatches) * 80);
    onProgress?.(`Processing batch ${batchIndex + 1}/${totalBatches}...`, progress);

    console.log(`[CLASSIFY-CLAIMS] Processing batch ${batchIndex + 1}/${totalBatches} (statements ${startIdx}-${endIdx - 1})`);

    let batchSucceeded = false;
    while (!batchSucceeded) {
      try {
        const prompt = buildPrompt(batchStatements);
        const response = await callGeminiJson(
          "gemini-2.5-flash",
          prompt,
          AiClassificationBatchResponseSchema,
          { temperature: 0.2, maxOutputTokens: 8192 }
        );

        const validStatementIds = new Set(batchStatements.map(s => s.id));

        for (const c of response.classifications) {
          if (!validStatementIds.has(c.statementId)) {
            console.warn(`[CLASSIFY-CLAIMS] Skipping classification for unknown statementId: ${c.statementId}`);
            continue;
          }

          allClassifications.push({
            statementId: c.statementId,
            claimFlag: c.claimFlag,
            claimType: c.claimType,
            certainty: c.certainty,
            polarity: c.polarity,
            modality: c.modality,
            sentiment: c.sentiment,
            emotionalTone: c.emotionalTone,
          });
        }

        console.log(`[CLASSIFY-CLAIMS] Batch ${batchIndex + 1}: classified ${response.classifications.length} statements`);
        batchSucceeded = true;

        if (batchIndex < totalBatches - 1) {
          const delay = applyJitter(currentDelay);
          console.log(`[CLASSIFY-CLAIMS] Inter-batch sleep ${delay}ms before next batch`);
          await sleep(delay);
          currentDelay = INITIAL_DELAY_MS;
        }
      } catch (err: any) {
        if (isRateLimitError(err)) {
          currentDelay = Math.min(currentDelay * 2, MAX_DELAY_MS);
          const delay = applyJitter(currentDelay);
          console.warn(`[CLASSIFY-CLAIMS] Rate limit hit on batch ${batchIndex + 1}, backing off ${delay}ms (cap ${MAX_DELAY_MS}ms)`);
          await sleep(delay);
          continue;
        }

        if (err instanceof GeminiError) {
          throw err;
        }
        console.error(`[CLASSIFY-CLAIMS] Error processing batch ${batchIndex + 1}:`, err.message);
        throw new GeminiError(`AI processing error: ${err.message}`, true, "AI_ERROR");
      }
    }
  }

  onProgress?.("Saving classifications...", 95);

  try {
    await storage.upsertClassifications(allClassifications);
  } catch (err: any) {
    throw new GeminiError(`Storage error saving classifications: ${err.message}`, true, "STORAGE_ERROR");
  }

  console.log(`[CLASSIFY-CLAIMS] Completed: classified ${allClassifications.length} statements for episode ${episodeId}`);
  onProgress?.("Statement classification complete", 100);

  return {
    classified: allClassifications.length,
    totalStatements: statements.length,
  };
}
