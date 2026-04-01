#!/usr/bin/env npx tsx
/**
 * Standalone price resolution script — bypasses job dispatch entirely.
 * Queries claim_enrichments, hits Polygon.io, writes to claim_prices.
 *
 * Usage: npx tsx scripts/run-price-resolution.ts
 *
 * Rate-limit aware: caches price lookups by (ticker, date) so each unique
 * pair is only fetched once. Retries with a 65-second pause on 429s.
 */

import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { eq, and, isNull, sql } from "drizzle-orm";
import * as schema from "../shared/schema";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL environment variable is required");
  process.exit(1);
}

const POLYGON_API_KEY = process.env.Polygon_API_Key || process.env.POLYGON_API_KEY;
const POLYGON_BASE = "https://api.polygon.io";
// Free tier: 5 req/min = 1 req per 12s. Use 13s to stay safe.
const BETWEEN_CALLS_MS = 13_000;

const db = drizzle(neon(process.env.DATABASE_URL), { schema });

// Cache so each (ticker, date) pair hits Polygon exactly once
const closePriceCache = new Map<string, number | null>();
const currentPriceCache = new Map<string, number | null>();

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

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchPolygon(path: string, attempt = 1): Promise<any> {
  if (!POLYGON_API_KEY) throw new Error("Polygon_API_Key not set");
  const sep = path.includes("?") ? "&" : "?";
  const url = `${POLYGON_BASE}${path}${sep}apiKey=${POLYGON_API_KEY}`;
  const resp = await fetch(url);

  if (resp.status === 429) {
    if (attempt >= 3) throw new Error(`Polygon 429 after ${attempt} retries`);
    console.log(`  [429] Rate limited — waiting 65 seconds before retry ${attempt + 1}...`);
    await sleep(65_000);
    return fetchPolygon(path, attempt + 1);
  }

  // 404 means no data for that date (weekend/holiday) — return null-like sentinel
  if (resp.status === 404) return { status: "NOT_FOUND" };

  if (!resp.ok) {
    const text = await resp.text().catch(() => resp.statusText);
    throw new Error(`Polygon API ${resp.status}: ${text.slice(0, 200)}`);
  }
  return resp.json();
}

async function getClosePrice(ticker: string, date: Date): Promise<number | null> {
  const dateStr = formatDate(date);
  const cacheKey = `${ticker}:${dateStr}`;
  if (closePriceCache.has(cacheKey)) return closePriceCache.get(cacheKey)!;

  console.log(`  → Fetching close price: ${ticker} on ${dateStr}`);
  await sleep(BETWEEN_CALLS_MS);

  try {
    const data = await fetchPolygon(`/v1/open-close/${ticker}/${dateStr}?adjusted=true`);
    if (data.status === "OK" && typeof data.close === "number") {
      closePriceCache.set(cacheKey, data.close);
      return data.close;
    }
    // Weekend/holiday: try previous business day
    const prev = prevBusinessDay(date);
    const prevStr = formatDate(prev);
    const prevKey = `${ticker}:${prevStr}`;

    // Check if prevBiz date is already in cache (e.g., March 28 and March 29 both fall back to March 27)
    if (closePriceCache.has(prevKey)) {
      const cachedPrev = closePriceCache.get(prevKey);
      closePriceCache.set(cacheKey, cachedPrev ?? null);
      if (cachedPrev !== null && cachedPrev !== undefined) {
        console.log(`  → No data on ${dateStr}, using cached prev business day ${prevStr}: $${cachedPrev}`);
        return cachedPrev;
      }
      return null;
    }

    console.log(`  → No data on ${dateStr}, trying prev business day ${prevStr}`);
    await sleep(BETWEEN_CALLS_MS);
    const retry = await fetchPolygon(`/v1/open-close/${ticker}/${prevStr}?adjusted=true`);
    if (retry.status === "OK" && typeof retry.close === "number") {
      closePriceCache.set(cacheKey, retry.close);
      closePriceCache.set(prevKey, retry.close);
      return retry.close;
    }
    closePriceCache.set(cacheKey, null);
    return null;
  } catch (err: any) {
    console.warn(`  WARN: close price failed for ${ticker} ${dateStr}: ${err.message}`);
    closePriceCache.set(cacheKey, null);
    return null;
  }
}

async function getCurrentPrice(ticker: string): Promise<number | null> {
  if (currentPriceCache.has(ticker)) return currentPriceCache.get(ticker)!;

  console.log(`  → Fetching current price: ${ticker}`);
  await sleep(BETWEEN_CALLS_MS);

  try {
    const data = await fetchPolygon(`/v2/aggs/ticker/${ticker}/prev?adjusted=true`);
    if (data.status === "OK" && data.results?.length > 0) {
      currentPriceCache.set(ticker, data.results[0].c);
      return data.results[0].c;
    }
    currentPriceCache.set(ticker, null);
    return null;
  } catch (err: any) {
    console.warn(`  WARN: current price failed for ${ticker}: ${err.message}`);
    currentPriceCache.set(ticker, null);
    return null;
  }
}

async function main() {
  console.log("=== Price Resolution Script ===");
  console.log(`Polygon API key: ${POLYGON_API_KEY ? "present" : "MISSING — set Polygon_API_Key"}`);
  console.log(`Rate limit mode: 1 unique API call per ${BETWEEN_CALLS_MS / 1000}s (free tier safe)`);
  console.log(`Caching: enabled — each (ticker, date) pair fetched at most once\n`);

  if (!POLYGON_API_KEY) {
    console.error("Set the Polygon_API_Key environment variable and retry.");
    process.exit(1);
  }

  console.log("Querying claims ready for pricing...");
  const rows = await db
    .select({
      claim: schema.episodeClaims,
      enrichment: schema.claimEnrichments,
      episodePublishedAt: schema.episodes.publishedAt,
    })
    .from(schema.claimEnrichments)
    .innerJoin(schema.episodeClaims, eq(schema.episodeClaims.id, schema.claimEnrichments.claimId))
    .innerJoin(schema.episodes, eq(schema.episodes.id, schema.episodeClaims.episodeId))
    .leftJoin(schema.claimPrices, eq(schema.claimPrices.claimId, schema.episodeClaims.id))
    .where(
      and(
        eq(schema.claimEnrichments.skip, false),
        sql`array_length(${schema.claimEnrichments.tickers}, 1) > 0`,
        sql`${schema.claimEnrichments.confidence} > 0.7`,
        isNull(schema.claimPrices.id)
      )
    );

  // Deduplicate: collect unique (ticker, date) pairs upfront so we know API call count
  const uniquePairs = new Set<string>();
  for (const r of rows) {
    const dateStr = formatDate(new Date(r.episodePublishedAt));
    for (const ticker of r.enrichment.tickers) uniquePairs.add(`${ticker}:${dateStr}`);
  }
  const uniqueTickers = new Set(rows.flatMap(r => r.enrichment.tickers));

  console.log(`Found ${rows.length} claim-ticker pairs to price`);
  console.log(`Unique (ticker, date) pairs: ${uniquePairs.size}`);
  console.log(`Unique tickers (for current price): ${uniqueTickers.size}`);
  console.log(`Estimated API calls: ~${uniquePairs.size + uniqueTickers.size} (max)`);
  console.log(`Estimated time: ~${Math.ceil(((uniquePairs.size + uniqueTickers.size) * BETWEEN_CALLS_MS) / 60000)} minutes\n`);

  if (rows.length === 0) {
    console.log("Nothing to do — all eligible claims already have prices.");
    return;
  }

  let resolved = 0;
  let skipped = 0;
  let failed = 0;
  const resolvedTickers = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const { claim, enrichment, episodePublishedAt } = rows[i];
    const claimDate = new Date(episodePublishedAt);
    const tickers: string[] = enrichment.tickers;
    const pct = Math.round(((i + 1) / rows.length) * 100);

    console.log(
      `[${String(i + 1).padStart(4)}/${rows.length}] ${pct.toString().padStart(3)}% | claim ${claim.id.slice(0, 8)} | tickers: ${tickers.join(", ")} | date: ${formatDate(claimDate)}`
    );

    for (const ticker of tickers) {
      const claimPrice = await getClosePrice(ticker, claimDate);
      if (claimPrice === null) {
        console.log(`  SKIP ${ticker}: no claim-date price`);
        skipped++;
        continue;
      }

      const currentPrice = await getCurrentPrice(ticker);
      if (currentPrice === null) {
        console.log(`  SKIP ${ticker}: no current price`);
        skipped++;
        continue;
      }

      const priceDeltaPct = ((currentPrice - claimPrice) / claimPrice) * 100;

      try {
        await db
          .insert(schema.claimPrices)
          .values({
            claimId: claim.id,
            ticker,
            claimDate: formatDate(claimDate),
            claimDatePrice: claimPrice,
            currentPrice,
            priceDeltaPct,
          })
          .onConflictDoNothing();

        const sign = priceDeltaPct >= 0 ? "+" : "";
        console.log(
          `  OK   ${ticker}: claim=$${claimPrice.toFixed(2)} now=$${currentPrice.toFixed(2)} delta=${sign}${priceDeltaPct.toFixed(2)}%`
        );
        resolved++;
        resolvedTickers.add(ticker);
      } catch (err: any) {
        console.error(`  ERR  ${ticker}: DB write failed: ${err.message}`);
        failed++;
      }
    }
  }

  console.log("\n=== Summary ===");
  console.log(`  Resolved : ${resolved}`);
  console.log(`  Skipped  : ${skipped} (no Polygon data)`);
  console.log(`  Failed   : ${failed} (DB errors)`);
  console.log(`  Tickers  : ${Array.from(resolvedTickers).sort().join(", ") || "none"}`);
  console.log("Done.");
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
