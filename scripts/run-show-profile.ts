#!/usr/bin/env npx tsx
/**
 * Standalone show profile computation script — bypasses job dispatch entirely.
 * Reads topics + statement_topics + statement_classifications → UPSERTs show_profiles.
 *
 * Usage:
 *   npx tsx scripts/run-show-profile.ts
 *   npx tsx scripts/run-show-profile.ts <podcastId>
 *
 * Must run AFTER run-topic-discovery.ts + run-statement-topics.ts.
 *
 * Tables written:
 *   show_profiles — UPSERT (updates existing row for same podcast_id + null tag_filter,
 *                   never creates a duplicate)
 *
 * Requires env var:
 *   DATABASE_URL
 */

import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { sql as drizzleSql, eq, isNull, and } from "drizzle-orm";
import { z } from "zod";
import { callClaudeJson } from "../server/ai/claudeClient";
import * as schema from "../shared/schema";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL environment variable is required");
  process.exit(1);
}

const podcastIdArg = process.argv[2] || null;

const db = drizzle(neon(process.env.DATABASE_URL), { schema });

// ── Upsert helper (matches storage.upsertShowProfile exactly) ──────────────
async function upsertShowProfile(
  podcastId: string,
  data: Partial<schema.InsertShowProfile>
): Promise<void> {
  // Find existing row for this podcast with no tag_filter
  const conditions = [
    eq(schema.showProfiles.podcastId, podcastId),
    isNull(schema.showProfiles.tagFilter),
  ];
  const [existing] = await db
    .select()
    .from(schema.showProfiles)
    .where(and(...conditions));

  if (existing) {
    await db
      .update(schema.showProfiles)
      .set({ ...data, computedAt: new Date() })
      .where(eq(schema.showProfiles.id, existing.id));
    console.log(`[SHOW-PROFILE] Updated existing row (id: ${existing.id})`);
  } else {
    await db
      .insert(schema.showProfiles)
      .values({ podcastId, episodeCount: 0, tagFilter: null, ...data });
    console.log(`[SHOW-PROFILE] Created new row for podcast ${podcastId}`);
  }
}

// ── Compute for a single podcast ───────────────────────────────────────────
async function computeProfile(podcastId: string): Promise<void> {
  console.log(`[SHOW-PROFILE] Computing profile for podcast ${podcastId}`);

  // Mark as computing
  await upsertShowProfile(podcastId, { status: "computing" });

  try {
    // 1. Episode count (only episodes with at least one statement)
    const episodeCountResult = await db.execute(drizzleSql`
      SELECT COUNT(DISTINCT e.id) AS cnt
      FROM episodes e
      JOIN statements s ON s.episode_id = e.id
      WHERE e.podcast_id = ${podcastId}
    `);
    const episodeCount =
      parseInt(episodeCountResult.rows[0]?.cnt as string) || 0;
    const minEpThreshold =
      episodeCount >= 25 ? 4 : episodeCount >= 10 ? 3 : 2;
    console.log(
      `[SHOW-PROFILE] ${episodeCount} analyzed episodes (min recurrence threshold: ${minEpThreshold})`
    );

    // 2. Statement + claim counts
    const statsResult = await db.execute(drizzleSql`
      SELECT
        COUNT(s.id)                                             AS total_statements,
        COUNT(sc.id) FILTER (WHERE sc.claim_flag = true)       AS total_claims
      FROM statements s
      JOIN episodes e ON e.id = s.episode_id
      LEFT JOIN statement_classifications sc ON sc.statement_id = s.id
      WHERE e.podcast_id = ${podcastId}
    `);
    const totalStatements =
      parseInt(statsResult.rows[0]?.total_statements as string) || 0;
    const totalClaims =
      parseInt(statsResult.rows[0]?.total_claims as string) || 0;
    console.log(
      `[SHOW-PROFILE] ${totalStatements} statements, ${totalClaims} claims`
    );

    // 3. Top themes (from statement_topics + topics)
    const [existing] = await db
      .select()
      .from(schema.showProfiles)
      .where(
        and(
          eq(schema.showProfiles.podcastId, podcastId),
          isNull(schema.showProfiles.tagFilter)
        )
      );
    const previousTopThemes = existing?.topThemes || [];

    const themesResult = await db.execute(drizzleSql`
      SELECT
        t.id                                                        AS topic_id,
        t.name                                                      AS topic_name,
        COUNT(st.id)                                                AS statement_count,
        COUNT(DISTINCT e.id)                                        AS episode_count,
        (
          SELECT json_agg(sub.text ORDER BY sub.certainty DESC)
          FROM (
            SELECT s2.text, sc2.certainty
            FROM statements s2
            JOIN statement_topics st2 ON st2.statement_id = s2.id
            JOIN statement_classifications sc2 ON sc2.statement_id = s2.id
            WHERE st2.topic_id = t.id
              AND s2.episode_id IN (
                SELECT id FROM episodes WHERE podcast_id = ${podcastId}
              )
            ORDER BY sc2.certainty DESC
            LIMIT 5
          ) sub
        )                                                           AS representative_candidates
      FROM statement_topics st
      JOIN topics t ON t.id = st.topic_id
      JOIN statements s ON s.id = st.statement_id
      JOIN episodes e ON e.id = s.episode_id
      WHERE e.podcast_id = ${podcastId}
      GROUP BY t.id, t.name
      HAVING COUNT(st.id) >= 50
      ORDER BY statement_count DESC
      LIMIT 12
    `);

    const previousThemesMap = new Map<string, number>();
    if (Array.isArray(previousTopThemes)) {
      (previousTopThemes as any[]).forEach((theme: any, idx: number) => {
        if (theme?.topicId) previousThemesMap.set(theme.topicId, idx);
      });
    }

    // De-duplicate representative texts: walk each topic's ranked candidates
    // and pick the first one not already claimed by a higher-ranked theme.
    const usedRepresentativeTexts = new Set<string>();

    const topThemes = (themesResult.rows as any[]).map((row, currentIdx) => {
      let trend: "up" | "down" | "stable" | "new" = "new";
      if (previousThemesMap.has(row.topic_id)) {
        const prevIdx = previousThemesMap.get(row.topic_id)!;
        if (currentIdx < prevIdx) trend = "up";
        else if (currentIdx > prevIdx) trend = "down";
        else trend = "stable";
      }

      const candidates: string[] = Array.isArray(row.representative_candidates)
        ? row.representative_candidates
        : [];

      let representativeText = "";
      for (const text of candidates) {
        if (text && !usedRepresentativeTexts.has(text)) {
          representativeText = text;
          usedRepresentativeTexts.add(text);
          break;
        }
      }

      return {
        topicId: row.topic_id,
        topicName: row.topic_name,
        statementCount: parseInt(row.statement_count) || 0,
        episodeCount: parseInt(row.episode_count) || 0,
        representativeText,
        trend,
      };
    });
    console.log(`[SHOW-PROFILE] ${topThemes.length} top themes`);

    // 4. Recurrence patterns (from statement_relations)
    const recurrencesResult = await db.execute(drizzleSql`
      SELECT
        sa.text                     AS text,
        COUNT(sr.id)                AS occurrence_count,
        COUNT(DISTINCT e.id)        AS episode_count,
        MIN(e.published_at)         AS first_seen,
        MAX(e.published_at)         AS last_seen
      FROM statement_relations sr
      JOIN statements sa ON sa.id = sr.statement_a_id
      JOIN episodes e ON e.id = sr.episode_id
      WHERE sr.relation  = 'recurrence'
        AND sr.scope     = 'cross_episode'
        AND e.podcast_id = ${podcastId}
      GROUP BY sa.text
      HAVING COUNT(DISTINCT e.id) >= ${minEpThreshold}
      ORDER BY occurrence_count DESC
      LIMIT 10
    `);

    const topRecurrences = (recurrencesResult.rows as any[]).map((row) => {
      const occCount = parseInt(row.occurrence_count) || 0;
      const epCount = parseInt(row.episode_count) || 0;
      let frequencyLabel = `${occCount}x across ${epCount} episodes`;
      if (row.first_seen && row.last_seen) {
        const daysDiff = Math.round(
          (new Date(row.last_seen).getTime() -
            new Date(row.first_seen).getTime()) /
            (1000 * 60 * 60 * 24)
        );
        if (daysDiff <= 14) {
          frequencyLabel = `${occCount}x in ${Math.ceil(daysDiff / 7) || 1} week${daysDiff > 7 ? "s" : ""}`;
        } else if (daysDiff <= 60) {
          frequencyLabel = `${occCount}x in ${Math.ceil(daysDiff / 30)} month${daysDiff > 30 ? "s" : ""}`;
        }
      }
      return {
        text: row.text,
        occurrenceCount: occCount,
        episodeCount: epCount,
        firstSeen: row.first_seen,
        lastSeen: row.last_seen,
        frequencyLabel,
      };
    });
    console.log(`[SHOW-PROFILE] ${topRecurrences.length} recurrence patterns`);

    // 5. Contradictions — topic-level polarity flips across episodes
    //    Finds topics where dominant polarity (supportive vs skeptical) differs
    //    between episodes. One entry per topic (DISTINCT ON topic_id), ordered by
    //    how clear-cut the flip is (flip_strength) then volume (total_evidence).
    const contradictionsResult = await db.execute(drizzleSql`
      WITH episode_topic_polarity AS (
        SELECT
          st.topic_id,
          s.episode_id,
          SUM(CASE WHEN sc.polarity = 'supportive' THEN 1 ELSE 0 END)::int AS sup_cnt,
          SUM(CASE WHEN sc.polarity = 'skeptical'  THEN 1 ELSE 0 END)::int AS skep_cnt,
          COUNT(*) FILTER (WHERE sc.polarity IN ('supportive','skeptical'))::int AS total,
          CASE
            WHEN SUM(CASE WHEN sc.polarity = 'supportive' THEN 1 ELSE 0 END) >
                 SUM(CASE WHEN sc.polarity = 'skeptical'  THEN 1 ELSE 0 END)
            THEN 'supportive'
            ELSE 'skeptical'
          END AS dominant
        FROM statement_topics st
        JOIN statements s   ON s.id  = st.statement_id
        JOIN episodes e     ON e.id  = s.episode_id
        JOIN statement_classifications sc ON sc.statement_id = s.id
        WHERE e.podcast_id = ${podcastId}
          AND sc.polarity IN ('supportive','skeptical')
        GROUP BY st.topic_id, s.episode_id
        HAVING COUNT(*) FILTER (WHERE sc.polarity IN ('supportive','skeptical')) >= 3
      ),
      topic_flips AS (
        SELECT
          a.topic_id,
          a.episode_id AS episode_a_id,
          b.episode_id AS episode_b_id,
          a.dominant   AS polarity_a,
          b.dominant   AS polarity_b,
          a.total + b.total AS total_evidence,
          (ABS(a.sup_cnt - a.skep_cnt)::float / GREATEST(a.total, 1)
         + ABS(b.sup_cnt - b.skep_cnt)::float / GREATEST(b.total, 1)) AS flip_strength
        FROM episode_topic_polarity a
        JOIN episode_topic_polarity b
          ON  b.topic_id   = a.topic_id
          AND b.episode_id > a.episode_id
          AND b.dominant  != a.dominant
      ),
      best_flip AS (
        SELECT DISTINCT ON (topic_id) *
        FROM topic_flips
        ORDER BY topic_id, flip_strength DESC, total_evidence DESC
      )
      SELECT
        t.name       AS topic_name,
        ea.title     AS episode_a_title,
        eb.title     AS episode_b_title,
        bf.polarity_a,
        bf.polarity_b,
        bf.flip_strength,
        bf.total_evidence,
        (
          SELECT s2.text
          FROM statements s2
          JOIN statement_topics   st2 ON st2.statement_id = s2.id
          JOIN statement_classifications sc2 ON sc2.statement_id = s2.id
          WHERE st2.topic_id  = bf.topic_id
            AND s2.episode_id = bf.episode_a_id
            AND sc2.polarity  = bf.polarity_a
            AND length(s2.text) > 20
          ORDER BY sc2.certainty DESC NULLS LAST
          LIMIT 1
        ) AS text_a,
        (
          SELECT s2.text
          FROM statements s2
          JOIN statement_topics   st2 ON st2.statement_id = s2.id
          JOIN statement_classifications sc2 ON sc2.statement_id = s2.id
          WHERE st2.topic_id  = bf.topic_id
            AND s2.episode_id = bf.episode_b_id
            AND sc2.polarity  = bf.polarity_b
            AND length(s2.text) > 20
          ORDER BY sc2.certainty DESC NULLS LAST
          LIMIT 1
        ) AS text_b
      FROM best_flip bf
      JOIN topics   t  ON t.id  = bf.topic_id
      JOIN episodes ea ON ea.id = bf.episode_a_id
      JOIN episodes eb ON eb.id = bf.episode_b_id
      ORDER BY bf.flip_strength DESC, bf.total_evidence DESC
      LIMIT 10
    `);

    const topContradictions = (contradictionsResult.rows as any[]).map(
      (row) => ({
        topicName:     row.topic_name,
        textA:         row.text_a  || "",
        textB:         row.text_b  || "",
        episodeATitle: row.episode_a_title,
        episodeBTitle: row.episode_b_title,
        polarityA:     row.polarity_a,
        polarityB:     row.polarity_b,
        flipStrength:  parseFloat(row.flip_strength) || 0,
        explanation:   "",
        withinEpisode: false,
      })
    );
    console.log(
      `[SHOW-PROFILE] ${topContradictions.length} thematic contradictions (topic polarity flips)`
    );

    // 5b. Claude synthesis — narrative labels for themes + explanations for contradictions
    const SynthesisSchema = z.object({
      contradictions: z.array(z.object({
        index:       z.number().int(),
        keep:        z.boolean(),
        explanation: z.string(),
      })),
      themes: z.array(z.object({ index: z.number().int(), narrativeLabel: z.string() })),
    });
    try {
      const contradictionLines = topContradictions.slice(0, 10).map((c, i) =>
        `[${i}] Topic: "${c.topicName}"\n` +
        `  "${c.episodeATitle}" — ${c.polarityA.toUpperCase()}: "${c.textA}"\n` +
        `  "${c.episodeBTitle}" — ${c.polarityB.toUpperCase()}: "${c.textB}"`
      ).join("\n\n");

      const themeLines = topThemes.map((t, i) =>
        `[${i}] ${t.topicName} — ${t.statementCount}x across ${t.episodeCount} episodes`
      ).join("\n");

      const synthesisResult = await callClaudeJson(
        `You are a podcast intelligence analyst writing for a show intelligence dashboard.

THEMATIC CONTRADICTIONS (each shows a topic the show treated oppositely across episodes — one episode was predominantly SUPPORTIVE, another predominantly SKEPTICAL):
${contradictionLines}

THEMES (topic name + volume):
${themeLines}

Your first job is to quality-filter the contradictions. A contradiction is GENUINE only if both representative statements are about the exact same specific subject matter and the polarity flip represents the show taking an opposing stance on that same thing. Mark keep: false for any contradiction that is spurious — i.e. where the two statements are just different sub-topics that happen to share a broad category name (e.g. disliking one song vs praising a different artist's career are NOT a contradiction; recommending a restaurant vs disliking a cuisine are NOT a contradiction). Keep only contradictions where a regular listener would recognise that the show genuinely contradicted itself on the same subject.

For kept contradictions, write an explanation: name the exact subject and describe the stance shift. What changed and why does that inconsistency matter to a regular listener? (1-2 punchy sentences, reference the representative quotes if illuminating). For dropped contradictions, set explanation to "".

Also generate:
- narrativeLabel for each theme — an opinionated headline capturing the show's angle on that topic, not just the category name. Examples: "Hip-Hop Is Losing Its Soul To Commerce" not "Hip-Hop Music Discussion".

Return JSON: { contradictions: [{index, keep, explanation}], themes: [{index, narrativeLabel}] }
No markdown. Match every index exactly.`,
        SynthesisSchema,
        { model: "claude-sonnet-4-5", temperature: 0.4, maxTokens: 2048 }
      );

      // Apply explanations first (by original index), then drop spurious entries
      const explanationMap = new Map(synthesisResult.contradictions.map(c => [c.index, c.explanation]));
      topContradictions.forEach((c, i) => { c.explanation = explanationMap.get(i) ?? ""; });

      const keptIndices = new Set(synthesisResult.contradictions.filter(c => c.keep).map(c => c.index));
      const dropped = topContradictions.length - keptIndices.size;
      topContradictions.splice(0, topContradictions.length, ...topContradictions.filter((_, i) => keptIndices.has(i)));

      const labelMap = new Map(synthesisResult.themes.map(t => [t.index, t.narrativeLabel]));
      topThemes.forEach((t, i) => { (t as any).narrativeLabel = labelMap.get(i) ?? t.topicName; });

      console.log(`[SHOW-PROFILE] Claude synthesis: ${topContradictions.length} genuine contradictions (${dropped} dropped), ${synthesisResult.themes.length} narrative labels`);
    } catch (synthErr) {
      console.warn("[SHOW-PROFILE] Claude synthesis failed — saving without enrichment:", synthErr);
    }

    // 6. Polarity breakdown + dominant claim type + avg scores
    const polarityResult = await db.execute(drizzleSql`
      SELECT
        sc.polarity,
        sc.claim_type,
        COUNT(*)            AS cnt,
        AVG(sc.certainty)   AS avg_certainty,
        AVG(sc.sentiment)   AS avg_sentiment
      FROM statement_classifications sc
      JOIN statements s ON s.id = sc.statement_id
      JOIN episodes e ON e.id = s.episode_id
      WHERE e.podcast_id = ${podcastId}
      GROUP BY sc.polarity, sc.claim_type
    `);

    let supportiveCount = 0,
      skepticalCount = 0,
      neutralCount = 0,
      totalClassified = 0;
    const claimTypeCounts: Record<string, number> = {};
    let totalCertainty = 0,
      totalSentiment = 0,
      totalForAvg = 0;

    for (const row of polarityResult.rows as any[]) {
      const cnt = parseInt(row.cnt) || 0;
      if (row.polarity === "supportive") supportiveCount += cnt;
      else if (row.polarity === "skeptical") skepticalCount += cnt;
      else neutralCount += cnt;

      totalClassified += cnt;
      claimTypeCounts[row.claim_type] =
        (claimTypeCounts[row.claim_type] || 0) + cnt;

      totalCertainty += (parseFloat(row.avg_certainty) || 0) * cnt;
      totalSentiment += (parseFloat(row.avg_sentiment) || 0) * cnt;
      totalForAvg += cnt;
    }

    const polarityBreakdown =
      totalClassified > 0
        ? {
            supportive: Math.round((supportiveCount / totalClassified) * 100),
            skeptical: Math.round((skepticalCount / totalClassified) * 100),
            neutral: Math.round((neutralCount / totalClassified) * 100),
          }
        : { supportive: 0, skeptical: 0, neutral: 0 };

    let dominantClaimType: string | null = null;
    let maxCount = 0;
    for (const [type, count] of Object.entries(claimTypeCounts)) {
      if (count > maxCount) {
        maxCount = count;
        dominantClaimType = type;
      }
    }

    const avgCertainty = totalForAvg > 0 ? totalCertainty / totalForAvg : null;
    const avgSentiment = totalForAvg > 0 ? totalSentiment / totalForAvg : null;

    console.log(
      `[SHOW-PROFILE] Polarity: ${JSON.stringify(polarityBreakdown)}`
    );
    console.log(`[SHOW-PROFILE] Dominant claim type: ${dominantClaimType}`);

    // 7. Upsert the final profile
    await upsertShowProfile(podcastId, {
      episodeCount,
      totalStatements,
      totalClaims,
      topThemes: topThemes as any,
      previousTopThemes: previousTopThemes as any,
      topRecurrences: topRecurrences as any,
      topContradictions: topContradictions as any,
      polarityBreakdown: polarityBreakdown as any,
      dominantClaimType,
      avgCertainty,
      avgSentiment,
      tagFilter: null,
      status: "ready",
    });

    console.log(
      `[SHOW-PROFILE] Done — profile written for podcast ${podcastId}`
    );
  } catch (err) {
    await upsertShowProfile(podcastId, { status: "error" });
    throw err;
  }
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log("[SHOW-PROFILE] Starting standalone run");

  let targetPodcastIds: string[] = [];

  if (podcastIdArg) {
    targetPodcastIds = [podcastIdArg];
  } else {
    // Process all podcasts that have statements with classifications
    const rows = await db.execute(drizzleSql`
      SELECT DISTINCT e.podcast_id
      FROM episodes e
      JOIN statements s ON s.episode_id = e.id
      JOIN statement_classifications sc ON sc.statement_id = s.id
      ORDER BY e.podcast_id
    `);
    targetPodcastIds = (rows.rows as any[]).map((r) => r.podcast_id as string);
  }

  if (targetPodcastIds.length === 0) {
    console.log(
      "[SHOW-PROFILE] No podcasts with classified statements found — have classify_statements run yet?"
    );
    process.exit(0);
  }

  console.log(
    `[SHOW-PROFILE] Will compute profiles for ${targetPodcastIds.length} podcast(s): ${targetPodcastIds.join(", ")}`
  );

  for (const pid of targetPodcastIds) {
    await computeProfile(pid);
  }

  console.log("\n[SHOW-PROFILE] All podcasts complete");
}

main().catch((err) => {
  console.error("[SHOW-PROFILE] Fatal error:", err);
  process.exit(1);
});
