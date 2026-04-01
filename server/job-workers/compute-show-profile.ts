import { storage } from "../storage";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { callClaudeJson } from "../ai/claudeClient";
import type { Job } from "@shared/schema";
import { CONTRADICTION_FILTERS } from "../config/contradiction-filters";

// ──────────────────────────────────────────────────────────────────────────────
// Viral-moments-based profile synthesis (used when statements pipeline is empty)
// ──────────────────────────────────────────────────────────────────────────────
const AiShowProfileSchema = z.object({
  topThemes: z.array(z.object({
    topicName: z.string(),
    statementCount: z.number().int(),
    episodeCount: z.number().int(),
    representativeText: z.string(),
  })),
  topRecurrences: z.array(z.object({
    text: z.string(),
    occurrenceCount: z.number().int(),
    episodeCount: z.number().int(),
    frequencyLabel: z.string(),
  })),
  topContradictions: z.array(z.object({
    textA: z.string(),
    textB: z.string(),
    episodeATitle: z.string(),
    episodeBTitle: z.string(),
    confidence: z.number(),
    explanation: z.string(),
  })),
  polarityBreakdown: z.object({
    supportive: z.number().int(),
    neutral: z.number().int(),
    skeptical: z.number().int(),
  }),
});

async function computeProfileFromViralMoments(
  podcastId: string,
  onProgress?: (msg: string, pct: number) => void
) {
  onProgress?.("Loading viral moments for AI synthesis...", 15);

  const rows = await db.execute(sql`
    SELECT
      vm.suggested_title, vm.hook_reason, vm.topics, vm.content_type,
      vm.virality_score, vm.hook_type, vm.text,
      e.id AS episode_id, e.title AS episode_title
    FROM viral_moments vm
    JOIN episodes e ON e.id = vm.episode_id
    WHERE e.podcast_id = ${podcastId}
    ORDER BY vm.virality_score DESC
  `);

  const moments = rows.rows;
  const episodeCount = new Set(moments.map(m => m.episode_id as string)).size;

  onProgress?.("Building topic frequency map...", 25);

  // Build topic frequency map for the AI prompt
  const topicFreq: Map<string, { count: number; episodes: Set<string> }> = new Map();
  for (const m of moments) {
    for (const t of (Array.isArray(m.topics) ? m.topics as string[] : [])) {
      if (!topicFreq.has(t)) topicFreq.set(t, { count: 0, episodes: new Set() });
      topicFreq.get(t)!.count++;
      topicFreq.get(t)!.episodes.add(m.episode_id as string);
    }
  }
  const topTopics = Array.from(topicFreq.entries())
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, 20)
    .map(([name, d]) => `${name} (${d.count}x, ${d.episodes.size} eps)`);

  // Build a condensed moment list for the AI
  const momentSummaries = moments.slice(0, 50).map((m, i) => (
    `[${i + 1}] ep="${m.episode_title}" score=${m.virality_score} ` +
    `type=${m.content_type} title="${m.suggested_title}" ` +
    `hook="${String(m.hook_reason || "").slice(0, 100)}"`
  )).join("\n");

  onProgress?.("Synthesizing show intelligence with AI...", 40);

  // Proportional threshold: how many episodes must a pattern span to qualify as show-level
  const minEpThreshold = episodeCount >= 25 ? 4 : episodeCount >= 10 ? 3 : 2;

  const prompt = `You are a podcast intelligence analyst. Analyze these ${moments.length} viral moments from a podcast with ${episodeCount} episodes and generate a structured show profile.

TOP TOPICS (by frequency):
${topTopics.join(", ")}

VIRAL MOMENTS (top 50 by score):
${momentSummaries}

Generate a JSON show profile with these FOUR DISTINCT sections:

1. topThemes: 6-8 TOPICAL themes — the SUBJECT MATTER this show covers (e.g. "relationships", "mental health", "hip-hop culture"). These are content categories. Each: { topicName, statementCount (int), episodeCount (int), representativeText (one moment title illustrating it) }

2. topRecurrences: 2-6 BEHAVIORAL or STRUCTURAL patterns — HOW the show engages, not what it covers. These describe the show's argument style, rhetorical moves, or structural habits across episodes (e.g. "hosts consistently play devil's advocate on social media takes", "personal anecdote escalates into cultural critique", "guests are challenged to defend an unpopular position"). DO NOT repeat topic names from topThemes here. CRITICAL: only include a pattern if evidence spans ${minEpThreshold}+ distinct episodes. If the same topic appears in topThemes, describe the behavioral pattern around it, not the topic itself. If no behavioral pattern meets the threshold, return an empty array. Each: { text (the behavioral/structural pattern), occurrenceCount (int), episodeCount (int, must be >= ${minEpThreshold}), frequencyLabel (e.g. "${minEpThreshold}x across ${minEpThreshold} episodes") }

3. topContradictions: 0-3 cases of conflicting positions. Include both within-episode tensions (same episode) and cross-episode stance reversals (different episodes). Each: { textA, textB, episodeATitle, episodeBTitle, confidence (0-1), explanation }

4. polarityBreakdown: percent breakdown (must sum to 100) based on the overall emotional tone across ALL moments { supportive (positive/uplifting/affirming), neutral (informational/balanced), skeptical (critical/controversial/challenging) }

Return ONLY valid JSON matching this exact schema. No markdown.`;

  const aiResult = await callClaudeJson(prompt, AiShowProfileSchema, {
    model: "claude-sonnet-4-5",
    temperature: 0,
    maxTokens: 4096,
  });

  onProgress?.("AI synthesis complete, saving profile...", 80);

  const topThemes = aiResult.topThemes.map((t, idx) => ({
    topicId: `vm-theme-${idx}`,
    topicName: t.topicName,
    statementCount: t.statementCount,
    episodeCount: t.episodeCount,
    representativeText: t.representativeText,
    trend: "new" as const,
  }));

  // Filter: only include recurrences that genuinely span the required number of episodes
  const qualifiedRecurrences = aiResult.topRecurrences
    .filter(r => r.episodeCount >= minEpThreshold)
    .map(r => ({ ...r, firstSeen: null, lastSeen: null }));

  // Tag contradictions: withinEpisode=true when both sides come from the same episode
  const taggedContradictions = aiResult.topContradictions.map(c => ({
    ...c,
    withinEpisode: c.episodeATitle === c.episodeBTitle,
  }));

  console.log(`[SHOW-PROFILE] Recurrences: ${aiResult.topRecurrences.length} from AI, ${qualifiedRecurrences.length} qualify (threshold: ${minEpThreshold}+ episodes)`);
  console.log(`[SHOW-PROFILE] Contradictions: ${taggedContradictions.filter(c => c.withinEpisode).length} within-episode, ${taggedContradictions.filter(c => !c.withinEpisode).length} cross-episode`);

  return {
    episodeCount,
    totalStatements: moments.length, // viral moments as proxy for "statements"
    totalClaims: 0,
    topThemes,
    topRecurrences: qualifiedRecurrences,
    topContradictions: taggedContradictions,
    polarityBreakdown: aiResult.polarityBreakdown,
    dominantClaimType: null,
    avgCertainty: null,
    avgSentiment: null,
  };
}

export async function handleComputeShowProfileJob(
  job: Job,
  onProgress?: (msg: string, pct: number) => void
) {
  const payload = job.result && typeof job.result === "object" ? job.result as Record<string, string>
    : typeof job.result === "string" ? JSON.parse(job.result as string) : {};
  const { podcastId, tag } = payload as { podcastId: string; tag?: string };

  if (!podcastId) {
    throw new Error("compute_show_profile requires podcastId in payload");
  }

  const tagFilter = tag || null;
  const tagLabel = tagFilter ? ` [tag: ${tagFilter}]` : "";
  console.log(`[SHOW-PROFILE] Computing profile for podcast ${podcastId}${tagLabel}`);
  onProgress?.("Starting show profile computation", 0);

  const existingProfile = await storage.getShowProfile(podcastId, tagFilter);
  const previousTopThemes = existingProfile?.topThemes || [];

  await storage.upsertShowProfile(podcastId, {
    status: "computing",
    episodeCount: existingProfile?.episodeCount || 0,
    tagFilter,
  }, tagFilter);

  const tagJoin = tagFilter
    ? sql`JOIN creator_processed_episodes cpe ON cpe.episode_id = e.id AND ${tagFilter} = ANY(cpe.tags)`
    : sql``;

  try {
    const episodeCountResult = await db.execute(sql`
      SELECT COUNT(DISTINCT e.id) as cnt
      FROM episodes e
      JOIN statements s ON s.episode_id = e.id
      ${tagJoin}
      WHERE e.podcast_id = ${podcastId}
    `);
    const episodeCount = parseInt(episodeCountResult.rows[0]?.cnt as string) || 0;
    // Proportional threshold: patterns must span this many episodes to qualify as show-level
    const minEpThreshold = episodeCount >= 25 ? 4 : episodeCount >= 10 ? 3 : 2;
    console.log(`[SHOW-PROFILE] Found ${episodeCount} analyzed episodes for podcast ${podcastId}`);
    onProgress?.(`Found ${episodeCount} analyzed episodes`, 10);

    if (episodeCount < 5) {
      // Check if viral moments pipeline has enough data to synthesize a profile instead
      const viralCountResult = await db.execute(sql`
        SELECT COUNT(DISTINCT e.id) as cnt
        FROM viral_moments vm
        JOIN episodes e ON e.id = vm.episode_id
        WHERE e.podcast_id = ${podcastId}
      `);
      const viralEpisodeCount = parseInt(viralCountResult.rows[0]?.cnt as string) || 0;

      if (viralEpisodeCount >= 5) {
        console.log(`[SHOW-PROFILE] No statements found but ${viralEpisodeCount} episodes have viral moments — using AI synthesis path`);
        const vmProfile = await computeProfileFromViralMoments(podcastId, onProgress);
        await storage.upsertShowProfile(podcastId, {
          ...vmProfile,
          topThemes: vmProfile.topThemes as any,
          topRecurrences: vmProfile.topRecurrences as any,
          topContradictions: vmProfile.topContradictions as any,
          polarityBreakdown: vmProfile.polarityBreakdown as any,
          tagFilter,
          status: "ready",
        }, tagFilter);
        console.log(`[SHOW-PROFILE] AI-synthesized profile saved for podcast ${podcastId} (${vmProfile.episodeCount} episodes, ${vmProfile.totalStatements} viral moments)`);
        return { success: true, episodeCount: vmProfile.episodeCount, message: "AI-synthesized from viral moments" };
      }

      await storage.upsertShowProfile(podcastId, {
        episodeCount,
        status: "ready",
        totalStatements: 0,
        totalClaims: 0,
        topThemes: [],
        topRecurrences: [],
        topContradictions: [],
        polarityBreakdown: {},
        dominantClaimType: null,
        avgCertainty: null,
        avgSentiment: null,
        tagFilter,
      }, tagFilter);
      console.log(`[SHOW-PROFILE] Podcast ${podcastId} has ${episodeCount} episodes (< 5), profile marked ready with minimal data`);
      return { success: true, episodeCount, message: "Below threshold" };
    }

    onProgress?.("Counting statements and claims", 20);
    const statsResult = await db.execute(sql`
      SELECT
        COUNT(s.id) as total_statements,
        COUNT(sc.id) FILTER (WHERE sc.claim_flag = true) as total_claims
      FROM statements s
      JOIN episodes e ON e.id = s.episode_id
      ${tagJoin}
      LEFT JOIN statement_classifications sc ON sc.statement_id = s.id
      WHERE e.podcast_id = ${podcastId}
    `);
    const totalStatements = parseInt(statsResult.rows[0]?.total_statements as string) || 0;
    const totalClaims = parseInt(statsResult.rows[0]?.total_claims as string) || 0;
    console.log(`[SHOW-PROFILE] Total statements: ${totalStatements}, total claims: ${totalClaims}`);

    onProgress?.("Discovering top themes", 30);
    const themesResult = await db.execute(sql`
      SELECT
        t.id as topic_id,
        t.name as topic_name,
        COUNT(st.id) as statement_count,
        COUNT(DISTINCT e.id) as episode_count,
        (
          SELECT s2.text FROM statements s2
          JOIN statement_topics st2 ON st2.statement_id = s2.id
          WHERE st2.topic_id = t.id
          AND s2.episode_id IN (SELECT id FROM episodes WHERE podcast_id = ${podcastId})
          ORDER BY st2.confidence DESC
          LIMIT 1
        ) as representative_text
      FROM statement_topics st
      JOIN topics t ON t.id = st.topic_id
      JOIN statements s ON s.id = st.statement_id
      JOIN episodes e ON e.id = s.episode_id
      ${tagJoin}
      WHERE e.podcast_id = ${podcastId}
      GROUP BY t.id, t.name
      HAVING COUNT(st.id) >= 50
      ORDER BY statement_count DESC
      LIMIT 12
    `);

    const previousThemesMap = new Map<string, number>();
    if (Array.isArray(previousTopThemes)) {
      (previousTopThemes as any[]).forEach((theme: any, idx: number) => {
        if (theme?.topicId) {
          previousThemesMap.set(theme.topicId, idx);
        }
      });
    }

    const topThemes = themesResult.rows.map((row: any, currentIdx: number) => {
      let trend: "up" | "down" | "stable" | "new" = "new";
      if (previousThemesMap.has(row.topic_id)) {
        const prevIdx = previousThemesMap.get(row.topic_id)!;
        if (currentIdx < prevIdx) trend = "up";
        else if (currentIdx > prevIdx) trend = "down";
        else trend = "stable";
      }
      const stmtCount = parseInt(row.statement_count) || 0;
      const epCount   = parseInt(row.episode_count)   || 0;
      return {
        topicId:            row.topic_id,
        topicName:          row.topic_name,
        narrativeLabel:     row.topic_name,   // overwritten by Claude synthesis below
        statementCount:     stmtCount,
        episodeCount:       epCount,
        representativeText: row.representative_text || "",
        frequencyLabel:     `${stmtCount}x across ${epCount} episode${epCount === 1 ? "" : "s"}`,
        trend,
      };
    });
    console.log(`[SHOW-PROFILE] Found ${topThemes.length} top themes`);

    onProgress?.("Finding recurrence patterns", 50);
    const recurrencesResult = await db.execute(sql`
      SELECT
        sa.text as text,
        COUNT(sr.id) as occurrence_count,
        COUNT(DISTINCT e.id) as episode_count,
        MIN(e.published_at) as first_seen,
        MAX(e.published_at) as last_seen
      FROM statement_relations sr
      JOIN statements sa ON sa.id = sr.statement_a_id
      JOIN episodes e ON e.id = sr.episode_id
      ${tagJoin}
      WHERE sr.relation = 'recurrence'
        AND sr.scope = 'cross_episode'
        AND e.podcast_id = ${podcastId}
      GROUP BY sa.text
      HAVING COUNT(DISTINCT e.id) >= ${minEpThreshold}
      ORDER BY occurrence_count DESC
      LIMIT 10
    `);

    const topRecurrences = recurrencesResult.rows.map((row: any) => {
      const occCount = parseInt(row.occurrence_count) || 0;
      const epCount = parseInt(row.episode_count) || 0;
      let frequencyLabel = `${occCount}x across ${epCount} episodes`;
      if (row.first_seen && row.last_seen) {
        const firstDate = new Date(row.first_seen);
        const lastDate = new Date(row.last_seen);
        const daysDiff = Math.round((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24));
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
    console.log(`[SHOW-PROFILE] Found ${topRecurrences.length} recurrence patterns`);

    onProgress?.("Detecting stance evolution", 60);
    // ── Topic-level polarity-flip contradictions ──────────────────────────────
    // Finds topics that appear across episodes with opposite dominant polarity
    // (supportive in one episode, skeptical in another). This produces substantive
    // thematic contradictions instead of noisy sentence-pair snippets.
    const contradictionsResult = await db.execute(sql`
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
        ${tagFilter ? sql`JOIN creator_processed_episodes cpe ON cpe.episode_id = e.id AND ${tagFilter} = ANY(cpe.tags)` : sql``}
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

    const topContradictions = contradictionsResult.rows.map((row: any) => ({
      topicName:     row.topic_name,
      textA:         row.text_a  || "",
      textB:         row.text_b  || "",
      episodeATitle: row.episode_a_title,
      episodeBTitle: row.episode_b_title,
      polarityA:     row.polarity_a,
      polarityB:     row.polarity_b,
      flipStrength:  parseFloat(row.flip_strength) || 0,
      explanation:   "",   // populated by Claude synthesis below
      withinEpisode: false,
    }));
    // Each topic appears at most once (DISTINCT ON topic_id) — no further dedup needed.
    const dedupedContradictions = topContradictions;
    console.log(`[SHOW-PROFILE] Found ${dedupedContradictions.length} thematic contradictions (topic polarity flips)`);

    // ── Claude synthesis: narrative labels for themes + explanations for contradictions ──
    onProgress?.("Synthesising intelligence narratives with AI...", 68);
    try {
      const SynthesisSchema = z.object({
        contradictions: z.array(z.object({
          index:       z.number().int(),
          keep:        z.boolean(),
          explanation: z.string(),
        })),
        themes: z.array(z.object({ index: z.number().int(), narrativeLabel: z.string() })),
      });

      const contradictionLines = dedupedContradictions.slice(0, 10).map((c, i) =>
        `[${i}] Topic: "${c.topicName}"\n` +
        `  "${c.episodeATitle}" — ${c.polarityA.toUpperCase()}: "${c.textA}"\n` +
        `  "${c.episodeBTitle}" — ${c.polarityB.toUpperCase()}: "${c.textB}"`
      ).join("\n\n");

      const themeLines = topThemes.map((t, i) =>
        `[${i}] ${t.topicName} — ${t.frequencyLabel}`
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
- narrativeLabel for each theme — an opinionated headline capturing the show's angle on that topic, not just the category name. Examples: "Hip-Hop Is Losing Its Soul To Commerce" not "Hip-Hop Music Discussion". "Nobody Agrees On Who Was There Or What Happened" not "Interpersonal Conflict & Accusations".

Return JSON: { contradictions: [{index, keep, explanation}], themes: [{index, narrativeLabel}] }
No markdown. Match every index exactly.`,
        SynthesisSchema,
        { model: "claude-sonnet-4-5", temperature: 0.4, maxTokens: 2048 }
      );

      // Apply explanations first (by original index), then drop spurious entries
      const explanationMap = new Map(synthesisResult.contradictions.map(c => [c.index, c.explanation]));
      dedupedContradictions.forEach((c, i) => { c.explanation = explanationMap.get(i) ?? ""; });

      const keptIndices = new Set(synthesisResult.contradictions.filter(c => c.keep).map(c => c.index));
      const dropped = dedupedContradictions.length - keptIndices.size;
      dedupedContradictions.splice(0, dedupedContradictions.length, ...dedupedContradictions.filter((_, i) => keptIndices.has(i)));

      const labelMap = new Map(synthesisResult.themes.map(t => [t.index, t.narrativeLabel]));
      topThemes.forEach((t, i) => { (t as any).narrativeLabel = labelMap.get(i) ?? t.topicName; });

      console.log(`[SHOW-PROFILE] Claude synthesis: ${dedupedContradictions.length} genuine contradictions (${dropped} dropped), ${synthesisResult.themes.length} narrative labels`);
    } catch (synthErr) {
      console.warn("[SHOW-PROFILE] Claude synthesis failed — saving without enrichment:", synthErr);
    }
    // ────────────────────────────────────────────────────────────────────────────

    onProgress?.("Computing polarity and tone", 75);
    const polarityResult = await db.execute(sql`
      SELECT
        sc.polarity,
        COUNT(*) as cnt,
        sc.claim_type,
        AVG(sc.certainty) as avg_certainty,
        AVG(sc.sentiment) as avg_sentiment
      FROM statement_classifications sc
      JOIN statements s ON s.id = sc.statement_id
      JOIN episodes e ON e.id = s.episode_id
      ${tagJoin}
      WHERE e.podcast_id = ${podcastId}
      GROUP BY sc.polarity, sc.claim_type
    `);

    let supportiveCount = 0, skepticalCount = 0, neutralCount = 0;
    let totalClassified = 0;
    const claimTypeCounts: Record<string, number> = {};
    let totalCertainty = 0, totalSentiment = 0, totalForAvg = 0;

    for (const row of polarityResult.rows) {
      const cnt = parseInt(row.cnt as string) || 0;
      const polarity = row.polarity as string;
      const claimType = row.claim_type as string;

      if (polarity === "supportive") supportiveCount += cnt;
      else if (polarity === "skeptical") skepticalCount += cnt;
      else neutralCount += cnt;

      totalClassified += cnt;
      claimTypeCounts[claimType] = (claimTypeCounts[claimType] || 0) + cnt;

      totalCertainty += (parseFloat(row.avg_certainty as string) || 0) * cnt;
      totalSentiment += (parseFloat(row.avg_sentiment as string) || 0) * cnt;
      totalForAvg += cnt;
    }

    const polarityBreakdown = totalClassified > 0
      ? {
          supportive: Math.round((supportiveCount / totalClassified) * 100),
          skeptical: Math.round((skepticalCount / totalClassified) * 100),
          neutral: Math.round((neutralCount / totalClassified) * 100),
        }
      : { supportive: 0, skeptical: 0, neutral: 0 };

    let dominantClaimType: string | null = null;
    let maxClaimCount = 0;
    for (const [type, count] of Object.entries(claimTypeCounts)) {
      if (count > maxClaimCount) {
        maxClaimCount = count;
        dominantClaimType = type;
      }
    }

    const avgCertainty = totalForAvg > 0 ? totalCertainty / totalForAvg : null;
    const avgSentiment = totalForAvg > 0 ? totalSentiment / totalForAvg : null;

    console.log(`[SHOW-PROFILE] Polarity: ${JSON.stringify(polarityBreakdown)}, dominant claim type: ${dominantClaimType}`);

    onProgress?.("Saving show profile", 90);
    await storage.upsertShowProfile(podcastId, {
      episodeCount,
      totalStatements,
      totalClaims,
      topThemes: topThemes as any,
      previousTopThemes: previousTopThemes as any,
      topRecurrences: topRecurrences as any,
      topContradictions: dedupedContradictions as any,
      polarityBreakdown: polarityBreakdown as any,
      dominantClaimType,
      avgCertainty,
      avgSentiment,
      tagFilter,
      status: "ready",
    }, tagFilter);

    console.log(`[SHOW-PROFILE] Profile computed and saved for podcast ${podcastId}${tagLabel} (${episodeCount} episodes, ${totalStatements} statements)`);
    onProgress?.("Show profile computation complete", 100);

    return {
      success: true,
      episodeCount,
      totalStatements,
      totalClaims,
      themesFound: topThemes.length,
      recurrencesFound: topRecurrences.length,
      contradictionsFound: dedupedContradictions.length,
    };
  } catch (error) {
    console.error(`[SHOW-PROFILE] Error computing profile for podcast ${podcastId}${tagLabel}:`, error);
    await storage.upsertShowProfile(podcastId, { status: "error", tagFilter }, tagFilter);
    throw error;
  }
}
