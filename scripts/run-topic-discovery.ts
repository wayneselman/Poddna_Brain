#!/usr/bin/env npx tsx
/**
 * Standalone topic discovery script — bypasses job dispatch entirely.
 * Reads classified statements → calls Gemini → writes to topics + statement_topics.
 *
 * Usage:
 *   npx tsx scripts/run-topic-discovery.ts
 *   npx tsx scripts/run-topic-discovery.ts <podcastId>
 *
 * Tables written:
 *   topics            — created or name-deduplicated (case-insensitive)
 *   statement_topics  — onConflictDoNothing (safe to re-run)
 *
 * Requires env vars:
 *   DATABASE_URL
 *   GEMINI_API_KEY  (or GOOGLE_GENERATIVE_AI_API_KEY — same as app)
 */

import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { sql as drizzleSql, ilike } from "drizzle-orm";
import { z } from "zod";
import * as schema from "../shared/schema";

// ── AI clients (same imports the job worker uses) ──────────────────────────
import { callGeminiJson, GeminiError } from "../server/ai/geminiClient";
import { getEmbeddingForText } from "../server/ai/embeddings";

// ── Config ─────────────────────────────────────────────────────────────────
const CANDIDATE_LIMIT = 200;
const MIN_TEXT_LENGTH = 40;
const TOPICS_RANGE = { min: 15, max: 40 };

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL environment variable is required");
  process.exit(1);
}

const podcastId = process.argv[2] || null;

const db = drizzle(neon(process.env.DATABASE_URL), { schema });

// ── Gemini schema ──────────────────────────────────────────────────────────
const TopicSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  statementIds: z.array(z.string()),
});

const TopicDiscoveryResponseSchema = z.object({
  topics: z.array(TopicSchema),
});

// ── Prompt ─────────────────────────────────────────────────────────────────
function buildPrompt(
  candidates: Array<{ id: string; text: string; episodeTitle: string }>
): string {
  const statementsText = candidates
    .map((c) => `[${c.id}] "${c.text}" (from: ${c.episodeTitle})`)
    .join("\n");

  return `You are a topic discovery API.
Input: a list of podcast statements with IDs.
Output: JSON ONLY, matching this TypeScript shape:

type Topic = {
  name: string;
  description?: string;
  statementIds: string[];
};

type TopicDiscoveryOutput = {
  topics: Topic[];
};

Field definitions:
- name: 2-5 word topic name (e.g., "Sleep anxiety", "Career burnout")
- description: 1-sentence summary of the theme
- statementIds: IDs of statements belonging to this topic

Rules:
- Create ${TOPICS_RANGE.min}-${TOPICS_RANGE.max} distinct topics
- Topics should be specific but general enough to span episodes
- A statement can belong to multiple topics
- Focus on meaning, not surface keywords
- Good: "Work-life boundaries", "Morning routines", "Imposter syndrome"
- Bad: "Things discussed", "Interesting points", "Episode topics"

JSON ONLY. No explanations. No markdown.

Statements:
${statementsText}`;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function findTopicByName(
  name: string
): Promise<schema.Topic | undefined> {
  const [topic] = await db
    .select()
    .from(schema.topics)
    .where(ilike(schema.topics.name, name));
  return topic;
}

async function createTopic(data: schema.InsertTopic): Promise<schema.Topic> {
  const [topic] = await db.insert(schema.topics).values(data).returning();
  return topic;
}

async function updateTopic(
  id: string,
  data: Partial<schema.InsertTopic>
): Promise<void> {
  await db
    .update(schema.topics)
    .set({ ...data, updatedAt: new Date() })
    .where(drizzleSql`${schema.topics.id} = ${id}`);
}

async function linkStatementsToTopics(
  links: schema.InsertStatementTopic[]
): Promise<number> {
  if (links.length === 0) return 0;
  const results = await db
    .insert(schema.statementTopics)
    .values(links)
    .onConflictDoNothing()
    .returning();
  return results.length;
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log("[TOPIC-DISCOVERY] Starting standalone run");
  if (podcastId) {
    console.log(`[TOPIC-DISCOVERY] Filtering to podcast: ${podcastId}`);
  }

  // 1. Fetch candidate classified statements
  console.log("[TOPIC-DISCOVERY] Fetching candidate statements...");

  const podcastFilter = podcastId
    ? drizzleSql`AND e.podcast_id = ${podcastId}`
    : drizzleSql``;

  const candidateRows = await db.execute(drizzleSql`
    SELECT
      s.id,
      s.text,
      s.episode_id AS "episodeId",
      e.title      AS "episodeTitle"
    FROM statements s
    JOIN statement_classifications sc ON sc.statement_id = s.id
    JOIN episodes e ON e.id = s.episode_id
    WHERE sc.claim_flag = true
      AND LENGTH(s.text) >= ${MIN_TEXT_LENGTH}
      ${podcastFilter}
    ORDER BY RANDOM()
    LIMIT ${CANDIDATE_LIMIT}
  `);

  const candidates = (candidateRows.rows as Array<{
    id: string;
    text: string;
    episodeId: string;
    episodeTitle: string;
  }>);

  if (candidates.length === 0) {
    console.log(
      "[TOPIC-DISCOVERY] No candidate statements found — have classify_statements run yet?"
    );
    process.exit(0);
  }

  console.log(
    `[TOPIC-DISCOVERY] Found ${candidates.length} candidate statements across ${
      new Set(candidates.map((c) => c.episodeId)).size
    } episodes`
  );

  // 2. Call Gemini
  console.log("[TOPIC-DISCOVERY] Calling Gemini to discover topics...");
  const prompt = buildPrompt(candidates);

  let response: z.infer<typeof TopicDiscoveryResponseSchema>;
  try {
    response = await callGeminiJson(
      "gemini-2.5-flash",
      prompt,
      TopicDiscoveryResponseSchema,
      { temperature: 0.3, maxOutputTokens: 32768 }
    );
  } catch (err: any) {
    console.error("[TOPIC-DISCOVERY] Gemini error:", err.message);
    process.exit(1);
  }

  if (!response.topics || response.topics.length === 0) {
    console.log("[TOPIC-DISCOVERY] Gemini returned no topics");
    process.exit(0);
  }

  console.log(
    `[TOPIC-DISCOVERY] Gemini discovered ${response.topics.length} topics`
  );

  // 3. Process each topic
  const candidateIdSet = new Set(candidates.map((c) => c.id));
  let topicsCreated = 0;
  let topicsUpdated = 0;
  let statementsLinked = 0;

  for (const topicData of response.topics) {
    try {
      // Embed
      const embeddingText = topicData.description
        ? `${topicData.name}. ${topicData.description}`
        : topicData.name;

      let embedding: number[] | undefined;
      try {
        embedding = await getEmbeddingForText(embeddingText);
      } catch (err: any) {
        console.warn(
          `[TOPIC-DISCOVERY] Embedding failed for "${topicData.name}": ${err.message}`
        );
      }

      // Find or create topic
      let topic = await findTopicByName(topicData.name);

      if (topic) {
        await updateTopic(topic.id, {
          description: topicData.description || topic.description,
          embedding: (embedding as any) || topic.embedding,
        });
        topicsUpdated++;
        console.log(`[TOPIC-DISCOVERY] Updated existing topic: "${topicData.name}"`);
      } else {
        topic = await createTopic({
          name: topicData.name,
          slug: toSlug(topicData.name),
          description: topicData.description || null,
          embedding: (embedding as any) || null,
        });
        topicsCreated++;
        console.log(`[TOPIC-DISCOVERY] Created new topic: "${topicData.name}"`);
      }

      // Link statements
      const validIds = topicData.statementIds.filter((id) =>
        candidateIdSet.has(id)
      );

      if (validIds.length > 0) {
        const links: schema.InsertStatementTopic[] = validIds.map((statementId) => ({
          statementId,
          topicId: topic!.id,
          confidence: 0.9,
          isPrimary: true,
        }));
        const linked = await linkStatementsToTopics(links);
        statementsLinked += linked;
        console.log(
          `[TOPIC-DISCOVERY] Linked ${linked}/${validIds.length} statements to "${topicData.name}"`
        );
      }
    } catch (err: any) {
      console.error(
        `[TOPIC-DISCOVERY] Error processing topic "${topicData.name}": ${err.message}`
      );
    }
  }

  console.log(
    `\n[TOPIC-DISCOVERY] Done — ${topicsCreated} topics created, ${topicsUpdated} updated, ${statementsLinked} statement-topic links written`
  );
}

main().catch((err) => {
  console.error("[TOPIC-DISCOVERY] Fatal error:", err);
  process.exit(1);
});
