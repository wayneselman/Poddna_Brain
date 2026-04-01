import { storage } from "../storage";
import { callClaudeJson, ClaudeError } from "../ai/claudeClient";
import type { Job, TranscriptSegment, InsertClaimInstance, InsertEpisodeZoomAnalysis, ZoomAnalysisPayload } from "@shared/schema";
import { zoomAnalysisPayloadSchema, zoomMeetings } from "@shared/schema";
import { z } from "zod";
import { db } from "../db";
import { eq } from "drizzle-orm";

export interface ZoomCallAnalysisJobResult {
  analysisId: string;
  claimInstancesCreated: number;
  buyerClaimsCount: number;
  gateChecksCount: number;
  decisionSignalsCount: number;
  riskFramesCount: number;
  sellerEmphasisCount: number;
}

const ANALYSIS_VERSION = 2;

// Known SignWell seller names for deterministic role mapping
const KNOWN_SELLERS = [
  "wayne selman",
  "wayne",
];

// Summary section markers to filter out
const SUMMARY_MARKERS = [
  "executive summary",
  "full summary",
  "business context",
  "current technology",
  "core challenge",
  "projected volume",
  "next steps",
  "action items",
  "key takeaways",
  "meeting notes",
];

// Patterns that indicate summary text (not dialogue)
const SUMMARY_PATTERNS = [
  /^\s*-\s*\d{2}:\d{2}/,  // "- 00:16" timestamp markers
  /^[A-Z][a-z]+\s+[A-Z][a-z]+\s+will\s+/,  // "Wayne Selman will prepare..."
  /;\s*[A-Z][a-z]+\s+[A-Z][a-z]+\s+will\s+/,  // "...; Wayne Selman will..."
  /^\d+,?\d*\s+envelopes\/year/i,  // "4,800 envelopes/year"
];

function isSummaryContent(segment: TranscriptSegment): boolean {
  const text = segment.text?.toLowerCase().trim() || "";
  const speaker = segment.speaker?.toLowerCase().trim() || "";
  
  // Check if speaker is a summary header
  if (SUMMARY_MARKERS.some(m => speaker.includes(m))) {
    return true;
  }
  
  // Check if text is a summary marker
  if (SUMMARY_MARKERS.some(m => text.includes(m) && text.length < 50)) {
    return true;
  }
  
  // Check for summary patterns
  if (SUMMARY_PATTERNS.some(p => p.test(segment.text || ""))) {
    return true;
  }
  
  // Skip empty speaker lines that are just names
  if (!text && speaker) {
    return true;
  }
  
  return false;
}

function isDialogue(segment: TranscriptSegment): boolean {
  const text = segment.text?.trim() || "";
  
  // Must have actual text content
  if (text.length < 5) return false;
  
  // Skip summary content
  if (isSummaryContent(segment)) return false;
  
  // Dialogue indicators: contains speech patterns
  const speechIndicators = [
    /\bum\b/i,
    /\buh\b/i,
    /\byeah\b/i,
    /\byou\b/i,
    /\bwe\b/i,
    /\bI\b/,
    /\bso\b/i,
    /\?$/,
    /\.\.\.$/,
  ];
  
  // If it has speech indicators, it's likely dialogue
  if (speechIndicators.some(p => p.test(text))) {
    return true;
  }
  
  // If speaker is a known person name (not a summary header), include it
  const speaker = segment.speaker?.toLowerCase() || "";
  const isPersonName = /^[a-z]+\s+[a-z]+$/i.test(segment.speaker || "") || 
                       speaker === "unknown" || 
                       speaker.includes("speaker");
  
  return isPersonName && text.length > 10;
}

function mapSpeakerToRole(speaker: string | null | undefined): "seller" | "buyer" | "unknown" {
  if (!speaker) return "unknown";
  const normalized = speaker.toLowerCase().trim();
  
  // Check if this is a known seller
  if (KNOWN_SELLERS.some(s => normalized.includes(s))) {
    return "seller";
  }
  
  // "Unknown" or "Speaker -1" defaults to buyer (more conservative)
  if (normalized === "unknown" || normalized.includes("speaker")) {
    return "buyer";
  }
  
  // Any other named person is assumed to be a buyer
  if (/^[a-z]+\s+[a-z]+$/i.test(speaker)) {
    return "buyer";
  }
  
  return "unknown";
}

// Check if a segment is a speaker attribution marker (empty text, person name as speaker)
function isSpeakerMarker(segment: TranscriptSegment): boolean {
  const text = segment.text?.trim() || "";
  const speaker = segment.speaker?.trim() || "";
  
  // Empty text with a person name as speaker = speaker attribution marker
  if (!text && /^[A-Za-z]+(\s+[A-Za-z]+)+$/.test(speaker)) {
    return true;
  }
  
  return false;
}

// Normalize segments by associating "Unknown" dialogue with previous speaker markers
function normalizeSegments(segments: TranscriptSegment[]): TranscriptSegment[] {
  const normalized: TranscriptSegment[] = [];
  let currentSpeaker: string | null = null;
  
  for (const seg of segments) {
    // If this is a speaker attribution marker, remember the speaker
    if (isSpeakerMarker(seg)) {
      currentSpeaker = seg.speaker;
      continue;
    }
    
    // If current segment has "Unknown" speaker and we have a remembered speaker, use it
    const speaker = seg.speaker?.toLowerCase() === "unknown" && currentSpeaker 
      ? currentSpeaker 
      : seg.speaker;
    
    normalized.push({
      ...seg,
      speaker: speaker,
    });
    
    // Reset speaker tracking after using it (each marker applies to following segment)
    // Actually, keep tracking - the marker applies until we see another marker
  }
  
  return normalized;
}

interface TranscriptStats {
  totalSegments: number;
  dialogueSegments: number;
  summarySegments: number;
  sellerUtterances: number;
  buyerUtterances: number;
  unknownUtterances: number;
  dialogueChars: number;
  summaryChars: number;
  speakerBreakdown: Record<string, number>;
}

function computeTranscriptStats(segments: TranscriptSegment[]): TranscriptStats {
  const stats: TranscriptStats = {
    totalSegments: segments.length,
    dialogueSegments: 0,
    summarySegments: 0,
    sellerUtterances: 0,
    buyerUtterances: 0,
    unknownUtterances: 0,
    dialogueChars: 0,
    summaryChars: 0,
    speakerBreakdown: {},
  };
  
  for (const seg of segments) {
    const speaker = seg.speaker || "empty";
    stats.speakerBreakdown[speaker] = (stats.speakerBreakdown[speaker] || 0) + 1;
    
    if (isDialogue(seg)) {
      stats.dialogueSegments++;
      stats.dialogueChars += (seg.text?.length || 0);
      
      const role = mapSpeakerToRole(seg.speaker);
      if (role === "seller") stats.sellerUtterances++;
      else if (role === "buyer") stats.buyerUtterances++;
      else stats.unknownUtterances++;
    } else {
      stats.summarySegments++;
      stats.summaryChars += (seg.text?.length || 0);
    }
  }
  
  return stats;
}

function buildZoomAnalysisPrompt(segments: TranscriptSegment[]): string {
  // Filter to dialogue only
  const dialogueSegments = segments.filter(isDialogue);
  
  const transcriptText = dialogueSegments
    .map((s) => {
      const timeLabel = s.startTime !== undefined && s.startTime !== null ? `[${s.startTime}s]` : "";
      const speaker = s.speaker ? `${s.speaker}: ` : "";
      const role = mapSpeakerToRole(s.speaker);
      const roleTag = role !== "unknown" ? ` [${role}]` : "";
      return `${timeLabel} ${speaker}${roleTag} ${s.text}`;
    })
    .join("\n");

  return `You are analyzing a private B2B Zoom sales or discovery call for SignWell (e-signature SaaS).

IMPORTANT CONTEXT:
- Speakers tagged [seller] are SignWell sales reps
- Speakers tagged [buyer] are prospects/customers
- Even "Unknown" speakers are likely BUYERS unless clearly pitching SignWell

This is NOT a podcast and NOT a narrative performance.
Do NOT summarize the conversation.
Do NOT produce action items or sentiment analysis.

Your task is to extract BELIEFS and DECISION SIGNALS expressed during the call.
Focus on what participants believe, fear, require, or test — not what they explain.

CRITICAL EXTRACTION RULE:
If the transcript contains buyer speech (non-seller dialogue), you MUST extract signals.
DO NOT return empty arrays when buyer signals exist. When uncertain about classification, still extract the item and mark speakerRole as "unknown".

Return structured JSON output matching this exact schema:

{
  "buyerClaims": [
    {
      "quote": "exact or near-exact quote from buyer",
      "startMs": 12000,
      "endMs": 15000,
      "speakerRole": "ops" | "it" | "exec" | "finance" | "unknown"
    }
  ],
  "gateChecks": [
    {
      "quote": "question or statement testing safety/eligibility",
      "startMs": 20000,
      "classification": "gate_check" | "persistent_concern" | "escalation_trigger"
    }
  ],
  "decisionSignals": [
    {
      "quote": "statement indicating decision ownership",
      "startMs": 30000,
      "signalType": "owner" | "validator" | "blocker" | "approver",
      "speakerRole": "ops" | "it" | "exec" | "finance" | "unknown"
    }
  ],
  "riskFrames": [
    {
      "quote": "language framing perceived risk",
      "startMs": 40000,
      "riskType": "cost" | "change" | "vendor" | "security" | "operational" | "reputational" | "other"
    }
  ],
  "sellerEmphasis": [
    {
      "phrase": "feature or concept seller emphasizes",
      "frequencyEstimate": 3,
      "timestamps": [10000, 25000, 45000]
    }
  ]
}

EXTRACTION GUIDELINES:

1. BUYER CLAIMS (most important)
Extract verbatim buyer statements that assert:
- constraints ("We can't have another vendor")
- objections ("That's too expensive for us")
- fears ("We're worried about data migration")
- requirements ("IT has to sign off")
- expectations ("This has to feel embedded")
- mental models ("We keep getting punished for growth")

Each claim must be a direct or near-direct quote, at least 10 words when possible.

IMPORTANT: The transcript shows timestamps in seconds like [15s], but output startMs and endMs in MILLISECONDS.
For example, if a quote is at [15s], output startMs: 15000.

2. GATE CHECKS VS PERSISTENT CONCERNS
Identify questions/statements that test safety or eligibility (SSO, SOC 2, SMS, compliance).
Classify as:
- gate_check: Asked once, not revisited
- persistent_concern: Reappears or anchors discussion
- escalation_trigger: Leads to next-step validation

3. DECISION OWNERSHIP SIGNALS
Extract statements indicating:
- who owns the workflow
- who validates technical/compliance aspects
- who approves commercially
- who could block progress

4. RISK FRAMING
Identify language that frames perceived risk:
- cost risk ("surprised by the pricing")
- change risk ("concerned about training")
- vendor risk ("don't want another tool")
- security risk ("worried about compliance")
- operational risk ("can't disrupt workflow")
- reputational risk ("can't be seen using this")

5. SELLER EMPHASIS
List phrases, features, or concepts the seller emphasizes repeatedly.
Do NOT evaluate effectiveness — simply record what the seller stresses.

CONSTRAINTS:
- Do NOT summarize the call
- Do NOT infer deal outcomes
- Do NOT assume intent beyond what is stated
- Include timestamps (startMs) when they can be determined from context
- Attribute speaker roles where identifiable

CRITICAL OUTPUT RULES:
- Return COMPLETE, valid JSON with all arrays properly closed
- Do NOT truncate or abbreviate the output
- If you find many signals, include ALL of them
- Ensure every opening { and [ has a matching } and ]

JSON ONLY. No explanations. No markdown code blocks.

TRANSCRIPT:
${transcriptText}`;
}

const ZoomAnalysisResponseSchema = z.object({
  buyerClaims: z.array(z.object({
    quote: z.string(),
    startMs: z.number().optional(),
    endMs: z.number().optional(),
    speakerRole: z.string().optional(),
  })).optional().transform(v => v ?? []),
  gateChecks: z.array(z.object({
    quote: z.string(),
    startMs: z.number().optional(),
    classification: z.enum(["gate_check", "persistent_concern", "escalation_trigger"]).optional().transform(v => v ?? "gate_check"),
  })).optional().transform(v => v ?? []),
  decisionSignals: z.array(z.object({
    quote: z.string(),
    startMs: z.number().optional(),
    signalType: z.enum(["owner", "validator", "blocker", "approver"]).optional().transform(v => v ?? "owner"),
    speakerRole: z.string().optional(),
  })).optional().transform(v => v ?? []),
  riskFrames: z.array(z.object({
    quote: z.string(),
    startMs: z.number().optional(),
    riskType: z.enum(["cost", "change", "vendor", "security", "operational", "reputational", "other"]).optional().transform(v => v ?? "other"),
  })).optional().transform(v => v ?? []),
  sellerEmphasis: z.array(z.object({
    phrase: z.string(),
    frequencyEstimate: z.number().optional(),
    timestamps: z.union([z.array(z.number()), z.number()])
      .optional()
      .transform(v => v === undefined ? undefined : Array.isArray(v) ? v : [v]),
  })).optional().transform(v => v ?? []),
});

function mapSpeakerRole(role?: string): string {
  if (!role) return "unknown";
  const normalized = role.toLowerCase();
  if (normalized.includes("ops") || normalized.includes("operations")) return "buyer_ops";
  if (normalized.includes("it") || normalized.includes("tech")) return "buyer_it";
  if (normalized.includes("exec") || normalized.includes("ceo") || normalized.includes("cto") || normalized.includes("vp")) return "buyer_exec";
  if (normalized.includes("finance") || normalized.includes("cfo") || normalized.includes("accounting")) return "buyer_finance";
  if (normalized.includes("seller") || normalized.includes("sales") || normalized.includes("rep") || normalized.includes("ae")) return "seller";
  if (normalized.includes("buyer") || normalized.includes("prospect") || normalized.includes("customer")) return "buyer_unknown";
  return "unknown";
}

export async function handleAnalyzeZoomCallJob(
  job: Job,
  onProgress?: (message: string, percentage: number) => void
): Promise<ZoomCallAnalysisJobResult> {
  console.log(`[ANALYZE-ZOOM-CALL] Starting Zoom call analysis job ${job.id}`);

  const jobPayload = job.result as { episodeId?: string } | null;
  let episodeId: string | null = null;

  if (jobPayload?.episodeId) {
    episodeId = jobPayload.episodeId;
  } else if (job.episodeSourceId) {
    let source;
    try {
      source = await storage.getEpisodeSource(job.episodeSourceId);
    } catch (err: any) {
      throw new ClaudeError(`Storage error fetching episode source: ${err.message}`, true);
    }
    if (!source) {
      throw new ClaudeError(`Episode source not found: ${job.episodeSourceId}`, false);
    }
    episodeId = source.episodeId;
  }

  if (!episodeId) {
    throw new ClaudeError("Job missing episodeId in payload or episodeSourceId", false);
  }

  let episode;
  try {
    episode = await storage.getEpisode(episodeId);
  } catch (err: any) {
    throw new ClaudeError(`Storage error fetching episode: ${err.message}`, true);
  }

  if (!episode) {
    throw new ClaudeError(`Episode not found: ${episodeId}`, false);
  }

  if (episode.sourceType !== "zoom") {
    throw new ClaudeError(`Episode ${episode.id} is not a Zoom call (sourceType: ${episode.sourceType})`, false);
  }

  onProgress?.("Loading transcript segments...", 10);

  let segments: TranscriptSegment[];
  try {
    segments = await storage.getSegmentsByEpisode(episodeId);
  } catch (err: any) {
    throw new ClaudeError(`Storage error fetching segments: ${err.message}`, true);
  }

  if (segments.length === 0) {
    throw new ClaudeError(`No transcript segments found for episode ${episodeId}`, false);
  }

  // Normalize segments to properly associate speakers with dialogue
  // This handles cases where speaker names are in separate empty segments
  const normalizedSegments = normalizeSegments(segments);
  console.log(`[ANALYZE-ZOOM-CALL] Normalized ${segments.length} segments to ${normalizedSegments.length} (removed speaker attribution markers)`);

  // Compute and log transcript stats for debugging
  const stats = computeTranscriptStats(normalizedSegments);
  console.log(`[ANALYZE-ZOOM-CALL] Transcript stats for episode ${episode.id}:`, {
    totalSegments: stats.totalSegments,
    dialogueSegments: stats.dialogueSegments,
    summarySegments: stats.summarySegments,
    sellerUtterances: stats.sellerUtterances,
    buyerUtterances: stats.buyerUtterances,
    unknownUtterances: stats.unknownUtterances,
    dialogueChars: stats.dialogueChars,
    summaryChars: stats.summaryChars,
  });
  console.log(`[ANALYZE-ZOOM-CALL] Speaker breakdown:`, stats.speakerBreakdown);

  if (stats.dialogueSegments === 0) {
    throw new ClaudeError(`No dialogue found after filtering summary content. Total segments: ${stats.totalSegments}`, false);
  }

  if (stats.dialogueChars < stats.summaryChars * 0.5) {
    console.warn(`[ANALYZE-ZOOM-CALL] Warning: Dialogue content (${stats.dialogueChars} chars) is much smaller than summary content (${stats.summaryChars} chars). Filtering may be too aggressive or transcript is summary-heavy.`);
  }

  onProgress?.(`Analyzing ${stats.dialogueSegments} dialogue segments (filtered from ${stats.totalSegments} total)...`, 20);

  const prompt = buildZoomAnalysisPrompt(normalizedSegments);

  interface ParsedAnalysisResult {
    buyerClaims: Array<{ quote: string; startMs?: number; endMs?: number; speakerRole?: string }>;
    gateChecks: Array<{ quote: string; startMs?: number; classification: "gate_check" | "persistent_concern" | "escalation_trigger" }>;
    decisionSignals: Array<{ quote: string; startMs?: number; signalType: "owner" | "validator" | "blocker" | "approver"; speakerRole?: string }>;
    riskFrames: Array<{ quote: string; startMs?: number; riskType: "cost" | "change" | "vendor" | "security" | "operational" | "reputational" | "other" }>;
    sellerEmphasis: Array<{ phrase: string; frequencyEstimate?: number; timestamps?: number[] }>;
  }
  
  let analysisResult: ParsedAnalysisResult;
  try {
    console.log(`[ANALYZE-ZOOM-CALL] Calling Claude for analysis (prompt length: ${prompt.length} chars)`);
    const rawResult = await callClaudeJson(prompt, ZoomAnalysisResponseSchema, { 
      model: "claude-sonnet-4-5",
      temperature: 0.3, 
      maxTokens: 16384 
    });
    
    console.log(`[ANALYZE-ZOOM-CALL] Raw result from Claude:`, JSON.stringify(rawResult, null, 2).slice(0, 1000));
    console.log(`[ANALYZE-ZOOM-CALL] buyerClaims count: ${rawResult.buyerClaims?.length ?? 0}`);
    
    analysisResult = {
      buyerClaims: (rawResult.buyerClaims ?? []).map(c => ({ ...c })),
      gateChecks: (rawResult.gateChecks ?? []).map(c => ({ 
        quote: c.quote, 
        startMs: c.startMs, 
        classification: c.classification ?? "gate_check" 
      })),
      decisionSignals: (rawResult.decisionSignals ?? []).map(c => ({ 
        quote: c.quote, 
        startMs: c.startMs, 
        signalType: c.signalType ?? "owner", 
        speakerRole: c.speakerRole 
      })),
      riskFrames: (rawResult.riskFrames ?? []).map(c => ({ 
        quote: c.quote, 
        startMs: c.startMs, 
        riskType: c.riskType ?? "other" 
      })),
      sellerEmphasis: (rawResult.sellerEmphasis ?? []).map(c => ({ ...c })),
    };
  } catch (err: any) {
    if (err instanceof ClaudeError) throw err;
    throw new ClaudeError(`Claude API error: ${err.message}`, true);
  }

  onProgress?.("Saving analysis results...", 70);

  const payload: ZoomAnalysisPayload = {
    buyerClaims: analysisResult.buyerClaims.map(c => ({
      quote: c.quote,
      startMs: c.startMs,
      endMs: c.endMs,
      speakerRole: c.speakerRole,
    })),
    gateChecks: analysisResult.gateChecks.map(c => ({
      quote: c.quote,
      startMs: c.startMs,
      classification: c.classification,
    })),
    decisionSignals: analysisResult.decisionSignals.map(c => ({
      quote: c.quote,
      startMs: c.startMs,
      signalType: c.signalType,
      speakerRole: c.speakerRole,
    })),
    riskFrames: analysisResult.riskFrames.map(c => ({
      quote: c.quote,
      startMs: c.startMs,
      riskType: c.riskType,
    })),
    sellerEmphasis: analysisResult.sellerEmphasis.map(c => ({
      phrase: c.phrase,
      frequencyEstimate: c.frequencyEstimate,
      timestamps: c.timestamps,
    })),
  };

  const analysisInsert: InsertEpisodeZoomAnalysis = {
    episodeId: episode.id,
    analysisVersion: ANALYSIS_VERSION,
    payload: payload,
  };

  let analysisRecord;
  try {
    analysisRecord = await storage.upsertEpisodeZoomAnalysis(analysisInsert);
  } catch (err: any) {
    throw new ClaudeError(`Storage error saving analysis: ${err.message}`, true);
  }

  onProgress?.("Creating claim instances for rollups...", 85);

  const claimInstances: InsertClaimInstance[] = [];

  for (const claim of analysisResult.buyerClaims) {
    claimInstances.push({
      episodeId: episode.id,
      sourceType: "zoom",
      speakerRole: mapSpeakerRole(claim.speakerRole),
      claimText: claim.quote,
      startMs: claim.startMs || null,
      endMs: claim.endMs || null,
      claimKind: "buyer_claim",
      claimMeta: { speakerRole: claim.speakerRole },
    });
  }

  for (const check of analysisResult.gateChecks) {
    claimInstances.push({
      episodeId: episode.id,
      sourceType: "zoom",
      speakerRole: "buyer_unknown",
      claimText: check.quote,
      startMs: check.startMs || null,
      endMs: null,
      claimKind: "gate_check",
      claimMeta: { classification: check.classification },
    });
  }

  for (const signal of analysisResult.decisionSignals) {
    claimInstances.push({
      episodeId: episode.id,
      sourceType: "zoom",
      speakerRole: mapSpeakerRole(signal.speakerRole),
      claimText: signal.quote,
      startMs: signal.startMs || null,
      endMs: null,
      claimKind: "decision_signal",
      claimMeta: { signalType: signal.signalType, speakerRole: signal.speakerRole },
    });
  }

  for (const risk of analysisResult.riskFrames) {
    claimInstances.push({
      episodeId: episode.id,
      sourceType: "zoom",
      speakerRole: "buyer_unknown",
      claimText: risk.quote,
      startMs: risk.startMs || null,
      endMs: null,
      claimKind: "risk_frame",
      claimMeta: { riskType: risk.riskType },
    });
  }

  for (const emphasis of analysisResult.sellerEmphasis) {
    claimInstances.push({
      episodeId: episode.id,
      sourceType: "zoom",
      speakerRole: "seller",
      claimText: emphasis.phrase,
      startMs: emphasis.timestamps?.[0] || null,
      endMs: null,
      claimKind: "seller_emphasis",
      claimMeta: { frequencyEstimate: emphasis.frequencyEstimate, timestamps: emphasis.timestamps },
    });
  }

  let createdCount = 0;
  try {
    await storage.deleteClaimInstancesByEpisode(episode.id);
    createdCount = await storage.createClaimInstances(claimInstances);
  } catch (err: any) {
    console.error(`[ANALYZE-ZOOM-CALL] Warning: Failed to save claim instances: ${err.message}`);
  }

  onProgress?.("Extracting meeting metadata...", 90);

  try {
    const zoomMeetingId = episode.externalEpisodeId;
    if (zoomMeetingId) {
      const [meetingRow] = await db
        .select({ companyName: zoomMeetings.companyName, contactName: zoomMeetings.contactName })
        .from(zoomMeetings)
        .where(eq(zoomMeetings.zoomMeetingId, zoomMeetingId))
        .limit(1);

      if (meetingRow && (!meetingRow.companyName || !meetingRow.contactName)) {
        const dialogueSegments = normalizedSegments.filter(isDialogue);
        const sampleText = dialogueSegments
          .slice(0, 40)
          .map(s => `${s.speaker || "Unknown"}: ${s.text}`)
          .join("\n");

        const metaPrompt = `Extract the company name and primary contact person from this B2B sales call transcript excerpt.
The seller is from SignWell. Identify the BUYER's company name and the primary buyer contact name.

Rules:
- Do NOT return "SignWell" as the company — we want the prospect/buyer company
- If the topic/title mentions a company name, prefer that
- If you cannot determine a field, return null for it
- Contact name should be the primary buyer participant (not the seller)

Meeting topic: ${episode.title || "Unknown"}

Transcript excerpt:
${sampleText}

Return JSON: {"companyName": "string or null", "contactName": "string or null"}`;

        const MetaSchema = z.object({
          companyName: z.string().nullable(),
          contactName: z.string().nullable(),
        });

        const metaResult = await callClaudeJson(metaPrompt, MetaSchema, {
          model: "claude-sonnet-4-5",
          temperature: 0.1,
          maxTokens: 256,
        });

        const metaUpdate: Record<string, any> = {};
        if (!meetingRow.companyName && metaResult.companyName) {
          metaUpdate.companyName = metaResult.companyName;
        }
        if (!meetingRow.contactName && metaResult.contactName) {
          metaUpdate.contactName = metaResult.contactName;
        }

        if (Object.keys(metaUpdate).length > 0) {
          await db
            .update(zoomMeetings)
            .set(metaUpdate)
            .where(eq(zoomMeetings.zoomMeetingId, zoomMeetingId));
          console.log(`[ANALYZE-ZOOM-CALL] Auto-extracted metadata for ${zoomMeetingId}:`, metaUpdate);
        }
      }
    }
  } catch (metaErr: any) {
    console.error(`[ANALYZE-ZOOM-CALL] Warning: Failed to extract meeting metadata: ${metaErr.message}`);
  }

  try {
    // Only queue build_selman_pack if we have a company name — without it the job will permanently fail
    let canBuildSelman = false;
    if (episode.externalEpisodeId) {
      const [latestMeeting] = await db
        .select({ companyName: zoomMeetings.companyName })
        .from(zoomMeetings)
        .where(eq(zoomMeetings.zoomMeetingId, episode.externalEpisodeId))
        .limit(1);
      canBuildSelman = !!latestMeeting?.companyName;
    }

    if (canBuildSelman) {
      const selmanPackJob = await storage.createJob({
        type: "build_selman_pack",
        episodeSourceId: job.episodeSourceId,
        result: { episodeId: episode.id },
      });
      console.log(`[ANALYZE-ZOOM-CALL] Auto-queued build_selman_pack job ${selmanPackJob.id} for episode ${episode.id}`);
    } else {
      console.log(`[ANALYZE-ZOOM-CALL] Skipping build_selman_pack for episode ${episode.id} — no company name resolved`);
    }
  } catch (chainErr: any) {
    console.error(`[ANALYZE-ZOOM-CALL] Failed to queue build_selman_pack job: ${chainErr.message}`);
  }

  onProgress?.("Zoom call analysis complete!", 100);

  console.log(`[ANALYZE-ZOOM-CALL] Analysis complete for episode ${episode.id}:`, {
    buyerClaims: analysisResult.buyerClaims.length,
    gateChecks: analysisResult.gateChecks.length,
    decisionSignals: analysisResult.decisionSignals.length,
    riskFrames: analysisResult.riskFrames.length,
    sellerEmphasis: analysisResult.sellerEmphasis.length,
    claimInstancesCreated: createdCount,
  });

  // Verification: confirm data was actually saved
  const verifyInstances = await storage.getClaimInstancesByEpisode(episode.id);
  if (verifyInstances.length !== createdCount) {
    console.error(`[ANALYZE-ZOOM-CALL] VERIFICATION FAILED: Expected ${createdCount} claim instances but found ${verifyInstances.length}`);
  } else {
    console.log(`[ANALYZE-ZOOM-CALL] VERIFICATION PASSED: ${verifyInstances.length} claim instances confirmed in database`);
  }

  return {
    analysisId: analysisRecord.id,
    claimInstancesCreated: createdCount,
    buyerClaimsCount: analysisResult.buyerClaims.length,
    gateChecksCount: analysisResult.gateChecks.length,
    decisionSignalsCount: analysisResult.decisionSignals.length,
    riskFramesCount: analysisResult.riskFrames.length,
    sellerEmphasisCount: analysisResult.sellerEmphasis.length,
  };
}
