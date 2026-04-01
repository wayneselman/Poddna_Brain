import { db } from "../db";
import { callClaudeJson } from "../ai/claudeClient";
import { z } from "zod";
import { inArray } from "drizzle-orm";
import {
  episodes,
  transcriptSegments,
  claimInstances,
  episodeChapters,
} from "@shared/schema";

export const synthesisResponseSchema = z.object({
  themes: z.array(z.object({
    theme: z.string(),
    description: z.string(),
    episodeEvidence: z.array(z.object({
      episodeId: z.string(),
      episodeTitle: z.string(),
      evidence: z.string(),
    })),
    frequency: z.number(),
  })),
  patterns: z.array(z.object({
    pattern: z.string(),
    description: z.string(),
    episodeIds: z.array(z.string()),
  })),
  narrative: z.string(),
  episodeSummaries: z.array(z.object({
    episodeId: z.string(),
    title: z.string(),
    keyContribution: z.string(),
  })),
});

export type SynthesisResult = z.infer<typeof synthesisResponseSchema>;

export interface SynthesisOptions {
  query: string;
  outputFormat?: "structured" | "narrative";
  maxSegmentsPerEpisode?: number;
  systemContext?: string;
}

export interface SynthesisMeta {
  episodesRequested: number;
  episodesAnalyzed: number;
  episodesSkipped: number;
  totalSegments: number;
  totalClaims: number;
}

export function sampleSegments<T>(segments: T[], maxCount: number): T[] {
  if (segments.length <= maxCount) return segments;
  const step = segments.length / maxCount;
  const sampled: T[] = [];
  for (let i = 0; i < maxCount; i++) {
    sampled.push(segments[Math.floor(i * step)]);
  }
  return sampled;
}

export async function runCrossEpisodeSynthesis(
  episodeIds: string[],
  options: SynthesisOptions,
): Promise<{ synthesis: SynthesisResult; meta: SynthesisMeta }> {
  const { query, outputFormat = "structured", maxSegmentsPerEpisode = 80, systemContext } = options;

  const matchedEpisodes = await db
    .select({
      id: episodes.id,
      title: episodes.title,
      transcriptStatus: episodes.transcriptStatus,
      duration: episodes.duration,
    })
    .from(episodes)
    .where(inArray(episodes.id, episodeIds));

  const readyEpisodes = matchedEpisodes.filter(e => e.transcriptStatus === "ready");

  if (readyEpisodes.length === 0) {
    return {
      synthesis: { themes: [], patterns: [], narrative: "No transcribed episodes available for synthesis.", episodeSummaries: [] },
      meta: { episodesRequested: episodeIds.length, episodesAnalyzed: 0, episodesSkipped: episodeIds.length, totalSegments: 0, totalClaims: 0 },
    };
  }

  const readyIds = readyEpisodes.map(e => e.id);

  const [allSegments, allClaims, allChapters] = await Promise.all([
    db.select({
      episodeId: transcriptSegments.episodeId,
      text: transcriptSegments.text,
      speaker: transcriptSegments.speaker,
      startTime: transcriptSegments.startTime,
    })
    .from(transcriptSegments)
    .where(inArray(transcriptSegments.episodeId, readyIds))
    .orderBy(transcriptSegments.episodeId, transcriptSegments.startTime),

    db.select({
      episodeId: claimInstances.episodeId,
      claimKind: claimInstances.claimKind,
      claimText: claimInstances.claimText,
      startMs: claimInstances.startMs,
    })
    .from(claimInstances)
    .where(inArray(claimInstances.episodeId, readyIds)),

    db.select({
      episodeId: episodeChapters.episodeId,
      title: episodeChapters.title,
      summary: episodeChapters.summary,
      startTime: episodeChapters.startTime,
    })
    .from(episodeChapters)
    .where(inArray(episodeChapters.episodeId, readyIds))
    .orderBy(episodeChapters.episodeId, episodeChapters.startTime),
  ]);

  const segmentsByEpisode = new Map<string, typeof allSegments>();
  for (const seg of allSegments) {
    const list = segmentsByEpisode.get(seg.episodeId) || [];
    list.push(seg);
    segmentsByEpisode.set(seg.episodeId, list);
  }

  const claimsByEpisode = new Map<string, typeof allClaims>();
  for (const claim of allClaims) {
    if (!claim.episodeId) continue;
    const list = claimsByEpisode.get(claim.episodeId) || [];
    list.push(claim);
    claimsByEpisode.set(claim.episodeId, list);
  }

  const chaptersByEpisode = new Map<string, typeof allChapters>();
  for (const ch of allChapters) {
    const list = chaptersByEpisode.get(ch.episodeId) || [];
    list.push(ch);
    chaptersByEpisode.set(ch.episodeId, list);
  }

  let episodeContexts = "";

  for (const ep of readyEpisodes) {
    const segments = segmentsByEpisode.get(ep.id) || [];
    const claims = claimsByEpisode.get(ep.id) || [];
    const chapters = chaptersByEpisode.get(ep.id) || [];

    episodeContexts += `\n--- EPISODE: "${ep.title}" (ID: ${ep.id}) ---\n`;

    if (chapters.length > 0) {
      episodeContexts += `CHAPTERS:\n`;
      for (const ch of chapters) {
        episodeContexts += `- ${ch.title}${ch.summary ? ': ' + ch.summary : ''}\n`;
      }
    }

    if (claims.length > 0) {
      episodeContexts += `CLAIMS/KEY POINTS:\n`;
      const claimsByKind = new Map<string, string[]>();
      for (const c of claims) {
        const kind = c.claimKind || "general";
        const list = claimsByKind.get(kind) || [];
        list.push(c.claimText || "");
        claimsByKind.set(kind, list);
      }
      for (const [kind, texts] of claimsByKind) {
        episodeContexts += `  [${kind}]: ${texts.join("; ")}\n`;
      }
    }

    const sampledSegments = sampleSegments(segments, maxSegmentsPerEpisode);
    if (sampledSegments.length > 0) {
      episodeContexts += `TRANSCRIPT EXCERPTS (${sampledSegments.length} of ${segments.length} segments):\n`;
      for (const seg of sampledSegments) {
        const speaker = seg.speaker ? `[${seg.speaker}] ` : "";
        episodeContexts += `${speaker}${seg.text}\n`;
      }
    }
  }

  const systemPreamble = systemContext
    ? `${systemContext}\n\n`
    : "You are a cross-episode intelligence analyst. ";

  const prompt = `${systemPreamble}You have been given data from ${readyEpisodes.length} episodes and a user query.

USER QUERY: ${query}

EPISODES DATA:
${episodeContexts}

Based on the data above, produce a JSON response with:

1. "themes": Array of recurring themes found across episodes. Each theme has:
   - "theme": short theme name
   - "description": 1-2 sentence explanation
   - "episodeEvidence": array of { "episodeId", "episodeTitle", "evidence" (specific quote or observation from that episode) }
   - "frequency": number of episodes this theme appears in

2. "patterns": Array of patterns, trends, or progressions observed across episodes. Each has:
   - "pattern": short name
   - "description": explanation of the pattern
   - "episodeIds": which episodes exhibit this pattern

3. "narrative": A ${outputFormat === "narrative" ? "detailed 3-5 paragraph" : "concise 1-2 paragraph"} narrative synthesis that directly answers the user's query, weaving together insights from across all episodes.

4. "episodeSummaries": For each episode, a brief "keyContribution" describing what that episode uniquely adds to the overall picture.
   - "episodeId", "title", "keyContribution"

Focus on answering the user's specific query. Identify genuine cross-episode patterns rather than restating individual episode content. Be specific with evidence.

Return ONLY valid JSON matching this structure.`;

  console.log(`[SYNTHESIS] Prompt: ${prompt.length} chars for ${readyEpisodes.length} episodes`);

  const result = await callClaudeJson(prompt, synthesisResponseSchema, {
    maxTokens: 8192,
    temperature: 0.5,
  });

  console.log(`[SYNTHESIS] Complete: ${result.themes.length} themes, ${result.patterns.length} patterns`);

  return {
    synthesis: result,
    meta: {
      episodesRequested: episodeIds.length,
      episodesAnalyzed: readyEpisodes.length,
      episodesSkipped: episodeIds.length - readyEpisodes.length,
      totalSegments: allSegments.length,
      totalClaims: allClaims.length,
    },
  };
}
