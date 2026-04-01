import { storage } from "../storage";
import type { Job } from "@shared/schema";

console.log("[RESOLVE-CLAIM-PRICES] Module loaded, handler ready");

const POLYGON_API_KEY = process.env.Polygon_API_Key || process.env.POLYGON_API_KEY;
const POLYGON_BASE = "https://api.polygon.io";

export interface ResolveClaimPricesJobResult {
  totalProcessed: number;
  totalResolved: number;
  totalFailed: number;
  resolvedTickers: string[];
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function prevBusinessDay(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - 1);
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() - 1);
  }
  return d;
}

async function fetchPolygon(path: string): Promise<any> {
  if (!POLYGON_API_KEY) {
    throw new Error("Polygon_API_Key environment variable not set");
  }
  const url = `${POLYGON_BASE}${path}${path.includes("?") ? "&" : "?"}apiKey=${POLYGON_API_KEY}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    const text = await resp.text().catch(() => resp.statusText);
    throw new Error(`Polygon API error ${resp.status}: ${text}`);
  }
  return resp.json();
}

async function getClosePrice(ticker: string, date: Date): Promise<number | null> {
  const dateStr = formatDate(date);
  try {
    const data = await fetchPolygon(`/v1/open-close/${ticker}/${dateStr}?adjusted=true`);
    if (data.status === "OK" && typeof data.close === "number") {
      return data.close;
    }
    const prev = prevBusinessDay(date);
    const prevStr = formatDate(prev);
    const retry = await fetchPolygon(`/v1/open-close/${ticker}/${prevStr}?adjusted=true`);
    if (retry.status === "OK" && typeof retry.close === "number") {
      return retry.close;
    }
    return null;
  } catch (err: any) {
    console.warn(`[RESOLVE-PRICES] Price lookup failed for ${ticker} on ${dateStr}: ${err.message}`);
    return null;
  }
}

async function getCurrentPrice(ticker: string): Promise<number | null> {
  try {
    const data = await fetchPolygon(`/v2/aggs/ticker/${ticker}/prev?adjusted=true`);
    if (data.status === "OK" && data.results && data.results.length > 0) {
      return data.results[0].c;
    }
    return null;
  } catch (err: any) {
    console.warn(`[RESOLVE-PRICES] Current price lookup failed for ${ticker}: ${err.message}`);
    return null;
  }
}

export async function handleResolveClaimPricesJob(
  job: Job,
  onProgress?: (message: string, percentage: number) => void
): Promise<ResolveClaimPricesJobResult> {
  console.log(`[RESOLVE-CLAIM-PRICES] Starting job ${job.id}`);

  if (!POLYGON_API_KEY) {
    throw new Error("Polygon_API_Key environment variable is not set. Add it to your environment secrets to enable price resolution.");
  }

  onProgress?.("Fetching claims ready for pricing...", 5);

  const rows = await storage.getClaimsReadyForPricing();

  if (rows.length === 0) {
    console.log(`[RESOLVE-CLAIM-PRICES] No claims ready for pricing`);
    onProgress?.("No claims ready for pricing", 100);
    return { totalProcessed: 0, totalResolved: 0, totalFailed: 0, resolvedTickers: [] };
  }

  console.log(`[RESOLVE-CLAIM-PRICES] Processing ${rows.length} enriched claims`);

  let resolved = 0;
  let failed = 0;
  const resolvedTickers = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const { claim, enrichment, episodePublishedAt } = rows[i];
    const progress = 10 + Math.floor((i / rows.length) * 85);
    onProgress?.(`Pricing claim ${i + 1}/${rows.length}...`, progress);

    for (const ticker of enrichment.tickers) {
      try {
        const claimDate = new Date(episodePublishedAt);
        const claimPrice = await getClosePrice(ticker, claimDate);
        if (claimPrice === null) {
          console.warn(`[RESOLVE-CLAIM-PRICES] No price found for ${ticker} on ${formatDate(claimDate)}`);
          failed++;
          continue;
        }

        const currentPrice = await getCurrentPrice(ticker);
        if (currentPrice === null) {
          console.warn(`[RESOLVE-CLAIM-PRICES] No current price found for ${ticker}`);
          failed++;
          continue;
        }

        const priceDeltaPct = ((currentPrice - claimPrice) / claimPrice) * 100;

        await storage.createClaimPrice({
          claimId: claim.id,
          ticker,
          claimDate: formatDate(claimDate),
          claimDatePrice: claimPrice,
          currentPrice,
          priceDeltaPct,
        });

        console.log(`[RESOLVE-CLAIM-PRICES] ${ticker}: claim=$${claimPrice} now=$${currentPrice} delta=${priceDeltaPct.toFixed(2)}%`);
        resolved++;
        resolvedTickers.add(ticker);

        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (err: any) {
        console.error(`[RESOLVE-CLAIM-PRICES] Failed for ${ticker}:`, err.message);
        failed++;
      }
    }
  }

  const tickerList = Array.from(resolvedTickers);
  console.log(`[RESOLVE-CLAIM-PRICES] Done: ${resolved} resolved, ${failed} failed`);
  onProgress?.("Price resolution complete", 100);

  return {
    totalProcessed: rows.length,
    totalResolved: resolved,
    totalFailed: failed,
    resolvedTickers: tickerList,
  };
}
