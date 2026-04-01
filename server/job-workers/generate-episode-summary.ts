import { storage } from "../storage";
import { callClaudeJson, ClaudeError } from "../ai/claudeClient";
import { z } from "zod";
import type { Job, EpisodeSummary, EpisodeSegment, EpisodeClaim, ViralMoment } from "@shared/schema";

export interface GenerateEpisodeSummaryResult {
  episodeId: string;
  summary: EpisodeSummary;
}

const EpisodeSummarySchema = z.object({
  headline: z.string(),
  subheadline: z.string().optional(),
  primaryInsight: z.object({
    label: z.enum(["Key Decision", "The Pattern", "The Tradeoff", "Core Insight", "The Bet"]),
    statement: z.string(),
  }),
  replayReason: z.string(),
  tags: z.array(z.string()),
  playbookType: z.string().optional(),
});

type ParsedSummary = z.infer<typeof EpisodeSummarySchema>;

export async function handleGenerateEpisodeSummaryJob(
  job: Job,
  onProgress: (message: string, percentage: number) => void
): Promise<GenerateEpisodeSummaryResult> {
  onProgress("Starting episode summary generation", 0);

  if (!job.episodeSourceId) {
    throw new ClaudeError("Job missing episodeSourceId", false);
  }

  const source = await storage.getEpisodeSource(job.episodeSourceId);
  if (!source) {
    throw new ClaudeError(`Episode source not found: ${job.episodeSourceId}`, false);
  }

  const episode = await storage.getEpisode(source.episodeId);
  if (!episode) {
    throw new ClaudeError(`Episode not found: ${source.episodeId}`, false);
  }

  onProgress("Fetching narrative segments and claims", 10);

  const narrativeSegments: EpisodeSegment[] = await storage.getEpisodeSegmentsByEpisode(source.episodeId);
  const claims: EpisodeClaim[] = await storage.getClaimsByEpisodeId(source.episodeId);
  const keyMoments: ViralMoment[] = await storage.getViralMomentsByEpisode(source.episodeId);

  if (!narrativeSegments.length && !claims.length) {
    throw new ClaudeError(
      `No narrative segments or claims found for episode ${source.episodeId}. Analysis must complete first.`,
      false
    );
  }

  onProgress("Generating summary with Claude Sonnet 4.5", 30);

  const narrativeContext = narrativeSegments.slice(0, 5).map((seg: EpisodeSegment) => ({
    title: seg.title,
    summary: seg.summary,
    topics: seg.topics,
  }));

  const claimsContext = claims.slice(0, 15).map((c: EpisodeClaim) => ({
    claim: c.claimText,
    claimType: c.claimType,
    confidence: c.confidence,
  }));

  const prompt = `You are an editorial intelligence system for a podcast analysis platform. Generate a canonical "Episode Card Spine" - a derived summary object that will be used to render cards across the platform.

CRITICAL RULES:
1. The primaryInsight.statement and replayReason MUST be semantically DISTINCT
2. primaryInsight.statement = The WHAT (the core pattern, decision, or insight)
3. replayReason = The SO WHAT (why a founder would want to revisit this - the implication, not a paraphrase)
4. Never repeat the same idea in both fields - they serve different purposes
5. Use neutral, editorial-quality language - no hype or marketing speak

EPISODE CONTEXT:
Title: ${episode.title}
Duration: ${Math.round((episode.duration || 0) / 60)} minutes

NARRATIVE SEGMENTS:
${JSON.stringify(narrativeContext, null, 2)}

TOP CLAIMS:
${JSON.stringify(claimsContext, null, 2)}

Generate a JSON object with this structure:
{
  "headline": "8-14 word neutral headline summarizing the episode",
  "subheadline": "Optional clarifier about the speaker or context",
  "primaryInsight": {
    "label": "One of: Key Decision | The Pattern | The Tradeoff | Core Insight | The Bet",
    "statement": "A single sentence capturing the core insight - what the episode reveals"
  },
  "replayReason": "A single sentence explaining why founders replay this - the implication or application (MUST be different from primaryInsight.statement)",
  "tags": ["Array of 2-4 topic tags like: Product, Growth, Hiring, Leadership, Strategy, AI & Tech"],
  "playbookType": "Founder | Operator | Investor (optional)"
}

VALIDATION CHECK: Before outputting, verify that replayReason does NOT paraphrase primaryInsight.statement. They should answer different questions:
- primaryInsight.statement answers: "What did they discover/decide?"
- replayReason answers: "Why would I want to learn from this?"

Return ONLY the JSON object.`;

  const parsed = await callClaudeJson<ParsedSummary>(prompt, EpisodeSummarySchema, {
    model: "claude-sonnet-4-5",
    maxTokens: 2048,
    temperature: 0.3,
  });

  onProgress("Validating summary quality", 70);

  // Collect quote texts from key moments for validation
  const quoteTexts = keyMoments
    .map((m: ViralMoment) => (m as any).pullQuote || (m as any).text || "")
    .filter((q: string) => q.length > 20)
    .slice(0, 5);

  // Validation 1: Check similarity between primaryInsight and replayReason
  const similarity = computeTextSimilarity(
    parsed.primaryInsight.statement.toLowerCase(),
    parsed.replayReason.toLowerCase()
  );

  // Validation 2: Check if replayReason is too similar to any quote text
  let maxQuoteSimilarity = 0;
  for (const quote of quoteTexts) {
    const quoteSim = computeTextSimilarity(
      parsed.replayReason.toLowerCase(),
      quote.toLowerCase()
    );
    if (quoteSim > maxQuoteSimilarity) {
      maxQuoteSimilarity = quoteSim;
    }
  }

  const needsRetry = similarity > 0.7 || maxQuoteSimilarity > 0.7;
  let retryReason = "";
  if (similarity > 0.7) {
    retryReason = `primaryInsight ≈ replayReason (${similarity.toFixed(2)})`;
  } else if (maxQuoteSimilarity > 0.7) {
    retryReason = `replayReason ≈ quote text (${maxQuoteSimilarity.toFixed(2)})`;
  }

  if (needsRetry) {
    console.warn(`[SUMMARY-JOB] Validation failed: ${retryReason} - regenerating`);
    
    const retryPrompt = `${prompt}

RETRY: Your previous response had issues: ${retryReason}
Make the replayReason MORE DISTINCT:
- It should NOT paraphrase the primaryInsight.statement
- It should NOT repeat or closely match any verbatim quote from the episode
- It should be about the APPLICATION, IMPLICATION, or WHY someone would want to learn this`;

    const retryParsed = await callClaudeJson<ParsedSummary>(retryPrompt, EpisodeSummarySchema, {
      model: "claude-sonnet-4-5",
      maxTokens: 2048,
      temperature: 0.5,
    });

    // Re-validate after retry
    const retrySimilarity = computeTextSimilarity(
      retryParsed.primaryInsight.statement.toLowerCase(),
      retryParsed.replayReason.toLowerCase()
    );

    let retryMaxQuoteSim = 0;
    for (const quote of quoteTexts) {
      const quoteSim = computeTextSimilarity(
        retryParsed.replayReason.toLowerCase(),
        quote.toLowerCase()
      );
      if (quoteSim > retryMaxQuoteSim) {
        retryMaxQuoteSim = quoteSim;
      }
    }

    if (retrySimilarity > 0.7 || retryMaxQuoteSim > 0.7) {
      const failReason = retrySimilarity > 0.7
        ? `primaryInsight ≈ replayReason (${retrySimilarity.toFixed(2)})`
        : `replayReason ≈ quote (${retryMaxQuoteSim.toFixed(2)})`;
      throw new ClaudeError(
        `Failed to generate distinct summary fields after retry. ${failReason}`,
        true
      );
    }

    Object.assign(parsed, retryParsed);
  }

  onProgress("Saving episode summary", 85);

  const summary: EpisodeSummary = {
    headline: parsed.headline,
    subheadline: parsed.subheadline,
    primaryInsight: parsed.primaryInsight,
    replayReason: parsed.replayReason,
    evidence: {
      narrativeSegmentId: narrativeSegments[0]?.id,
      keyMomentIds: keyMoments.slice(0, 2).map(m => m.id),
      claimIds: claims.slice(0, 6).map(c => c.id),
    },
    stats: {
      narrativeCount: narrativeSegments.length,
      keyMomentsCount: keyMoments.length,
      claimsCount: claims.length,
    },
    tags: parsed.tags,
    playbookType: parsed.playbookType,
    generatedAt: new Date().toISOString(),
  };

  await storage.updateEpisodeSummary(source.episodeId, summary);

  onProgress("Episode summary generation complete", 100);
  console.log(`[SUMMARY-JOB] Generated summary for episode ${source.episodeId}`);

  return {
    episodeId: source.episodeId,
    summary,
  };
}

function computeTextSimilarity(a: string, b: string): number {
  const wordsAArr = a.split(/\s+/).filter(w => w.length > 3);
  const wordsBArr = b.split(/\s+/).filter(w => w.length > 3);
  const wordsB = new Set(wordsBArr);
  
  if (wordsAArr.length === 0 || wordsBArr.length === 0) return 0;
  
  let intersection = 0;
  for (let i = 0; i < wordsAArr.length; i++) {
    if (wordsB.has(wordsAArr[i])) intersection++;
  }
  
  return (2 * intersection) / (wordsAArr.length + wordsBArr.length);
}
