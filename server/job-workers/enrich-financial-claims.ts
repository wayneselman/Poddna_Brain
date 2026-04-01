import { storage } from "../storage";
import { callClaudeJson, ClaudeError } from "../ai/claudeClient";
import type { Job } from "@shared/schema";
import { z } from "zod";

const EnrichmentSchema = z.object({
  tickers: z.array(z.string()).default([]),
  direction: z.enum(["bullish", "bearish", "neutral", "price_target", "none"]),
  time_horizon: z.enum(["short", "medium", "long", "unspecified"]),
  price_target: z.number().nullable().default(null),
  confidence: z.number().min(0).max(1),
  skip: z.boolean(),
});

type EnrichmentResult = z.infer<typeof EnrichmentSchema>;

export interface EnrichFinancialClaimsJobResult {
  totalProcessed: number;
  totalEnriched: number;
  totalSkipped: number;
  tickers: string[];
}

const BATCH_PAUSE_MS = 500;

export async function handleEnrichFinancialClaimsJob(
  job: Job,
  onProgress?: (message: string, percentage: number) => void
): Promise<EnrichFinancialClaimsJobResult> {
  console.log(`[ENRICH-FINANCIAL-CLAIMS] Starting job ${job.id}`);

  onProgress?.("Fetching unenriched financial claims...", 5);

  const claims = await storage.getUnenrichedFinancialClaims();

  if (claims.length === 0) {
    console.log(`[ENRICH-FINANCIAL-CLAIMS] No unenriched financial claims found`);
    onProgress?.("No unenriched claims to process", 100);
    return { totalProcessed: 0, totalEnriched: 0, totalSkipped: 0, tickers: [] };
  }

  console.log(`[ENRICH-FINANCIAL-CLAIMS] Processing ${claims.length} claims`);
  onProgress?.(`Processing ${claims.length} financial claims...`, 10);

  let enriched = 0;
  let skipped = 0;
  const allTickers = new Set<string>();

  for (let i = 0; i < claims.length; i++) {
    const claim = claims[i];
    const progress = 10 + Math.floor((i / claims.length) * 85);
    onProgress?.(`Enriching claim ${i + 1}/${claims.length}...`, progress);

    const prompt = `Given this verbatim financial claim from a podcast: "${claim.claimText}"

Extract as JSON:
- tickers: string[] (US equity tickers mentioned or strongly implied — e.g. ["GOOGL","AAPL"] — empty array if none)
- direction: "bullish" | "bearish" | "neutral" | "price_target" | "none"
- time_horizon: "short" | "medium" | "long" | "unspecified"
- price_target: number | null (specific dollar price mentioned, null otherwise)
- confidence: number (0.0-1.0, how clearly verifiable this is as a forward-looking directional call)
- skip: boolean (true if this is a historical anecdote or past fact with no forward-looking signal)

Rules:
- Only include tickers you are highly confident about (well-known symbols only)
- "bullish" = speaker is optimistic or recommends buying
- "bearish" = speaker is pessimistic or recommends selling/avoiding
- "price_target" = speaker states a specific price target
- Set skip=true for: past events, historical revenue figures, general facts, anecdotes without a call
- Set confidence < 0.7 for vague or ambiguous claims

Return JSON only. No explanation.`;

    try {
      const result: EnrichmentResult = await callClaudeJson(prompt, EnrichmentSchema, {
        model: "claude-haiku-4-5",
        maxTokens: 512,
        temperature: 0.1,
      });

      await storage.createClaimEnrichment({
        claimId: claim.id,
        tickers: result.tickers,
        direction: result.direction,
        timeHorizon: result.time_horizon,
        priceTarget: result.price_target ?? null,
        confidence: result.confidence,
        skip: result.skip,
      });

      if (result.skip) {
        skipped++;
      } else {
        enriched++;
        for (const ticker of result.tickers) {
          allTickers.add(ticker);
        }
      }

      console.log(`[ENRICH-FINANCIAL-CLAIMS] Claim ${claim.id}: dir=${result.direction} tickers=${result.tickers.join(",")} skip=${result.skip} conf=${result.confidence}`);
    } catch (err: any) {
      console.error(`[ENRICH-FINANCIAL-CLAIMS] Failed to enrich claim ${claim.id}:`, err.message);
      await storage.createClaimEnrichment({
        claimId: claim.id,
        tickers: [],
        direction: "none",
        timeHorizon: "unspecified",
        priceTarget: null,
        confidence: 0,
        skip: true,
      });
      skipped++;
    }

    if (i < claims.length - 1) {
      await new Promise(resolve => setTimeout(resolve, BATCH_PAUSE_MS));
    }
  }

  const tickerList = Array.from(allTickers);
  console.log(`[ENRICH-FINANCIAL-CLAIMS] Done: ${enriched} enriched, ${skipped} skipped, tickers: ${tickerList.join(",")}`);
  onProgress?.("Enrichment complete", 100);

  return {
    totalProcessed: claims.length,
    totalEnriched: enriched,
    totalSkipped: skipped,
    tickers: tickerList,
  };
}
