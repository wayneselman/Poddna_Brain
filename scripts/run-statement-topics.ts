#!/usr/bin/env npx tsx
/**
 * Standalone statement-topic assignment script — bypasses job dispatch entirely.
 * Reads topics with embeddings → cosine-similarity matches statements → writes to statement_topics.
 *
 * Usage:
 *   npx tsx scripts/run-statement-topics.ts
 *   npx tsx scripts/run-statement-topics.ts <podcastId>
 *
 * Must run AFTER run-topic-discovery.ts (requires topics with embeddings to exist).
 *
 * Tables written:
 *   statement_topics  — onConflictDoNothing (safe to re-run)
 *
 * Requires env var:
 *   DATABASE_URL
 */

import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { sql as drizzleSql, isNull } from "drizzle-orm";
import * as schema from "../shared/schema";

// ── AI client ──────────────────────────────────────────────────────────────
import { getEmbeddingForText } from "../server/ai/embeddings";

// ── Config ─────────────────────────────────────────────────────────────────
const STATEMENT_LIMIT = 500;
const MIN_SIMILARITY_THRESHOLD = 0.3;
const SECONDARY_TOPIC_THRESHOLD = 0.5;
const BATCH_SIZE = 50; // log progress every N statements

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL environment variable is required");
  process.exit(1);
}

const podcastId = process.argv[2] || null;

const db = drizzle(neon(process.env.DATABASE_URL), { schema });

// ── Cosine similarity ──────────────────────────────────────────────────────
function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log("[STATEMENT-TOPICS] Starting standalone run");
  if (podcastId) {
    console.log(`[STATEMENT-TOPICS] Filtering to podcast: ${podcastId}`);
  }

  // 1. Load topics with embeddings
  const topicRows = await db
    .select()
    .from(schema.topics)
    .where(drizzleSql`${schema.topics.embedding} IS NOT NULL`);

  if (topicRows.length === 0) {
    console.log(
      "[STATEMENT-TOPICS] No topics with embeddings found — run run-topic-discovery.ts first"
    );
    process.exit(0);
  }
  console.log(
    `[STATEMENT-TOPICS] Loaded ${topicRows.length} topics with embeddings`
  );

  // 2. Load statements without topic assignments, optionally filtered by podcast
  const podcastFilter = podcastId
    ? drizzleSql`AND e.podcast_id = ${podcastId}`
    : drizzleSql``;

  const statementRows = await db.execute(drizzleSql`
    SELECT s.id, s.text, s.embedding
    FROM statements s
    JOIN episodes e ON e.id = s.episode_id
    LEFT JOIN statement_topics st ON st.statement_id = s.id
    WHERE st.statement_id IS NULL
      ${podcastFilter}
    LIMIT ${STATEMENT_LIMIT}
  `);

  const statements = statementRows.rows as Array<{
    id: string;
    text: string;
    embedding: any;
  }>;

  if (statements.length === 0) {
    console.log(
      "[STATEMENT-TOPICS] No statements need topic assignment (all already assigned or none exist)"
    );
    process.exit(0);
  }
  console.log(
    `[STATEMENT-TOPICS] Processing ${statements.length} unassigned statements`
  );

  // 3. Cosine-similarity match each statement to topics
  const linksToCreate: schema.InsertStatementTopic[] = [];
  let statementsLinked = 0;
  let embeddingsGenerated = 0;

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];

    if (i > 0 && i % BATCH_SIZE === 0) {
      console.log(
        `[STATEMENT-TOPICS] Progress: ${i}/${statements.length} statements processed, ${statementsLinked} linked so far`
      );
    }

    // Use existing embedding (stored as JSONB array) or generate one
    let embedding: number[] | null = null;

    if (
      stmt.embedding &&
      Array.isArray(stmt.embedding) &&
      stmt.embedding.length > 0
    ) {
      embedding = stmt.embedding as number[];
    } else {
      try {
        embedding = await getEmbeddingForText(stmt.text);
        embeddingsGenerated++;
      } catch (err: any) {
        console.warn(
          `[STATEMENT-TOPICS] Embedding failed for statement ${stmt.id}: ${err.message}`
        );
        continue;
      }
    }

    if (!embedding) continue;

    // Score against every topic
    const scores: Array<{ topicId: string; similarity: number }> = [];

    for (const topic of topicRows) {
      const topicEmbedding = topic.embedding;
      if (!topicEmbedding || !Array.isArray(topicEmbedding)) continue;

      const sim = cosineSimilarity(embedding, topicEmbedding as number[]);
      if (sim >= MIN_SIMILARITY_THRESHOLD) {
        scores.push({ topicId: topic.id, similarity: sim });
      }
    }

    scores.sort((a, b) => b.similarity - a.similarity);

    if (scores.length > 0) {
      // Primary topic (best match)
      linksToCreate.push({
        statementId: stmt.id,
        topicId: scores[0].topicId,
        confidence: scores[0].similarity,
        isPrimary: true,
      });
      statementsLinked++;

      // Secondary topics (up to 2 more, above threshold)
      for (let j = 1; j < Math.min(scores.length, 3); j++) {
        if (scores[j].similarity >= SECONDARY_TOPIC_THRESHOLD) {
          linksToCreate.push({
            statementId: stmt.id,
            topicId: scores[j].topicId,
            confidence: scores[j].similarity,
            isPrimary: false,
          });
        }
      }
    }
  }

  // 4. Bulk insert all links
  console.log(
    `[STATEMENT-TOPICS] Writing ${linksToCreate.length} statement-topic links...`
  );

  let written = 0;
  if (linksToCreate.length > 0) {
    // Insert in chunks to avoid parameter limits
    const CHUNK = 200;
    for (let i = 0; i < linksToCreate.length; i += CHUNK) {
      const chunk = linksToCreate.slice(i, i + CHUNK);
      const results = await db
        .insert(schema.statementTopics)
        .values(chunk)
        .onConflictDoNothing()
        .returning();
      written += results.length;
    }
  }

  console.log(
    `\n[STATEMENT-TOPICS] Done — ${statements.length} statements processed, ${statementsLinked} linked to at least one topic, ${written} total rows written to statement_topics, ${embeddingsGenerated} embeddings generated on-the-fly`
  );
}

main().catch((err) => {
  console.error("[STATEMENT-TOPICS] Fatal error:", err);
  process.exit(1);
});
