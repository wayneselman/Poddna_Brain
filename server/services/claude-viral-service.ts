import { z } from "zod";
import { callClaudeWithConversation, ClaudeError, type CachedSystemMessage, type ConversationMessage } from "../ai/claudeClient";
import type { TranscriptSegment, InsertViralMoment } from "@shared/schema";
import { snapMomentTimestamps } from "./timestamp-snapper";

const validHookTypes = ["numerical_framework", "paradox", "underdog_story", "status_threat", "tactical_playbook", "vulnerable_confession"] as const;
const validShareabilityFactors = ["contrarian", "quantified", "aspirational", "vulnerable", "actionable", "emotional"] as const;
const validContentTypes = ["tactical", "insight", "story", "confession", "framework"] as const;

const ViralMomentSchema = z.object({
  start_time: z.number(),
  end_time: z.number(),
  text: z.string().min(1),
  virality_score: z.number().min(0).max(100),
  pull_quote: z.string().min(1),
  hook_reason: z.string().min(1),
  hook_type: z.string().transform(v => {
    if (validHookTypes.includes(v as any)) return v as typeof validHookTypes[number];
    if (v === "framework") return "numerical_framework";
    if (v === "confession") return "vulnerable_confession";
    if (v === "tactical") return "tactical_playbook";
    return "paradox";
  }),
  shareability_factors: z.array(z.string()).transform(arr => 
    arr.filter(v => validShareabilityFactors.includes(v as any)) as (typeof validShareabilityFactors[number])[]
  ),
  suggested_title: z.string().min(1),
  topics: z.array(z.string()).optional().transform(v => v ?? []),
  content_type: z.string().transform(v => {
    if (validContentTypes.includes(v as any)) return v as typeof validContentTypes[number];
    return "insight";
  }),
  entities: z.array(z.string()).optional().transform(v => v ?? []),
});

const CandidateMomentsSchema = z.object({
  candidates: z.array(ViralMomentSchema),
});

const CritiquedMomentsSchema = z.object({
  approved: z.array(z.object({
    index: z.number(),
    revised_score: z.number(),
    revision_reason: z.string().optional(),
  })),
  rejected: z.array(z.object({
    index: z.number(),
    rejection_reason: z.string(),
  })),
});

const FinalMomentSchema = z.object({
  start_time: z.number(),
  end_time: z.number(),
  text: z.string().min(1),
  virality_score: z.number().min(0).max(100),
  pull_quote: z.string().min(1),
  hook_reason: z.string().min(1),
  hook_type: z.string().transform(v => {
    if (validHookTypes.includes(v as any)) return v as typeof validHookTypes[number];
    if (v === "framework") return "numerical_framework";
    if (v === "confession") return "vulnerable_confession";
    if (v === "tactical") return "tactical_playbook";
    return "paradox";
  }),
  shareability_factors: z.array(z.string()).transform(arr => 
    arr.filter(v => validShareabilityFactors.includes(v as any)) as (typeof validShareabilityFactors[number])[]
  ),
  suggested_title: z.string().min(1),
  topics: z.array(z.string()).optional().transform(v => v ?? []),
  content_type: z.string().transform(v => {
    if (validContentTypes.includes(v as any)) return v as typeof validContentTypes[number];
    return "insight";
  }),
  entities: z.array(z.string()).optional().transform(v => v ?? []),
});

const FinalRankingSchema = z.object({
  final_moments: z.array(FinalMomentSchema),
});

interface ViralMomentRaw {
  start_time: number;
  end_time: number;
  text: string;
  virality_score: number;
  pull_quote: string;
  hook_reason: string;
  hook_type: "numerical_framework" | "paradox" | "underdog_story" | "status_threat" | "tactical_playbook" | "vulnerable_confession";
  shareability_factors: ("contrarian" | "quantified" | "aspirational" | "vulnerable" | "actionable" | "emotional")[];
  suggested_title: string;
  topics: string[];
  content_type: "tactical" | "insight" | "story" | "confession" | "framework";
  entities: string[];
}

interface EpisodeMetadata {
  title?: string;
  guest?: string;
  podcastTitle?: string;
  duration?: number;
}

const MIN_CLIP_DURATION = 25;
const MAX_CLIP_DURATION = 60;
const INTRO_OUTRO_BUFFER = 90;
const MAX_FINAL_MOMENTS = 20;

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function buildSystemMessage(transcript: string, metadata: EpisodeMetadata): CachedSystemMessage[] {
  return [{
    type: "text",
    text: `You are an expert at identifying viral, shareable moments in podcast transcripts. You work across ALL podcast genres — business, entertainment, culture, comedy, news, sports, true crime, relationships, and more. Your job is to find the moments that would perform best as short-form clips on TikTok, Instagram Reels, and YouTube Shorts regardless of the podcast's genre.

EPISODE: ${metadata.title || "Unknown"}
PODCAST: ${metadata.podcastTitle || "Unknown"}
${metadata.guest ? `GUEST: ${metadata.guest}` : ""}
${metadata.duration ? `DURATION: ${Math.floor(metadata.duration / 60)} minutes` : ""}

TRANSCRIPT:
${transcript}`,
    cache_control: { type: "ephemeral" }
  }];
}

const PHASE_1_PROMPT = `Generate 15-25 candidate viral moments from this transcript.

CRITICAL RULES:
1. Skip first ${INTRO_OUTRO_BUFFER} seconds (intro) and last ${INTRO_OUTRO_BUFFER} seconds (outro)
2. Each clip must be ${MIN_CLIP_DURATION}-${MAX_CLIP_DURATION} seconds
3. Each clip must be SELF-CONTAINED - understandable without episode context

WHAT MAKES A GREAT CLIP (adapt to the podcast genre):

FOR BUSINESS/EDUCATIONAL PODCASTS:
1. TACTICAL FRAMEWORK — Concrete steps someone can apply ("The 3 things we always check...")
2. COUNTERINTUITIVE INSIGHT — "Everyone thinks X, but actually Y because..."
3. FRAMEWORK/MENTAL MODEL — Changes how you think about a problem

FOR ENTERTAINMENT/CULTURE/CONVERSATION PODCASTS:
1. HOT TAKE WITH REASONING — A strong, debatable opinion backed by logic
2. HILARIOUS OR WILD STORY — A story so entertaining people will share it
3. CULTURAL COMMENTARY — Sharp observation about society, trends, or current events
4. HEATED DEBATE MOMENT — Genuine disagreement with passion from both sides
5. RELATABLE REAL TALK — Something brutally honest that makes people say "facts"

FOR ANY GENRE:
1. VULNERABLE CONFESSION — Real failure/struggle with specific details
2. SURPRISING STORY WITH PAYOFF — Complete arc: setup → surprise → resolution
3. EMOTIONAL PEAK — A moment of genuine passion, anger, joy, or shock
4. QUOTABLE ONE-LINER — A line so sharp it could be a tweet

REJECT IMMEDIATELY:
- First/last 90 seconds of episode
- "In this episode we'll discuss..."
- Generic filler or small talk with no substance
- Incomplete thoughts that need more context
- Inside jokes that only regular listeners would understand

HOOK TYPES (identify one per moment):
- numerical_framework: Uses specific numbers/math to prove a point
- paradox: Resolves a seeming contradiction
- underdog_story: Against-the-odds success narrative
- status_threat: Challenges viewer's status/identity
- tactical_playbook: Step-by-step how-to
- vulnerable_confession: Raw, honest failure/struggle

SHAREABILITY FACTORS (tag all that apply):
- contrarian: Challenges mainstream view
- quantified: Uses specific numbers/data
- aspirational: Shows achievable success
- vulnerable: Shows real struggle/failure
- actionable: Can be applied immediately
- emotional: Triggers strong feelings

Return JSON:
{
  "candidates": [
    {
      "start_time": number (seconds, must be > ${INTRO_OUTRO_BUFFER}),
      "end_time": number (seconds, must be > start_time),
      "text": "Copy the FIRST SENTENCE of this moment VERBATIM from the transcript, then include the rest of the transcript text for the segment. Do NOT paraphrase, summarize, or reword — use the exact words from the transcript.",
      "virality_score": number (0-100, be harsh),
      "pull_quote": "The single best 8-12 word shareable line from this moment",
      "hook_reason": "2-3 sentences explaining the specific value",
      "hook_type": "numerical_framework" | "paradox" | "underdog_story" | "status_threat" | "tactical_playbook" | "vulnerable_confession",
      "shareability_factors": ["contrarian", "quantified", etc.],
      "suggested_title": "compelling title under 50 chars",
      "topics": ["topic1", "topic2"],
      "content_type": "tactical" | "insight" | "story" | "confession" | "framework",
      "entities": ["mentioned names/companies"]
    }
  ]
}`;

function buildPhase2Prompt(candidates: ViralMomentRaw[]): string {
  const candidateList = candidates.map((c, i) => 
    `[${i}] ${formatTimestamp(c.start_time)}-${formatTimestamp(c.end_time)} (${c.end_time - c.start_time}s)
    Type: ${c.content_type} | Hook: ${c.hook_type} | Score: ${c.virality_score}
    Title: ${c.suggested_title}
    Pull Quote: "${c.pull_quote}"
    Reason: ${c.hook_reason}
    Shareability: ${c.shareability_factors.join(", ")}
    Text: ${c.text.slice(0, 300)}...`
  ).join("\n\n");

  return `Review these candidates with scrutiny appropriate to the podcast genre.

CANDIDATES TO REVIEW:
${candidateList}

REJECTION CRITERIA (apply fairly):
- Does it make sense without episode context? If not, REJECT.
- Is the duration wrong (< ${MIN_CLIP_DURATION}s or > ${MAX_CLIP_DURATION}s)? REJECT.
- Does it start/end mid-sentence? REJECT.
- Is it truly boring with zero entertainment, educational, or emotional value? REJECT.
- Is it pure filler/small talk with no point? REJECT.

APPROVAL CRITERIA (genre-aware):
- Would someone share this clip on social media? If yes, approve.
- Does it provoke a reaction — laughter, shock, agreement, disagreement? If yes, bonus +10.
- Is there a hot take, strong opinion, or cultural commentary? If yes, bonus +10.
- Can someone take action based on this? If yes, bonus +10.
- Does it challenge a common belief with reasoning? If yes, bonus +10.
- Is there emotional/vulnerable content with resolution? If yes, bonus +5.
- Is it entertaining enough that you'd send it to a friend? If yes, approve.

Return JSON:
{
  "approved": [
    {
      "index": number,
      "revised_score": number (may differ from original),
      "revision_reason": "why you adjusted the score (optional)"
    }
  ],
  "rejected": [
    {
      "index": number,
      "rejection_reason": "specific reason for rejection"
    }
  ]
}`;
}

function buildPhase3Prompt(approvedCandidates: ViralMomentRaw[]): string {
  const candidateList = approvedCandidates.map((c, i) => 
    `[${i}] ${c.suggested_title} (${c.content_type}, hook: ${c.hook_type}, score: ${c.virality_score})
    Pull Quote: "${c.pull_quote}"
    ${c.hook_reason}
    Shareability: ${c.shareability_factors.join(", ")}
    Duration: ${c.end_time - c.start_time}s`
  ).join("\n\n");

  return `Keep all moments scoring 65+ that are not derivative of a higher-scoring moment. Remove duplicates and near-duplicates covering the same topic or angle. Return in order of virality score (highest first). Maximum ${MAX_FINAL_MOMENTS} moments.

APPROVED CANDIDATES:
${candidateList}

SELECTION CRITERIA:
1. Quality threshold: Keep ALL moments scoring 65+
2. Deduplication: If 2+ moments cover similar themes/topics/angles, keep only the highest-scoring
3. Diversity: Prefer a mix of content types (tactical, insight, story, etc.)
4. Shareability: Would someone actually share this on social media?

FINAL SCORING GUIDE:
95-100: Iconic clip — will go viral and be referenced widely
85-94: Excellent — highly shareable, strong reaction guaranteed
75-84: Strong content, worth sharing
65-74: Good, worth including if unique angle
< 65: Should have been rejected — do NOT include

Return JSON with the full moment data:
{
  "final_moments": [
    {
      "start_time": number,
      "end_time": number,
      "text": string,
      "virality_score": number,
      "pull_quote": string,
      "hook_reason": string,
      "hook_type": "numerical_framework" | "paradox" | "underdog_story" | "status_threat" | "tactical_playbook" | "vulnerable_confession",
      "shareability_factors": string[],
      "suggested_title": string,
      "topics": string[],
      "content_type": "tactical" | "insight" | "story" | "confession" | "framework",
      "entities": string[]
    }
  ]
}`;
}

export async function findViralMomentsWithClaude(
  segments: TranscriptSegment[],
  metadata: EpisodeMetadata = {}
): Promise<ViralMomentRaw[]> {
  if (!segments || segments.length === 0) {
    return [];
  }

  const sortedSegments = [...segments].sort((a, b) => a.startTime - b.startTime);
  
  const episodeStart = sortedSegments[0]?.startTime || 0;
  const lastSegment = sortedSegments[sortedSegments.length - 1];
  const episodeEnd = lastSegment ? lastSegment.startTime + 5 : 0;
  
  metadata.duration = episodeEnd - episodeStart;

  const transcript = sortedSegments
    .map((s) => `[${formatTimestamp(s.startTime)}] ${s.text}`)
    .join("\n");

  console.log(`[CLAUDE-VIRAL] Starting agentic detection for "${metadata.title}"`);
  console.log(`[CLAUDE-VIRAL] Episode: ${formatTimestamp(episodeStart)} - ${formatTimestamp(episodeEnd)}`);

  const systemMessage = buildSystemMessage(transcript, metadata);
  const conversation: ConversationMessage[] = [];

  // Phase 1: Generate candidates (with caching)
  console.log("[CLAUDE-VIRAL] Phase 1: Generating candidates (cached transcript)...");
  let candidates: ViralMomentRaw[];
  let phase1Response: string;
  
  try {
    conversation.push({ role: "user", content: PHASE_1_PROMPT });
    
    const result = await callClaudeWithConversation(
      systemMessage,
      conversation,
      CandidateMomentsSchema,
      { temperature: 0.8, maxTokens: 16384 }
    );
    
    candidates = result.result.candidates as ViralMomentRaw[];
    phase1Response = result.response;
    conversation.push({ role: "assistant", content: phase1Response });
    
    console.log(`[CLAUDE-VIRAL] Found ${candidates.length} initial candidates`);
  } catch (error) {
    console.error("[CLAUDE-VIRAL] Candidate generation failed:", error);
    throw error;
  }

  if (candidates.length === 0) {
    console.log("[CLAUDE-VIRAL] No candidates found");
    return [];
  }

  // Phase 2: Self-critique (reuses cached transcript)
  console.log("[CLAUDE-VIRAL] Phase 2: Self-critique (using cache)...");
  let approvedCandidates: ViralMomentRaw[];
  
  try {
    const phase2Prompt = buildPhase2Prompt(candidates);
    conversation.push({ role: "user", content: phase2Prompt });
    
    const critiqueResult = await callClaudeWithConversation(
      systemMessage,
      conversation,
      CritiquedMomentsSchema,
      { temperature: 0.3, maxTokens: 4096 }
    );
    
    const critique = critiqueResult.result;
    conversation.push({ role: "assistant", content: critiqueResult.response });

    console.log(`[CLAUDE-VIRAL] Approved: ${critique.approved.length}, Rejected: ${critique.rejected.length}`);

    for (const rejected of critique.rejected) {
      console.log(`[CLAUDE-VIRAL] Rejected [${rejected.index}]: ${rejected.rejection_reason}`);
    }

    approvedCandidates = critique.approved.map(approval => {
      const original = candidates[approval.index];
      return {
        ...original,
        virality_score: approval.revised_score,
        topics: original.topics || [],
        entities: original.entities || [],
      };
    });
  } catch (error) {
    console.error("[CLAUDE-VIRAL] Critique failed, using all candidates:", error);
    approvedCandidates = candidates;
  }

  if (approvedCandidates.length === 0) {
    console.log("[CLAUDE-VIRAL] All candidates rejected");
    return [];
  }

  // Phase 3: Final ranking with deduplication (reuses cached transcript)
  console.log("[CLAUDE-VIRAL] Phase 3: Final ranking with deduplication (using cache)...");
  let finalMoments: ViralMomentRaw[];
  
  try {
    const phase3Prompt = buildPhase3Prompt(approvedCandidates);
    conversation.push({ role: "user", content: phase3Prompt });
    
    const rankingResult = await callClaudeWithConversation(
      systemMessage,
      conversation,
      FinalRankingSchema,
      { temperature: 0.2, maxTokens: 4096 }
    );
    
    finalMoments = rankingResult.result.final_moments as ViralMomentRaw[];
    console.log(`[CLAUDE-VIRAL] Final selection: ${finalMoments.length} moments`);
  } catch (error) {
    console.error("[CLAUDE-VIRAL] Ranking failed, using approved candidates:", error);
    finalMoments = approvedCandidates
      .sort((a, b) => b.virality_score - a.virality_score)
      .slice(0, MAX_FINAL_MOMENTS);
  }

  // Validate and filter
  const validated = finalMoments.filter(m => {
    const duration = m.end_time - m.start_time;
    if (duration < MIN_CLIP_DURATION - 5 || duration > MAX_CLIP_DURATION + 10) {
      console.log(`[CLAUDE-VIRAL] Filtering out moment with duration ${duration}s`);
      return false;
    }
    if (m.start_time < episodeStart + INTRO_OUTRO_BUFFER) {
      console.log(`[CLAUDE-VIRAL] Filtering out intro moment at ${m.start_time}s`);
      return false;
    }
    return true;
  });

  console.log(`[CLAUDE-VIRAL] Snapping ${validated.length} moments to transcript positions...`);
  const { moments: snapped, snapResults } = snapMomentTimestamps(validated, sortedSegments);

  const confirmed: ViralMomentRaw[] = [];
  const uncertain: ViralMomentRaw[] = [];
  let rejectedCount = 0;

  for (let i = 0; i < snapResults.length; i++) {
    const sr = snapResults[i];
    const m = snapped[i];
    const verdictLabel = sr.verdict.toUpperCase();

    if (sr.verdict === "confirmed") {
      console.log(
        `[CLAUDE-VIRAL] [${verdictLabel}] "${m.suggested_title}" snapped: ` +
        `${formatTimestamp(sr.originalStartTime)} → ${formatTimestamp(m.start_time)} ` +
        `(drift: ${sr.driftSeconds}s, confidence: ${(sr.confidence * 100).toFixed(0)}%, source: ${sr.matchSource})`
      );
      confirmed.push(m);
    } else if (sr.verdict === "uncertain") {
      console.log(
        `[CLAUDE-VIRAL] [${verdictLabel}] "${m.suggested_title}" snapped: ` +
        `${formatTimestamp(sr.originalStartTime)} → ${formatTimestamp(m.start_time)} ` +
        `(drift: ${sr.driftSeconds}s, confidence: ${(sr.confidence * 100).toFixed(0)}%, source: ${sr.matchSource})`
      );
      uncertain.push(m);
    } else {
      console.log(
        `[CLAUDE-VIRAL] [${verdictLabel}] "${m.suggested_title}" — ` +
        `no transcript match found (confidence: ${(sr.confidence * 100).toFixed(0)}%). Likely hallucinated — dropping.`
      );
      rejectedCount++;
    }
  }

  const finalMomentsList = [...confirmed, ...uncertain];

  console.log(
    `[CLAUDE-VIRAL] Verdict: ${confirmed.length} confirmed, ${uncertain.length} uncertain, ${rejectedCount} rejected. ` +
    `Returning ${finalMomentsList.length} moments.`
  );
  return finalMomentsList;
}

export function convertToInsertMoments(
  episodeId: string,
  moments: ViralMomentRaw[]
): InsertViralMoment[] {
  return moments.map(m => ({
    episodeId,
    momentKind: "viral" as const,
    startTime: Math.floor(m.start_time),
    endTime: Math.floor(m.end_time),
    text: m.text,
    viralityScore: m.virality_score,
    pullQuote: m.pull_quote,
    hookReason: m.hook_reason,
    hookType: m.hook_type,
    shareabilityFactors: m.shareability_factors || [],
    contentType: m.content_type,
    suggestedTitle: m.suggested_title,
    topics: m.topics || [],
    entities: m.entities || [],
    clipStatus: "pending" as const,
    postingStatus: "draft" as const,
  }));
}
