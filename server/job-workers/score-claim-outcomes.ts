import { storage } from "../storage";
import type { Job } from "@shared/schema";

export interface ScoreClaimOutcomesJobResult {
  totalScored: number;
  hits: number;
  misses: number;
  excluded: number;
}

const MIN_AGE_DAYS = 30;
const PRICE_TARGET_TOLERANCE = 0.10;
const FLAT_THRESHOLD_PCT = 1.0;

function actualDirection(priceDeltaPct: number): "up" | "down" | "flat" {
  if (priceDeltaPct > FLAT_THRESHOLD_PCT) return "up";
  if (priceDeltaPct < -FLAT_THRESHOLD_PCT) return "down";
  return "flat";
}

function scoreOutcome(
  direction: string,
  actual: "up" | "down" | "flat",
  priceDeltaPct: number,
  priceTarget: number | null,
  claimPrice: number
): "hit" | "miss" | "excluded" {
  if (direction === "neutral" || direction === "none") return "excluded";
  if (direction === "unspecified") return "excluded";

  if (direction === "price_target" && priceTarget !== null) {
    const currentPrice = claimPrice * (1 + priceDeltaPct / 100);
    const tolerance = Math.abs(priceTarget - currentPrice) / priceTarget;
    return tolerance <= PRICE_TARGET_TOLERANCE ? "hit" : "miss";
  }

  if (direction === "bullish") {
    if (actual === "up") return "hit";
    if (actual === "down") return "miss";
    return "excluded";
  }

  if (direction === "bearish") {
    if (actual === "down") return "hit";
    if (actual === "up") return "miss";
    return "excluded";
  }

  return "excluded";
}

export async function handleScoreClaimOutcomesJob(
  job: Job,
  onProgress?: (message: string, percentage: number) => void
): Promise<ScoreClaimOutcomesJobResult> {
  console.log(`[SCORE-CLAIM-OUTCOMES] Starting job ${job.id}`);

  onProgress?.("Fetching claims ready for scoring...", 5);

  const rows = await storage.getClaimsReadyForScoring(MIN_AGE_DAYS);

  if (rows.length === 0) {
    console.log(`[SCORE-CLAIM-OUTCOMES] No claims ready for scoring (min age: ${MIN_AGE_DAYS} days)`);
    onProgress?.(`No claims older than ${MIN_AGE_DAYS} days to score`, 100);
    return { totalScored: 0, hits: 0, misses: 0, excluded: 0 };
  }

  console.log(`[SCORE-CLAIM-OUTCOMES] Scoring ${rows.length} claim-ticker pairs`);

  let hits = 0;
  let misses = 0;
  let excluded = 0;

  for (let i = 0; i < rows.length; i++) {
    const { enrichment, price } = rows[i];
    const progress = 10 + Math.floor((i / rows.length) * 85);
    onProgress?.(`Scoring ${i + 1}/${rows.length}...`, progress);

    const actual = actualDirection(price.priceDeltaPct);
    const result = scoreOutcome(
      enrichment.direction,
      actual,
      price.priceDeltaPct,
      enrichment.priceTarget ?? null,
      price.claimDatePrice
    );

    const currentPrice = price.claimDatePrice * (1 + price.priceDeltaPct / 100);

    await storage.createClaimOutcome({
      claimId: price.claimId,
      ticker: price.ticker,
      expectedDirection: enrichment.direction,
      actualDirection: actual,
      result,
      priceAtClaim: price.claimDatePrice,
      priceAtScoring: currentPrice,
      priceDeltaPct: price.priceDeltaPct,
    });

    if (result === "hit") hits++;
    else if (result === "miss") misses++;
    else excluded++;

    console.log(`[SCORE-CLAIM-OUTCOMES] ${price.ticker}: expected=${enrichment.direction} actual=${actual} delta=${price.priceDeltaPct.toFixed(2)}% → ${result}`);
  }

  console.log(`[SCORE-CLAIM-OUTCOMES] Done: ${hits} hits, ${misses} misses, ${excluded} excluded`);
  onProgress?.("Outcome scoring complete", 100);

  return { totalScored: rows.length, hits, misses, excluded };
}
